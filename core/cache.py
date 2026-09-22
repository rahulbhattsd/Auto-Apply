"""
core/cache.py — LLM response cache (prompt_hash -> response), backed by
the llm_cache table in SQLite (see core.db).

Thin wrapper so core.llm doesn't need to know about SQLite directly.
"""

import hashlib

# TODO: from core import db


def hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def get(prompt: str) -> str | None:
    """Return cached response for this exact prompt, if any."""
    pass


def set(prompt: str, response: str) -> None:
    """Store a response for this prompt's hash."""
    pass
