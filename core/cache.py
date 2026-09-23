"""core/cache.py — SQLite-backed cache for LLM responses."""

import sqlite3
import json
from pathlib import Path

DB_PATH = Path("cache.db")

def _init():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, value TEXT)")

def get_cached(key: str) -> dict | None:
    _init()
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT value FROM llm_cache WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

def set_cached(key: str, value: dict) -> None:
    _init()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)",
                     (key, json.dumps(value)))
        conn.commit()
