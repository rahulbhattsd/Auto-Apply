"""core/llm.py — LLM helper for mapping unknown form fields."""

import json
import hashlib
from core.cache import get_cached, set_cached

async def map_fields_batch(fields: list[dict], profile: dict, pool) -> dict:
    """
    Given a list of {'name': label} and the user profile, return a mapping
    of label -> value. Uses an LLM via the provided pool (e.g., Groq client).
    Results are cached by hash of (fields, profile).
    """
    key = hashlib.sha256(
        json.dumps({"fields": fields, "profile": profile}, sort_keys=True).encode()
    ).hexdigest()
    cached = get_cached(key)
    if cached:
        return cached

    # Build a simple prompt
    prompt = f"""
You are filling a job application form. Given the user profile and the list of unknown field labels,
return a JSON object mapping each label to the best value from the profile.
If no value is found, use an empty string.

Profile:
{json.dumps(profile, indent=2)}

Unknown fields:
{json.dumps(fields, indent=2)}

Return ONLY valid JSON.
"""
    # Use the first client in the pool (adjust if your pool works differently)
    client = pool[0] if isinstance(pool, list) else pool
    response = await client.chat.completions.create(
        model="llama3-8b-8192",  # or your preferred model
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )
    text = response.choices[0].message.content.strip()
    # Try to extract JSON
    try:
        mapping = json.loads(text)
    except Exception:
        mapping = {}
    set_cached(key, mapping)
    return mapping
