"""
core/llm.py — Groq client with N-key rotation (up to 7 free keys).

Exposes:
  GroqKeyPool                             — rotates clients, cools down 429s
  tailor_resume(jd, resume_json, pool)    -> dict (JSON patch, smart_model)
  map_fields_batch(fields, profile, pool) -> dict (fast_model)
  classify_ats(url, pool)                 -> str  (fast_model, fallback only)
"""

import itertools
import json
import time

from groq import Groq, RateLimitError
from loguru import logger

FAST_MODEL = "llama-3.1-8b-instant"
SMART_MODEL = "llama-3.3-70b-versatile"

VALID_ATS = {"greenhouse", "lever", "linkedin", "workday", "generic"}


class GroqKeyPool:
    """Round-robins across Groq API keys; cools down any key that 429s."""

    def __init__(self, keys: list[str], cooldown_seconds: int = 60):
        if not keys:
            raise ValueError("GroqKeyPool needs at least one API key.")
        self._clients = [Groq(api_key=k) for k in keys]
        self._cycle = itertools.cycle(self._clients)
        self._cooldown_seconds = cooldown_seconds
        self._cooling_until = {id(c): 0.0 for c in self._clients}

    def get_client(self) -> Groq:
        now = time.monotonic()
        for _ in range(len(self._clients)):
            client = next(self._cycle)
            if now >= self._cooling_until[id(client)]:
                return client
        soonest = min(self._cooling_until.values())
        wait = max(0.0, soonest - now)
        logger.warning(f"All Groq keys cooling down — waiting {wait:.0f}s")
        time.sleep(wait)
        return next(self._cycle)

    def mark_rate_limited(self, client: Groq) -> None:
        self._cooling_until[id(client)] = time.monotonic() + self._cooldown_seconds

    def chat(self, model: str, messages: list[dict], **kwargs) -> str:
        last_err = None
        for _ in range(len(self._clients) * 2):
            client = self.get_client()
            try:
                resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
                return resp.choices[0].message.content
            except RateLimitError as e:
                last_err = e
                self.mark_rate_limited(client)
        raise RuntimeError(f"All Groq keys rate-limited: {last_err}")


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


def tailor_resume(jd: str, resume_json: dict, pool: GroqKeyPool) -> dict:
    system = (
        "You tailor resumes for job applications. Given a job description and "
        "a candidate resume as JSON, respond with ONLY a JSON object that is a "
        "PATCH — just the fields to change (e.g. 'summary', reworded 'skills' "
        "or 'experience' entries) to match the JD. No prose, no markdown."
    )
    user = (
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"CURRENT RESUME JSON:\n{json.dumps(resume_json, sort_keys=True)}\n\n"
        "Return the JSON patch now."
    )
    raw = pool.chat(
        model=SMART_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
        max_tokens=1200,
    )
    try:
        return _extract_json(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("tailor_resume: unparsable JSON, returning empty patch")
        return {}


def map_fields_batch(fields: list[dict], profile: dict, pool: GroqKeyPool) -> dict:
    system = (
        "You fill job application form fields from a candidate profile. Given "
        "a list of fields (name + visible label) and the candidate profile as "
        "JSON, respond with ONLY a JSON object mapping each field's 'name' to "
        "the best value. Use a reasonable default or empty string if nothing "
        "fits. No prose."
    )
    user = (
        f"FORM FIELDS:\n{json.dumps(fields)}\n\n"
        f"CANDIDATE PROFILE:\n{json.dumps(profile, sort_keys=True)}\n\n"
        "Return the JSON mapping now."
    )
    raw = pool.chat(
        model=FAST_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.1,
        max_tokens=800,
    )
    try:
        return _extract_json(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("map_fields_batch: unparsable JSON, returning {}")
        return {}


def classify_ats(url: str, pool: GroqKeyPool) -> str:
    system = (
        "Classify a job application URL by ATS platform. Respond with ONLY one "
        "lowercase word: greenhouse, lever, linkedin, workday, or generic. "
        "No prose, no punctuation."
    )
    raw = pool.chat(
        model=FAST_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": url}],
        temperature=0.0,
        max_tokens=10,
    )
    guess = raw.strip().lower()
    return guess if guess in VALID_ATS else "generic"
