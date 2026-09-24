import asyncio
from core.browser_manager import BrowserManager
from handlers.linkedin_handler import LinkedInHandler
from core.llm import GroqPool
import yaml

async def test():
    with open("config.yaml", "r") as f:
        config = yaml.safe_load(f)
    llm_pool = GroqPool(config["groq_api_keys"])
    bm = BrowserManager()
    page = await bm.start()

    # Navigate to a real LinkedIn Easy Apply job
    # Replace with a valid LinkedIn Easy Apply job URL
    job_url = "https://www.linkedin.com/jobs/view/1234567890"
    handler = LinkedInHandler(page, llm_pool, config["resume_text"])
    result = await handler.apply(job_url)
    print("Test Result:", result)

    await bm.close()

if __name__ == "__main__":
    asyncio.run(test())
