import asyncio
import os
import random
from playwright.async_api import async_playwright
import yaml


STATE_FILE = "state.json"


class BrowserManager:
    def __init__(self, config_path="config.yaml"):
        with open(config_path, "r") as f:
            self.config = yaml.safe_load(f)
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

    async def start(self):
        self.playwright = await async_playwright().start()

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-infobars",
        ]

        try:
            self.browser = await self.playwright.chromium.launch(
                channel="chrome",
                headless=False,
                args=launch_args,
            )
            print("[OK] Launched REAL Chrome (minimal stealth)")
        except Exception as e:
            print(f"[!] Real Chrome unavailable ({e}), using bundled Chromium")
            self.browser = await self.playwright.chromium.launch(
                headless=False,
                args=launch_args,
            )

        ctx_kwargs = {
            "viewport": {"width": 1366, "height": 800},
            "locale": "en-US",
            "timezone_id": "Asia/Kolkata",
        }

        if os.path.exists(STATE_FILE):
            ctx_kwargs["storage_state"] = STATE_FILE
            print("[OK] Loaded saved session from state.json")

        self.context = await self.browser.new_context(**ctx_kwargs)
        self.page = await self.context.new_page()
        self.page.set_default_timeout(45000)
        return self.page

    async def save_state(self):
        if self.context:
            try:
                await self.context.storage_state(path=STATE_FILE)
                print("[OK] Session saved to state.json")
            except Exception as e:
                print("[!] Could not save state:", e)

    async def close(self):
        await self.save_state()
        for obj in (self.context, self.browser, self.playwright):
            try:
                if obj:
                    if hasattr(obj, "close"):
                        await obj.close()
                    elif hasattr(obj, "stop"):
                        await obj.stop()
            except Exception:
                pass


async def human_delay(min_ms=500, max_ms=2000):
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))
