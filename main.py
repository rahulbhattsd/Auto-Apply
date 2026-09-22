"""
main.py — AutoApply Agent orchestrator.

Entry point. Run with: python main.py

Responsibilities:
- Load config.yaml, profile.yaml, resume_base.json
- Init SQLite DB (core.db)
- Scrape ~50 jobs (core.scraper), insert as 'queued' (dedupe via jd_hash)
- For each queued job: trim JD -> tailor resume (core.llm) -> detect ATS
  -> launch Playwright -> dispatch to ats/*.py handler -> handle OTP /
  CAPTCHA (barriers/*.py) -> update DB status -> random delay
- Send daily summary via Telegram (core.notifier)
"""

import asyncio
import hashlib
import json
import random
import sys
import time
from pathlib import Path

import yaml
from loguru import logger
from playwright.async_api import async_playwright
from playwright_stealth import Stealth  # ✅
# use: await Stealth().apply_stealth_async(page)

from core import db, llm, scraper, notifier, cache
from ats import greenhouse, lever, linkedin, workday, generic
from barriers import human_handoff

CONFIG_PATH = "config.yaml"
PROFILE_PATH = "profile.yaml"
RESUME_PATH = "resume_base.json"

ATS_URL_MAP = {
    "greenhouse.io": "greenhouse",
    "lever.co": "lever",
    "linkedin.com/jobs": "linkedin",
    "myworkdayjobs": "workday",
    "icims": "generic",
    "taleo": "generic",
    "smartrecruiters": "generic",
}

HANDLER_MAP = {
    "greenhouse": greenhouse.GreenhouseHandler,
    "lever": lever.LeverHandler,
    "linkedin": linkedin.LinkedInHandler,
    "workday": workday.WorkdayHandler,
    "generic": generic.GenericHandler,
}


def load_config(path: str = CONFIG_PATH) -> dict:
    p = Path(path)
    if not p.exists():
        print(
            f"[!] {path} not found. Copy config.example.yaml -> {path} "
            "and fill in your Groq / Telegram / Gmail details."
        )
        sys.exit(1)
    with open(p, "r") as f:
        return yaml.safe_load(f)


def load_profile(path: str = PROFILE_PATH) -> dict:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"{path} not found — fill in profile.yaml first.")
    with open(p, "r") as f:
        return yaml.safe_load(f)


def load_resume(path: str = RESUME_PATH) -> dict:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"{path} not found — fill in resume_base.json first.")
    with open(p, "r") as f:
        return json.load(f)


def trim_jd(text: str, max_words: int = 400) -> str:
    if not text:
        return ""
    return " ".join(text.split()[:max_words])


def detect_ats_by_url(url: str) -> str | None:
    url_l = url.lower()
    for needle, ats in ATS_URL_MAP.items():
        if needle in url_l:
            return ats
    return None


def pick_handler(ats_type: str, page, job: dict, profile: dict, resume: dict):
    handler_cls = HANDLER_MAP.get(ats_type, generic.GenericHandler)
    return handler_cls(page, job, profile, resume)


def merge(resume_json: dict, patch: dict) -> dict:
    """Shallow-merge a JSON patch from the LLM into the base resume."""
    merged = json.loads(json.dumps(resume_json))  # deep copy
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


