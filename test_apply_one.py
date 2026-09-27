"""
test_apply_one.py — Test Easy Apply on a single LinkedIn job URL.

Usage:
    venv\Scripts\python.exe test_apply_one.py
    venv\Scripts\python.exe test_apply_one.py "https://www.linkedin.com/jobs/view/XXXXXXX/"

This opens a VISIBLE browser so you can watch it work.
"""
import asyncio
import sys
import yaml
from playwright.async_api import async_playwright
from core.llm import GroqPool
from handlers.linkedin_handler import LinkedInHandler

# ── CONFIG ─────────────────────────────────────────────────────────────────
# Use any LinkedIn Easy Apply job URL — pick one from your saved jobs list
TEST_URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "https://www.linkedin.com/jobs/search/?f_AL=true&keywords=software+engineer&location=India"
)
HEADLESS = False  # Watch it work!
# ───────────────────────────────────────────────────────────────────────────


async def main():
    with open("config.yaml", "r", encoding="utf-8-sig") as f:
        config = yaml.safe_load(f)

    import os
    import json

    groq_cfg = config.get("groq", {}) or {}
    groq_keys = config.get("groq_api_keys") or groq_cfg.get("keys") or ["dummy_key"]
    llm_pool = GroqPool(
        groq_keys,
        model=groq_cfg.get("model", "llama-3.1-8b-instant"),
        fallback_model=groq_cfg.get("fallback_model", "llama3-8b-8192"),
    )

    # Load profile
    if os.path.exists("profile.yaml"):
        with open("profile.yaml", "r", encoding="utf-8") as f:
            profile = yaml.safe_load(f) or {}
    else:
        profile = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=HEADLESS,
            args=["--start-maximized"]
        )
        ctx = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            )
        )
        page = await ctx.new_page()

        print("=== LinkedIn Auto Apply — Test Run ===")
        print(f"URL: {TEST_URL}")
        print()

        # ── Login check: navigate to LinkedIn, pause if not logged in ────────
        await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(2.0)

        current_url = page.url
        if "login" in current_url or "authwall" in current_url or "signup" in current_url:
            print("⚠  NOT LOGGED IN to LinkedIn!")
            print("   Please log in manually in the browser window, then press Enter here.")
            input("   Press Enter once you're logged in > ")

        print("✓ Logged in. Starting apply flow...\n")

        # ── Navigate to job and apply ─────────────────────────────────────────
        handler = LinkedInHandler(
            page=page,
            llm_pool=llm_pool,
            resume_text="",
            profile=profile,
        )

        result = await handler.apply(TEST_URL)
        print(f"\n=== RESULT: {result} ===")

        if result.get("status") == "applied":
            print("✅ SUCCESS — Application submitted!")
        elif result.get("status") == "stuck":
            print("⏸ STUCK — Saving debug files...")
            os.makedirs("debug", exist_ok=True)
            await page.screenshot(path="debug/test_stuck.png", full_page=True)
            content = await page.content()
            with open("debug/test_stuck.html", "w", encoding="utf-8", errors="replace") as f:
                f.write(content)
            print("   Saved: debug/test_stuck.png + debug/test_stuck.html")
        elif result.get("status") == "skipped_external":
            print(f"⏭ SKIPPED (external apply): {result.get('reason')}")
        else:
            print(f"✗ FAILED: {result.get('reason')}")

        print("\nBrowser will stay open for 30s so you can inspect...")
        await asyncio.sleep(30)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
