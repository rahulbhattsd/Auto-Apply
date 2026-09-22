"""
core/llm.py — Groq client with 7-key rotation.

Exposes exactly three functions used by the rest of the app:
  tailor_resume(jd, resume_json)   -> JSON patch (smart_model)
  map_fields_batch(fields, profile) -> field->value mapping (fast_model)
  classify_ats(url)                -> ats type string (fast_model, fallback only)

Key rotation:
  - itertools.cycle over Groq clients built from config.yaml keys
  - On HTTP 429 -> cooldown that key for `cooldown_seconds`, try next client
  - If all keys cooling -> raise, caller (main.py) waits and retries

All calls should go through core.cache first (hash prompt -> reuse).
"""

import itertools
import time
import hashlib
import json

# TODO: from groq import Groq
# TODO: from core import cache

FAST_MODEL = "llama-3.1-8b-instant"
SMART_MODEL = "llama-3.3-70b-versatile"


class GroqKeyPool:
    """Rotates across up to 7 Groq API keys, cooling down keys that 429."""

    def __init__(self, keys: list[str], cooldown_seconds: int = 60):
        # TODO: build one Groq client per key, set up itertools.cycle
        pass

    def get_client(self):
        """Return the next non-cooling-down client."""
        pass

    def mark_rate_limited(self, client) -> None:
        """Put a client on cooldown after a 429."""
        pass


def _hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def tailor_resume(jd: str, resume_json: dict) -> dict:
    """
    Trim JD to 400 words, prompt smart_model for a JSON *patch* (not a full
    rewrite) against resume_json. Check core.cache first; store result after.
    """
    # TODO: implement
    pass


def map_fields_batch(fields: list[str], profile: dict) -> dict:
    """
    Batch all unknown application-form fields into ONE fast_model call.
    Returns {field_name: value}.
    """
    # TODO: implement
    pass


def classify_ats(url: str) -> str:
    """
    Fallback ATS classifier when URL heuristics in main.detect_ats() are
    inconclusive. Returns one of: greenhouse, lever, linkedin, workday, generic.
    """
    # TODO: implement
    pass
