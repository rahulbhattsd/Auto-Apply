"""run_continuous.py — Scrape until target discovered jobs count reached, auto-apply until target applications daily limit reached."""

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

TARGET_DISCOVERED = 150
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
        "SELECT applied FROM stats WHERE date = ?", (date.today().isoformat(),)
    ).fetchone()
    con.close()
    return row[0] if row else 0


async def top_up_jobs(profile: dict, db_path: str = DB_PATH) -> int:
    need = TARGET_DISCOVERED - total_discovered(db_path)
    if need <= 0:
        return 0
    print(f"[scraper] {need} more jobs needed to hit {TARGET_DISCOVERED} target, scraping...")
    jobs = await scrape_jobs(profile, target_count=min(SCRAPE_BATCH, need))
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
            print(f"[status] discovered={total_discovered()}/{TARGET_DISCOVERED}  applied_today={done_today}/{TARGET_APPLIED}")
            if done_today >= TARGET_APPLIED:
                print("[done] Target of", TARGET_APPLIED, "applications reached for today. Stopping.")
                break

            await top_up_jobs(profile)

            jobs = db.get_pending_jobs()
            if not jobs:
                idle_cycles += 1
                if total_discovered() >= TARGET_DISCOVERED and idle_cycles >= MAX_IDLE_CYCLES:
                    print("[done] Discovered", TARGET_DISCOVERED, "jobs and queue is exhausted; stopping.")
                    break
                print(f"[idle] No jobs to process right now, sleeping {POLL_SLEEP_SECS}s...")
                await asyncio.sleep(POLL_SLEEP_SECS)
                continue

            idle_cycles = 0
            for job in jobs:
                if applied_today() >= TARGET_APPLIED:
                    break
                await run_one_job(job.id, job.url, db, config, llm_pool, browser_manager)
                await asyncio.sleep(2)
    finally:
        await browser_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
