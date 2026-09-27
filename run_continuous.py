"""run_continuous.py — Scrape continuously, apply until target limit reached (resets every 12h window)."""

import asyncio
import os
import sqlite3
import yaml
from datetime import date

from core.browser_manager import BrowserManager
from core.llm import GroqPool
from core.db import Database, DB_PATH, insert_job
from core.scraper import scrape_jobs
from main import run_one_job, load_profile
from check_setup import check_setup

TARGET_APPLIED = 50
SCRAPE_BATCH = 50
POLL_SLEEP_SECS = 60
MAX_IDLE_CYCLES = 5


def total_discovered(db_path: str = DB_PATH) -> int:
    con = sqlite3.connect(db_path)
    n = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    con.close()
    return n


def applied_today(db_path: str = DB_PATH) -> int:
    con = sqlite3.connect(db_path)
    row = con.execute(
        "SELECT COUNT(*) FROM jobs WHERE status = 'applied' AND applied_at >= datetime('now', '-12 hours')"
    ).fetchone()
    cnt_12h = row[0] if row else 0
    con.close()
    return cnt_12h


async def top_up_jobs(profile: dict, db_path: str = DB_PATH) -> int:
    print(f"[scraper] queue empty, scraping up to {SCRAPE_BATCH} more jobs...")
    jobs = await scrape_jobs(profile, target_count=SCRAPE_BATCH)
    added = 0
    for j in jobs:
        if not j.get("url"):
            continue
        if insert_job(j.get("company", "Unknown"), j.get("role", "Unknown"), j["url"], j.get("jd_text", ""), db_path=db_path):
            added += 1
    print(f"[scraper] {len(jobs)} scraped, {added} new jobs added")
    return added


async def main():
    check_setup()
    config_path = "config.yaml" if os.path.exists("config.yaml") else "config.example.yaml"
    with open(config_path, "r", encoding="utf-8-sig") as f:
        config = yaml.safe_load(f)
    profile = load_profile(config)

    print(f"[debug] profile.yaml keys loaded: {list(profile.keys())}")
    print(f"[debug] target_roles found: {len(profile.get('job_search', {}).get('target_roles', []))}")

    db = Database()
    groq_cfg = config.get("groq", {}) or {}
    groq_keys = config.get("groq_api_keys") or groq_cfg.get("keys") or ["dummy_key"]
    llm_pool = GroqPool(
        groq_keys,
        model=groq_cfg.get("model", "openai/gpt-oss-20b"),
        fallback_model=groq_cfg.get("fallback_model", "openai/gpt-oss-120b"),
        cooldown_seconds=groq_cfg.get("cooldown_seconds", 60),
    )
    browser_manager = BrowserManager()
    await browser_manager.start()

    idle_cycles = 0
    try:
        while True:
            done_today = applied_today()
            print(f"[status] discovered={total_discovered()}  applied_today={done_today}/{TARGET_APPLIED}")
            if done_today >= TARGET_APPLIED:
                print("[done] Target of", TARGET_APPLIED, "applications reached for current 12h window. Stopping.")
                break

            jobs = db.get_pending_jobs()
            if not jobs:
                added = await top_up_jobs(profile)
                if added == 0:
                    idle_cycles += 1
                    if idle_cycles >= MAX_IDLE_CYCLES:
                        print("[done] Saare roles/sources try kar liye, koi naya job nahi mil raha. Stopping.")
                        break
                    print(f"[idle] Is baar kuch naya nahi mila, {POLL_SLEEP_SECS}s sleep karke phir try karenge...")
                    await asyncio.sleep(POLL_SLEEP_SECS)
                    continue
                idle_cycles = 0
                jobs = db.get_pending_jobs()

            for job in jobs:
                if applied_today() >= TARGET_APPLIED:
                    break
                await run_one_job(job.id, job.url, db, config, llm_pool, browser_manager)
                await asyncio.sleep(2)
    finally:
        await browser_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
