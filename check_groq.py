"""check_groq.py — Verify which Groq models are available and working."""
import yaml
from groq import Groq

with open("config.yaml", "r", encoding="utf-8-sig") as f:
    cfg = yaml.safe_load(f)

key = cfg["groq"]["keys"][0]
client = Groq(api_key=key)

# List available models
try:
    models = client.models.list()
    print("Available models:")
    for m in models.data:
        print(f"  - {m.id}")
except Exception as e:
    print(f"Error listing models: {e}")

# Try calling each candidate model
candidates = [
    "llama-3.1-8b-instant",
    "llama3-8b-8192",
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
]
print("\nTesting models:")
for model in candidates:
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say: yes"}],
            max_tokens=10,
        )
        print(f"  OK: {model} -> {resp.choices[0].message.content!r}")
    except Exception as e:
        print(f"  FAIL: {model} -> {str(e)[:80]}")
