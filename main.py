"""
main.py — AutoApply Agent orchestrator.
Target: 50 successfully applied jobs per run.
Any OTP/CAPTCHA/login-wall job is marked 'blocked' and skipped immediately —
no waiting, no manual OTP entry, no email reading.
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
    notify_job_stuck,
    notify_daily_summary,
)
from ats.greenhouse import GreenhouseHandler
from ats.lever import LeverHandler
from ats.linkedin import LinkedInHandler
from ats.workday import WorkdayHandler
from ats.generic import GenericHandler

CONFIG_PATH = "config.yaml"
PROFILE_PATH = "profile.yaml"
RESUME_PATH = "resume_base.json"
TARGET_APPLIED = 50

ATS_URL_MAP = {
    "greenhouse.io": "greenhouse",
    "lever.co": "lever",
    "linkedin.com/jobs": "linkedin",
    "myworkdayjobs": "workday",
    "icims": "generic",
    "taleo": "generic",
    "smartrecruiters": "generic",
}


def load_config(path: str = CONFIG_PATH) -> dict:
    p = Path(path)
    if not p.exists():
        print(f"[!] {path} not found. Fill in your Groq / Telegram details.")
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


def detect_ats_by_url(url: str) -> str:
    url_l = url.lower()
    for needle, ats in ATS_URL_MAP.items():
        if needle in url_l:
            return ats
    return "generic"


def pick_handler(ats_type: str, page, job, profile, resume, pool=None):
    handlers = {
        "greenhouse": GreenhouseHandler,
        "lever": LeverHandler,
        "linkedin": LinkedInHandler,
        "workday": WorkdayHandler,
    }
    cls = handlers.get(ats_type.lower(), GenericHandler)
    return cls(page, job, profile, resume, pool=pool)


async def run_one_job(job: dict, profile: dict, resume: dict, pool,
                       screenshot_path: str | None = None) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            from playwright_stealth import stealth_async
            await stealth_async(page)
            await page.goto(job["url"], timeout=30000)
            ats_type = detect_ats_by_url(job["url"])
            handler = pick_handler(ats_type, page, job, profile, resume, pool=pool)
            result = await handler.apply()
            if result.get("status") == "stuck" and screenshot_path:
                try:
                    Path(screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                    await page.screenshot(path=screenshot_path, full_page=True)
                except Exception:
                    pass
            return result
        finally:
            await browser.close()


async def main():
    config = load_config()
    profile = load_profile()
    resume = load_resume()
    db.init_db()

    pool = GroqPool(
        api_keys=config["groq"]["keys"],
        model=config["groq"].get("model", "llama-3.3-70b-versatile"),
    )

    jobs = await scrape_jobs(profile, target_count=TARGET_APPLIED * 3)
    await notify_agent_started(len(jobs))

    applied = blocked = failed = attempted = 0

    for job in jobs:
        if applied >= TARGET_APPLIED:
            print(f"[✓] Target of {TARGET_APPLIED} applied jobs reached. Stopping.")
            break

        if Path("PAUSE_FLAG").exists():
            print("Paused. Waiting for /start_agent...")
            while Path("PAUSE_FLAG").exists():
                await asyncio.sleep(5)

        if attempted > 0:
            delay = random.randint(120, 300)
            print(f"[i] Sleeping {delay}s before next application...")
            await asyncio.sleep(delay)

        jd_text = job.get("jd_text", "")
        jd_hash = hashlib.sha256(jd_text.encode("utf-8")).hexdigest()
        job_id = db.insert_job(
            company=job["company"], role=job["role"], url=job["url"],
            jd_text=jd_text, jd_hash=jd_hash,
        )
        if not job_id:
            job_id = db.get_job_id_by_hash(jd_hash)
        if not job_id:
            print(f"[!] Could not resolve job_id for {job['url']}, skipping.")
            continue
        job["id"] = job_id

        existing = db.get_job(job_id)
        if existing and existing.get("status") in ("applied", "blocked", "failed", "skipped"):
            print(f"[i] Job #{job_id} already {existing['status']}, skipping.")
            continue

        resume["resume_path"] = pick_resume(job["role"])
        Path("logs").mkdir(exist_ok=True)
        screenshot = f"logs/stuck_{job_id}.png"

        attempted += 1
        try:
            result = await run_one_job(job, profile, resume, pool, screenshot_path=screenshot)
        except Exception as e:
            print(f"[!] Job #{job_id} crashed: {e}")
            failed += 1
            db.update_job_status(job_id, "failed", stuck_reason=str(e))
            continue

        status = result.get("status")
        reason = result.get("reason", "") or ""

        if status == "applied":
            applied += 1
            db.update_job_status(job_id, "applied")
            await notify_job_applied(job_id, job["company"], job["role"])
            print(f"[✓] Applied {applied}/{TARGET_APPLIED}: {job['company']} — {job['role']}")
        elif status == "stuck":
            blocked += 1
            db.update_job_status(job_id, "blocked", stuck_reason=reason or "blocked")
            await notify_job_stuck(job_id, job["company"], reason or "blocked", screenshot)
            print(f"[⛔] Job #{job_id} blocked: {reason} — moving on.")
        else:
            failed += 1
            db.update_job_status(job_id, "failed", stuck_reason=reason)
            print(f"[✗] Job #{job_id} failed: {reason}")

    await notify_daily_summary(applied, blocked, failed)
    print(f"\n=== DONE === Applied: {applied}  Blocked: {blocked}  Failed: {failed}  Target: {TARGET_APPLIED}")


if __name__ == "__main__":
    asyncio.run(main())
