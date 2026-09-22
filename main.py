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
import yaml
import json
from pathlib import Path

# TODO: from core import db, llm, scraper, notifier, cache
# TODO: from ats import greenhouse, lever, linkedin, workday, generic
# TODO: from barriers import otp, captcha, human_handoff


def load_config(path: str = "config.yaml") -> dict:
    """Load Groq keys, Telegram token, delay settings, etc."""
    pass


def load_profile(path: str = "profile.yaml") -> dict:
    """Load personal data used to fill application forms."""
    pass


def load_resume(path: str = "resume_base.json") -> dict:
    """Load structured base resume JSON."""
    pass


def detect_ats(url: str) -> str:
    """Classify which ATS a job URL belongs to (greenhouse/lever/linkedin/workday/generic)."""
    # TODO: cheap heuristic first (URL pattern), fallback to llm.classify_ats(url)
    pass


async def process_job(job: dict, config: dict, profile: dict, resume: dict) -> None:
    """
    Full pipeline for a single queued job:
    clean JD -> tailor resume -> detect ATS -> launch Playwright ->
    dispatch to handler -> handle OTP/CAPTCHA -> update DB -> delay.
    """
    # TODO: implement per MAIN LOOP PSEUDOCODE
    pass


async def run_agent() -> None:
    """Top-level loop: scrape jobs, then process each queued job in order."""
    # TODO: implement
    pass


def main() -> None:
    asyncio.run(run_agent())


if __name__ == "__main__":
    main()
