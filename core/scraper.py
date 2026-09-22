"""
core/scraper.py — Job board scraping (LinkedIn / Indeed / Naukri).

Uses httpx + BeautifulSoup only (no LLM, no browser) to pull a list of
candidate jobs matching profile.yaml's target_roles/target_locations.
Returns plain dicts ready for core.db.insert_job().
"""

import httpx
from bs4 import BeautifulSoup

# TODO: consider per-source functions, e.g. scrape_naukri(), scrape_linkedin()
# Naukri.com is the primary target platform (largest job pool for this use case).


def scrape_jobs(profile: dict, target_count: int = 50) -> list[dict]:
    """
    Top-level entry point. Aggregates results across configured sources
    until target_count unique jobs (by URL/JD hash) are collected.
    Returns list of {company, role, url, jd_text}.
    """
    # TODO: implement
    pass


def scrape_naukri(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    """Scrape Naukri.com search results for the given roles/locations."""
    pass


def scrape_linkedin(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    """Scrape LinkedIn public job search results (no login)."""
    pass


def scrape_indeed(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    """Scrape Indeed search results."""
    pass


def clean_jd_text(raw_html: str, max_words: int = 400) -> str:
    """Strip HTML, collapse whitespace, trim to max_words for LLM input."""
    pass
