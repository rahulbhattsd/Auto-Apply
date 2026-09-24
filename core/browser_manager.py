import asyncio
import random
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright_stealth import stealth_async
import yaml

class BrowserManager:
    """Manages a single persistent browser context for the entire run."""
    def __init__(self, config_path="config.yaml"):
        with open(config_path, "r") as f:
            self.config = yaml.safe_load(f)
        self.playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        self.page: Page = None

    async def start(self):
        self.playwright = await async_playwright().start()
        # Use a persistent user data directory to save cookies and localStorage
        user_data_dir = self.config.get("user_data_dir", "./user_data")
        self.context = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=self.config.get("headless", False),
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.page = await self.context.new_page()
        await stealth_async(self.page)
        # Set a default timeout for all actions
        self.page.set_default_timeout(30000)
        return self.page

    async def close(self):
        if self.context:
            await self.context.close()
        if self.playwright:
            await self.playwright.stop()

    async def human_delay(self, min_ms=500, max_ms=2000):
        await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))
