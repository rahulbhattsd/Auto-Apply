import asyncio
import os
from core.browser_manager import BrowserManager
from handlers.linkedin_handler import LinkedInHandler
from core.llm import GroqPool
import yaml

async def test():
    config_path = "config.yaml" if os.path.exists("config.yaml") else "config.example.yaml"
    with open(config_path, "r", encoding="utf-8-sig") as f:
        config = yaml.safe_load(f)
    groq_cfg = config.get("groq", {}) or {}
    groq_keys = config.get("groq_api_keys") or groq_cfg.get("keys") or ["dummy_key"]
    llm_pool = GroqPool(groq_keys)
    bm = BrowserManager()
    page = await bm.start()

    # Navigate to a real LinkedIn Easy Apply job
    # Replace with a valid LinkedIn Easy Apply job URL
    job_url = "https://www.linkedin.com/jobs/view/1234567890"
    resume_text = config.get("resume_text", "")
    handler = LinkedInHandler(page, llm_pool, resume_text)
    result = await handler.apply(job_url)
    print("Test Result:", result)

    await bm.close()

if __name__ == "__main__":
    asyncio.run(test())