async def run_one_job(job: dict, pool, config: dict, profile: dict, resume_json: dict) -> dict:
    start = time.monotonic()
    job_id = job["id"]
    company = job["company"]
    role = job["role"]
    url = job["url"]

    # --- tailor resume (LLM call 1/2, cached) ---
    trimmed_jd = trim_jd(job.get("jd_text", ""))
    prompt_key = cache.hash_prompt(trimmed_jd + json.dumps(resume_json, sort_keys=True))
    cached = cache.get(prompt_key)
    if cached:
        patch = json.loads(cached)
    else:
        patch = llm.tailor_resume(trimmed_jd, resume_json, pool)
        cache.set(prompt_key, json.dumps(patch))
    tailored = merge(resume_json, patch)

    resume_dir = Path("profiles/resumes")
    resume_dir.mkdir(parents=True, exist_ok=True)
    resume_path = resume_dir / f"job_{job_id}.json"
    with open(resume_path, "w") as f:
        json.dump(tailored, f, indent=2)

    # --- detect ATS ---
    ats_type = detect_ats_by_url(url) or "generic"

    settings = config.get("settings", {})
    headless = settings.get("headless", True)

    result = {"status": "failed", "reason": "unknown error"}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        page = await browser.new_page()
        await stealth_async(page)
        try:
            await page.goto(url, timeout=60000)
            handler = pick_handler(ats_type, page, job, profile, tailored)
            result = await handler.apply()

            if result["status"] == "applied":
                db.update_job_status(job_id, "applied", resume_path=str(resume_path))
                await notifier.notify_job_applied(job_id, company, role)

            elif result["status"] == "stuck":
                shot_dir = Path("profiles/screenshots")
                shot_dir.mkdir(parents=True, exist_ok=True)
                shot_path = shot_dir / f"job_{job_id}.png"
                await page.screenshot(path=str(shot_path))
                await human_handoff.pause_for_human(job_id, result.get("reason"), str(shot_path))

                for _ in range(90):  # poll up to 15 min (90 * 10s)
                    if human_handoff.should_resume(job_id):
                        try:
                            await page.goto(url, timeout=60000)
                            await asyncio.sleep(2)
                        except Exception as e:
                            logger.warning(f"Reload before retry failed: {e}")
                        result = await handler.apply()
                        break
                    if human_handoff.should_skip(job_id):
                        result = {"status": "skipped", "reason": "user skipped"}
                        break
                    await asyncio.sleep(10)

                db.update_job_status(
                    job_id,
                    result["status"],
                    stuck_reason=result.get("reason"),
                    screenshot_path=str(shot_path),
                )

            else:
                db.update_job_status(job_id, "failed", stuck_reason=result.get("reason"))

        except Exception as e:
            result = {"status": "failed", "reason": str(e)}
            db.update_job_status(job_id, "failed", stuck_reason=str(e))
            logger.exception(f"Job {job_id} ({company} - {role}) raised an exception")
        finally:
            await browser.close()

    elapsed = time.monotonic() - start
    logger.info(
        f"id={job_id} company={company!r} role={role!r} "
        f"status={result.get('status')} elapsed_sec={elapsed:.1f}"
    )
    return result


async def main() -> None:
    config = load_config()
    profile = load_profile()
    resume_json = load_resume()

    db.init_db()

    groq_cfg = config.get("groq", {})
    pool = llm.GroqKeyPool(
        keys=groq_cfg.get("keys", []),
        cooldown_seconds=groq_cfg.get("cooldown_seconds", 60),
    )

    settings = config.get("settings", {})
    target = settings.get("target_jobs_per_day", 50)
    min_delay = settings.get("min_delay_sec", 120)
    max_delay = settings.get("max_delay_sec", 300)

    await notifier.notify_agent_started(target)

    # --- scrape + insert (dedupe via jd_hash) ---
    scraped = scraper.scrape_jobs(profile, target_count=target)
    for j in scraped:
        jd_text = j.get("jd_text", "")
        jd_hash = hashlib.sha256(jd_text.encode("utf-8")).hexdigest()
        db.insert_job(
            company=j["company"],
            role=j["role"],
            url=j["url"],
            jd_text=jd_text,
            jd_hash=jd_hash,
        )

    # --- main apply loop (apply_concurrency=1 -> sequential) ---
    try:
        for job in db.get_queued_jobs(limit=target):
            await run_one_job(job, pool, config, profile, resume_json)
            await asyncio.sleep(random.uniform(min_delay, max_delay))

    except (asyncio.CancelledError, KeyboardInterrupt):
        logger.warning("Shutdown requested — stopping loop.")

    finally:
        stats = db.get_today_stats()
        await notifier.notify_daily_summary(
            stats.get("applied", 0), stats.get("stuck", 0), stats.get("failed", 0)
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBye.")