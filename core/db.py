"""
core/db.py — SQLite schema + helper functions.

Tables: jobs, llm_cache, stats  (see project spec for full column list).
Single file: data.db (not committed — see .gitignore).
"""

import sqlite3
from pathlib import Path

DB_PATH = "data.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    url TEXT NOT NULL,
    ats_type TEXT,
    jd_text TEXT,
    jd_hash TEXT UNIQUE,
    status TEXT DEFAULT 'queued',
    stuck_reason TEXT,
    resume_path TEXT,
    screenshot_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_cache (
    prompt_hash TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stats (
    date TEXT PRIMARY KEY,
    applied INTEGER DEFAULT 0,
    stuck INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0
);
"""


def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    """Open a connection with row_factory set to sqlite3.Row."""
    pass


def init_db(db_path: str = DB_PATH) -> None:
    """Create tables if they don't exist (runs SCHEMA)."""
    pass


def insert_job(job: dict) -> int | None:
    """Insert a scraped job as 'queued'. Returns new id, or None if jd_hash duplicate."""
    pass


def update_job_status(job_id: int, status: str, **fields) -> None:
    """Update status (+ optional stuck_reason/resume_path/screenshot_path/applied_at)."""
    pass


def get_jobs(limit: int = 50, status: str | None = None) -> list[dict]:
    """Fetch jobs, optionally filtered by status, most recent first."""
    pass


def get_cached_response(prompt_hash: str) -> str | None:
    """Look up a cached LLM response by prompt hash."""
    pass


def set_cached_response(prompt_hash: str, response: str) -> None:
    """Store an LLM response for reuse."""
    pass


def bump_stat(date: str, field: str) -> None:
    """Increment stats.applied / stats.stuck / stats.failed for a given date."""
    pass


def get_today_stats(date: str) -> dict:
    """Return today's applied/stuck/failed counts."""
    pass
