"""core/cache.py — thin wrapper over core/db.py's llm_cache."""
from core.db import get_llm_cache, set_llm_cache


def get_cached(key: str):
    return get_llm_cache(key)


def set_cached(key: str, value: dict) -> None:
    set_llm_cache(key, value)
