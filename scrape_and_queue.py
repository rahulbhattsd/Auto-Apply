"""scrape_and_queue.py — Continuous background job discovery and queueing process."""

import asyncio
import os
import time
import schedule
import yaml
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
    profile = config.get("profile", {}) or {}
    if not profile and os.path.exists("profile.yaml"):
        try:
            with open("profile.yaml", "r", encoding="utf-8") as f:
                profile = yaml.safe_load(f) or {}
        except Exception:
            pass
    return profile


def run_once():
    init_db()
    config = load_config()
    profile = load_profile(config)

    print("[scraper] Starting job search run...", flush=True)
    try:
        jobs = asyncio.run(scrape_jobs(profile, target_count=50))
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

    print(f"[scraper] {len(jobs)} scraped, {new_count} new jobs queued", flush=True)


def main():
    schedule.every(30).minutes.do(run_once)
    run_once()  # first run immediately
    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
