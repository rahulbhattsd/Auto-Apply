"""
main.py — AutoApply Agent orchestrator.

Entry point. Run with: python main.py
"""

import asyncio
import hashlib
import json
import random
import sys
from pathlib import Path

import yaml
from playwright.async_api import async_playwright

from core import db
from core.scraper import scrape_jobs
from core.llm import GroqPool
from core.resume_selector import pick_resume
from core.notifier import (
    notify_agent_started,
    notify_job_applied,
    notify_daily_summary,
)
from barriers.human_handoff import pause_for_human, should_resume, should_skip
from ats.greenhouse import GreenhouseHandler
from ats.lever import LeverHandler
from ats.linkedin import LinkedInHandler
from ats.workday import WorkdayHandler
from ats.generic import GenericHandler


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


# ---------------------------------------------------------------------------
# Config / profile / resume loaders
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def trim_jd(text: str, max_words: int = 400) -> str:
    if not text:
        return ""
    return " ".join(text.split()[:max_words])


def detect_ats_by_url(url: str) -> str | None:
    url_l = url.lower()
    for needle, ats in ATS_URL_MAP.items():
        if needle in url_l:
            return ats
    return "generic"


def merge(resume_json: dict, patch: dict) -> dict:
    """Shallow-merge a JSON patch from the LLM into the base resume."""
    merged = json.loads(json.dumps(resume_json))  # deep copy
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


def pick_handler(ats_type: str, page, job, profile, resume, pool=None):
    handlers = {
        "greenhouse": GreenhouseHandler,
        "lever": LeverHandler,
        "linkedin": LinkedInHandler,
        "workday": WorkdayHandler,
    }
    cls = handlers.get(ats_type.lower(), GenericHandler)
    return cls(page, job, profile, resume, pool=pool)


# ---------------------------------------------------------------------------
# Single-job runner
# ---------------------------------------------------------------------------

async def run_one_job(job: dict, profile: dict, resume: dict, pool, screenshot_path: str | None = None) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        from playwright_stealth import stealth_async
        await stealth_async(page)
        try:
            await page.goto(job["url"], timeout=30000)
            ats_type = detect_ats_by_url(job["url"])
            handler = pick_handler(ats_type, page, job, profile, resume, pool=pool)
            result = await handler.apply()
            if result.get("status") == "stuck" and screenshot_path:
                await page.screenshot(path=screenshot_path, full_page=True)
            return result
        finally:
            await browser.close()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def main():
    config = load_config()
    profile = load_profile()
    resume = load_resume()
    db.init_db()

    pool = GroqPool(
        api_keys=config["groq"]["keys"],
        model=config["groq"].get("model", "llama-3.3-70b-versatile"),
    )

    jobs = await scrape_jobs(profile, target_count=50)
    await notify_agent_started(len(jobs))

    applied = stuck = failed = 0
    for job in jobs:
        delay = random.randint(120, 300)
        print(f"[i] Sleeping {delay}s before next application...")
        await asyncio.sleep(delay)

        # Pause check between jobs
        if Path("PAUSE_FLAG").exists():
            print("Paused. Waiting for /start_agent...")
            while Path("PAUSE_FLAG").exists():
                await asyncio.sleep(5)

        # Insert job into DB (idempotent via jd_hash UNIQUE)
        jd_text = job.get("jd_text", "")
        jd_hash = hashlib.sha256(jd_text.encode("utf-8")).hexdigest()
        job_id = db.insert_job(
            company=job["company"],
            role=job["role"],
            url=job["url"],
            jd_text=jd_text,
            jd_hash=jd_hash,
        )

        # If insert was ignored (job already exists), look it up by jd_hash
        if not job_id:
            job_id = db.get_job_id_by_hash(jd_hash)
        if not job_id:
            print(f"[!] Could not resolve job_id for {job['url']}, skipping.")
            continue
        job["id"] = job_id

        # Pick the right resume PDF for this job title
        resume["resume_path"] = pick_resume(job["role"])
        screenshot = f"logs/stuck_{job_id}.png"
        Path("logs").mkdir(exist_ok=True)

        try:
            result = await run_one_job(job, profile, resume, pool, screenshot_path=screenshot)
        except Exception as e:
            print(f"[!] Job #{job_id} crashed: {e}")
            failed += 1
            db.update_job_status(job_id, "failed", stuck_reason=str(e))
            continue

        status = result.get("status")

        if status == "applied":
            applied += 1
            db.update_job_status(job_id, "applied")
            await notify_job_applied(job_id, job["company"], job["role"])

        elif status == "stuck":
            stuck += 1
            await pause_for_human(
                job_id, result.get("reason", "unknown"), screenshot
            )
            # Wait for human to /resume_<id> or /skip_<id>
            while True:
                if should_resume(job_id):
                    db.update_job_status(job_id, "queued")
                    break
                if should_skip(job_id):
                    db.update_job_status(job_id, "skipped")
                    break
                await asyncio.sleep(5)

        else:
            failed += 1
            db.update_job_status(
                job_id, "failed", stuck_reason=result.get("reason")
            )

    await notify_daily_summary(applied, stuck, failed)


if __name__ == "__main__":
    asyncio.run(main())
