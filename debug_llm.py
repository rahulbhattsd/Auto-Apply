"""debug_llm.py — Debug why LLM calls return empty."""
import yaml, asyncio, json
from groq import Groq

with open("config.yaml", "r", encoding="utf-8-sig") as f:
    cfg = yaml.safe_load(f)

keys = cfg["groq"]["keys"]

# Test working model
model = "openai/gpt-oss-20b"

fields = [{"accessible_name": "Years of experience", "type": "text"}]
profile_ctx = "Role target: Software Engineer | Experience: 1 yrs | Location: Bangalore"

prompt = (
    "Fill these job application fields for this candidate. "
    'Return ONLY a compact JSON object mapping each field\'s "accessible_name" '
    "to a short answer string. Use null if truly unknown. No explanation.\n\n"
    f"Candidate: {profile_ctx}\n\n"
    f"Fields: {json.dumps(fields, separators=(',', ':'))}"
)

for i, key in enumerate(keys[:2]):
    print(f"\nKey {i}: {key[:20]}...")
    client = Groq(api_key=key)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        content = resp.choices[0].message.content
        print(f"  Raw response: {content!r}")
        parsed = json.loads(content)
        print(f"  Parsed: {parsed}")
    except Exception as e:
        print(f"  ERROR: {e}")
