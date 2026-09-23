"""core/cache.py — Thin wrapper delegating to core/db.py's llm_cache."""

import json
from core import db


def get_cached(key: str) -> dict | None:
    res = db.get_llm_cache(key)
    return json.loads(res) if res else None


def set_cached(key: str, value: dict) -> None:
    db.set_llm_cache(key, json.dumps(value))


def get_llm_cache(prompt_hash: str) -> str | None:
    return db.get_llm_cache(prompt_hash)


def set_llm_cache(prompt_hash: str, response: str) -> None:
    db.set_llm_cache(prompt_hash, response)
