"""
core/db.py — SQLite schema + helper functions.

Tables: jobs, llm_cache, stats. Single file: data.db (not committed).
"""

import json
import sqlite3
from contextlib import closing
from datetime import date

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
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.executescript(SCHEMA)


def insert_job(company: str, role: str, url: str, jd_text: str, jd_hash: str,
               db_path: str = DB_PATH) -> int | None:
    with closing(get_connection(db_path)) as conn:
        with conn:
            cur = conn.execute(
                """INSERT OR IGNORE INTO jobs (company, role, url, jd_text, jd_hash)
                   VALUES (?, ?, ?, ?, ?)""",
                (company, role, url, jd_text, jd_hash),
            )
            return cur.lastrowid if cur.rowcount else None


def get_queued_jobs(limit: int = 50, db_path: str = DB_PATH) -> list[dict]:
    with closing(get_connection(db_path)) as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_jobs(limit: int = 50, status: str | None = None, db_path: str = DB_PATH) -> list[dict]:
    with closing(get_connection(db_path)) as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]


def update_job_status(job_id: int, status: str, stuck_reason: str = None,
                       resume_path: str = None, screenshot_path: str = None,
                       db_path: str = DB_PATH) -> None:
    with closing(get_connection(db_path)) as conn:
        old = conn.execute(
            "SELECT status FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
    old_status = old["status"] if old else None

    fields, params = ["status = ?"], [status]

    if stuck_reason is not None:
        fields.append("stuck_reason = ?")
        params.append(stuck_reason)
    if resume_path is not None:
        fields.append("resume_path = ?")
        params.append(resume_path)
    if screenshot_path is not None:
        fields.append("screenshot_path = ?")
        params.append(screenshot_path)
    if status == "applied":
        fields.append("applied_at = CURRENT_TIMESTAMP")

    params.append(job_id)

    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.execute(f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?", params)

    if status in ("applied", "stuck", "failed") and status != old_status:
        day = date.today().isoformat()
        # If we're transitioning away from a counted status, decrement it
        if old_status in ("applied", "stuck", "failed"):
            decrement_stat(day, old_status, db_path=db_path)
        bump_stat(day, status, db_path=db_path)


def get_cached_response(prompt_hash: str, db_path: str = DB_PATH) -> str | None:
    with closing(get_connection(db_path)) as conn:
        row = conn.execute(
            "SELECT response FROM llm_cache WHERE prompt_hash = ?", (prompt_hash,)
        ).fetchone()
        return row["response"] if row else None


def set_cached_response(prompt_hash: str, response: str, db_path: str = DB_PATH) -> None:
    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.execute(
                """INSERT INTO llm_cache (prompt_hash, response) VALUES (?, ?)
                   ON CONFLICT(prompt_hash) DO UPDATE SET response = excluded.response""",
                (prompt_hash, response),
            )


def get_llm_cache(key: str, db_path: str = DB_PATH) -> dict | None:
    with closing(get_connection(db_path)) as conn:
        row = conn.execute(
            "SELECT response FROM llm_cache WHERE prompt_hash = ?", (key,)
        ).fetchone()
        return json.loads(row["response"]) if row else None


def set_llm_cache(key: str, value: dict, db_path: str = DB_PATH) -> None:
    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.execute(
                """INSERT INTO llm_cache (prompt_hash, response) VALUES (?, ?)
                   ON CONFLICT(prompt_hash) DO UPDATE SET response = excluded.response""",
                (key, json.dumps(value)),
            )


def get_job(job_id: int, db_path: str = DB_PATH) -> dict | None:
    with closing(get_connection(db_path)) as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None


def bump_stat(day: str, field: str, db_path: str = DB_PATH) -> None:
    if field not in ("applied", "stuck", "failed"):
        return
    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.execute("INSERT OR IGNORE INTO stats (date) VALUES (?)", (day,))
            conn.execute(f"UPDATE stats SET {field} = {field} + 1 WHERE date = ?", (day,))


def decrement_stat(day: str, field: str, db_path: str = DB_PATH) -> None:
    if field not in ("applied", "stuck", "failed"):
        return
    with closing(get_connection(db_path)) as conn:
        with conn:
            conn.execute("INSERT OR IGNORE INTO stats (date) VALUES (?)", (day,))
            conn.execute(
                f"UPDATE stats SET {field} = MAX(0, {field} - 1) WHERE date = ?",
                (day,),
            )


def get_today_stats(db_path: str = DB_PATH) -> dict:
    day = date.today().isoformat()
    with closing(get_connection(db_path)) as conn:
        row = conn.execute(
            "SELECT applied, stuck, failed FROM stats WHERE date = ?", (day,)
        ).fetchone()
        return dict(row) if row else {"applied": 0, "stuck": 0, "failed": 0}


def get_job_id_by_hash(jd_hash: str, db_path: str = DB_PATH) -> int | None:
    from contextlib import closing
    with closing(get_connection(db_path)) as conn:
        row = conn.execute("SELECT id FROM jobs WHERE jd_hash = ?", (jd_hash,)).fetchone()
        return row["id"] if row else None
