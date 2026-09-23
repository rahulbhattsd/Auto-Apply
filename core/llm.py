"""core/llm.py — Groq client pool with automatic key rotation on rate limit."""

import json
import hashlib
from groq import AsyncGroq, RateLimitError, APIStatusError
from core.cache import get_cached, set_cached


class GroqPool:
    """Round-robin pool. On 429 / quota-exceeded, silently moves to next key
    and retries the same request. Raises only when ALL keys are exhausted."""

    def __init__(self, api_keys: list[str], model: str = "llama-3.3-70b-versatile"):
        keys = [k for k in (api_keys or []) if k and not k.startswith("gsk_key")]
        if not keys:
            raise ValueError("GroqPool: no valid API keys provided")
        self.clients = [AsyncGroq(api_key=k) for k in keys]
        self.model = model
        self._idx = 0

    def _next(self) -> AsyncGroq:
        c = self.clients[self._idx]
        self._idx = (self._idx + 1) % len(self.clients)
        return c

    async def chat(self, messages: list[dict], temperature: float = 0.1) -> str:
        last_err = None
        for _ in range(len(self.clients) * 2):     # 2 full passes over all keys
            client = self._next()
            try:
                resp = await client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature,
                )
                return resp.choices[0].message.content.strip()
            except RateLimitError as e:
                last_err = e
                continue
            except APIStatusError as e:
                if e.status_code in (429, 402, 403):
                    last_err = e
                    continue
                raise
        raise RuntimeError(f"All Groq keys exhausted. Last error: {last_err}")


async def map_fields_batch(fields: list[dict], profile: dict, pool: GroqPool) -> dict:
    if not fields:
        return {}
    key = hashlib.sha256(
        json.dumps({"fields": fields, "profile": profile}, sort_keys=True).encode()
    ).hexdigest()
    cached = get_cached(key)
    if cached is not None:
        return cached

    prompt = (
        "You fill job application forms. Given the user profile and unknown field labels, "
        "return a JSON object mapping each label to the best value from the profile. "
        "Use empty string if unknown. Return ONLY valid JSON, no markdown.\n\n"
        f"Profile:\n{json.dumps(profile, indent=2)}\n\n"
        f"Fields:\n{json.dumps(fields, indent=2)}"
    )
    text = await pool.chat([{"role": "user", "content": prompt}])
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        mapping = json.loads(text)
    except Exception:
        mapping = {}
    set_cached(key, mapping)
    return mapping