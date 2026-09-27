"""scrape_and_queue.py — Continuous background job discovery and queueing process."""

import asyncio
import os
import time
import schedule
import yaml
from check_setup import check_setup
from core.scraper import scrape_jobs
from core.db import insert_job, init_db


def load_config() -> dict:
    config_path = "config.yaml"
    if not os.path.exists(config_path) and os.path.exists("config.example.yaml"):
        config_path = "config.example.yaml"
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8-sig") as f:
                return yaml.safe_load(f) or {}
        except Exception:
            pass
    return {}


def load_profile(config: dict) -> dict:
    if os.path.exists("profile.yaml"):
        try:
            with open("profile.yaml", "r", encoding="utf-8") as f:
                file_profile = yaml.safe_load(f) or {}
            if file_profile:
                return file_profile
        except Exception:
            pass
    return config.get("profile", {}) or {}


from core.browser_manager import BrowserManager


async def _scrape_with_browser(profile: dict) -> list[dict]:
    bm = BrowserManager()
    page = await bm.start()
    try:
        return await scrape_jobs(profile, target_count=50, page=page)
    finally:
        await bm.close()


def run_once():
    init_db()
    config = load_config()
    profile = load_profile(config)

    print("[scraper] Starting job search run with Easy Apply filter...", flush=True)
    try:
        jobs = asyncio.run(_scrape_with_browser(profile))
    except Exception as e:
        print(f"[scraper] Error during scraping: {e}", flush=True)
        return

    new_count = 0
    for j in jobs:
        company = j.get("company", "Unknown")
        role = j.get("role", "Unknown")
        url = j.get("url", "")
        jd_text = j.get("jd_text", "")
        if not url:
            continue
        inserted_id = insert_job(company, role, url, jd_text)
        if inserted_id:
            new_count += 1

    print(f"[scraper] {len(jobs)} scraped, {new_count} new Easy Apply jobs queued", flush=True)



def main():
    check_setup()
    schedule.every(30).minutes.do(run_once)
    run_once()  # first run immediately
    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
