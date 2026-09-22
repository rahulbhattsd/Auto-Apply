"""
core/cache.py — LLM response cache, backed by core.db's llm_cache table.

Usage: hash the prompt yourself via hash_prompt(), then get()/set() using
that hash as the key (see main.py's run_one_job).
"""

import hashlib

from core import db


def hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def get(prompt_hash: str) -> str | None:
    return db.get_cached_response(prompt_hash)


def set(prompt_hash: str, response: str) -> None:
    db.set_cached_response(prompt_hash, response)
