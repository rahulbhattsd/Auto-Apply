"""core/llm.py — Token-frugal Groq pool: rotation + cooldown + cache + tiny prompts.

Design goals (see DESIGN_NOTES.md):
  - Round-robins across all configured keys instead of hammering key[0].
  - On a rate-limit/error, marks that key "cooling down" and tries the next
    one immediately, so one exhausted free-tier key doesn't stall the run.
  - Every answer is cached in SQLite by a hash of (model, fields, profile
    signature) - the same "years of experience" / "sponsorship" question
    shows up on nearly every job, so after the first few applications most
    calls are served from cache and cost zero tokens.
  - Sends a short structured profile summary, never the raw resume text,
    and batches an entire step's unknown fields into ONE call.
  - Uses currently-supported free-tier Groq model IDs. `llama3-70b-8192`
    and `llama-3.3-70b-versatile` are both retired (Groq deprecated them
    16 Aug 2026) - using either now fails every single call silently.
"""

import hashlib
import json
import time

from groq import Groq

from core.cache import get_cached, set_cached

# Current (as of this writing) free-tier Groq model IDs. Keep this list in
# one place so a future Groq deprecation only needs one edit.
DEFAULT_MODEL = "openai/gpt-oss-20b"        # cheap + fast, plenty for field-mapping
FALLBACK_MODEL = "openai/gpt-oss-120b"      # only used if the primary model itself errors


def _profile_summary(profile: dict, max_chars: int = 500) -> str:
    """Condensed, deterministic context string - far cheaper than a full resume."""
    if not profile:
        return ""
    if isinstance(profile, str):
        return profile[:max_chars]
    pers = profile.get("personal", {}) or {}
    prefs = profile.get("preferences", {}) or {}
    work = profile.get("work_eligibility", {}) or {}
    loc = pers.get("location", {})
    parts = [
        f"Role target: {', '.join(profile.get('job_search', {}).get('target_roles', []) or [])}",
        f"Experience: {prefs.get('years_of_experience', '')} yrs",
        f"Notice period: {prefs.get('notice_period_days', '')} days",
        f"Expected CTC: {prefs.get('expected_salary', '')}",
        f"Sponsorship needed: {work.get('requires_sponsorship', False)}",
        f"Authorized to work: {work.get('authorized_to_work', True)}",
        f"Location: {loc.get('city', '') if isinstance(loc, dict) else loc}",
    ]
    return " | ".join(p for p in parts if p)[:max_chars]


class GroqPool:
    def __init__(self, api_keys: list[str], model: str = DEFAULT_MODEL,
                 fallback_model: str = FALLBACK_MODEL, cooldown_seconds: int = 60):
        self.api_keys = [k for k in (api_keys or [])
                          if k and not str(k).startswith("your_") and "here" not in str(k)]
        if not self.api_keys:
            self.api_keys = ["dummy_key"]
        self.model = model
        self.fallback_model = fallback_model
        self.cooldown_seconds = cooldown_seconds
        self._next_index = 0
        self._cooldown_until = {i: 0.0 for i in range(len(self.api_keys))}

    def _usable_key_order(self) -> list[int]:
        """Round-robin starting point, skipping keys still in cooldown."""
        now = time.monotonic()
        n = len(self.api_keys)
        order = [(self._next_index + i) % n for i in range(n)]
        self._next_index = (self._next_index + 1) % n
        ready = [i for i in order if self._cooldown_until[i] <= now]
        cooling = [i for i in order if self._cooldown_until[i] > now]
        return ready + cooling

    def _mark_cooldown(self, idx: int) -> None:
        self._cooldown_until[idx] = time.monotonic() + self.cooldown_seconds

    def _cache_key(self, model: str, fields: list[dict], context: str) -> str:
        payload = json.dumps({"m": model, "f": fields, "c": context}, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def map_fields_batch(self, fields: list[dict], resume_text_or_profile) -> dict:
        """
        One batched call for every currently-unknown field on the page/step.
        `resume_text_or_profile` may be a raw string (legacy callers) or a
        profile dict - dicts get condensed via `_profile_summary` to keep
        the prompt tiny.
        """
        if not fields:
            return {}

        context = (
            _profile_summary(resume_text_or_profile)
            if isinstance(resume_text_or_profile, dict)
            else str(resume_text_or_profile or "")[:500]
        )

        cache_key = self._cache_key(self.model, fields, context)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        prompt = (
            "Fill these job application fields for this candidate. "
            "Return ONLY a compact JSON object mapping each field's \"accessible_name\" "
            "to a short answer string. Use null if truly unknown. No explanation.\n\n"
            f"Candidate: {context}\n\n"
            f"Fields: {json.dumps(fields, separators=(',', ':'))}"
        )

        result = await self._call(prompt, self.model)
        if not result:
            result = await self._call(prompt, self.fallback_model)

        if result:
            set_cached(cache_key, result)
        return result or {}

    async def _call(self, prompt: str, model: str) -> dict:
        order = self._usable_key_order()
        for idx in order:
            key = self.api_keys[idx]
            try:
                client = Groq(api_key=key)
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=400,
                    response_format={"type": "json_object"},
                )
                return json.loads(response.choices[0].message.content)
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "rate" in msg or "quota" in msg:
                    self._mark_cooldown(idx)
                continue
        return {}


async def map_fields_batch(fields: list[dict], profile: dict, pool: GroqPool = None) -> dict:
    if pool:
        return await pool.map_fields_batch(fields, profile)
    return {}
