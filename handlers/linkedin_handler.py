import asyncio
from playwright.async_api import Page
from core.llm import GroqPool


class LinkedInHandler:
    def __init__(self, page: Page, llm_pool: GroqPool, resume_text: str):
        self.page = page
        self.llm_pool = llm_pool
        self.resume_text = resume_text

    async def apply(self, job_url: str):
        # 1. Navigate to job page
        try:
            await self.page.goto(job_url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            return {"status": "failed", "reason": f"Navigation failed: {e}"}
        await asyncio.sleep(3)

        # 2. Check for Easy Apply button FIRST (before touching iframe)
        easy_apply = self.page.locator('button:has-text("Easy Apply")').first
        try:
            await easy_apply.wait_for(state="visible", timeout=8000)
        except Exception:
            # Check if it's an external application link
            external = self.page.locator('a:has-text("Apply"), button:has-text("Apply")').first
            try:
                if await external.count() > 0 and await external.is_visible():
                    return {"status": "skipped", "reason": "External application (no Easy Apply)"}
            except Exception:
                pass
            return {"status": "skipped", "reason": "No Easy Apply button"}

        # 3. Click Easy Apply
        try:
            await easy_apply.click()
        except Exception as e:
            return {"status": "failed", "reason": f"Easy Apply click failed: {e}"}

        await asyncio.sleep(3)

        # 4. NOW look for the modal iframe
        iframe_selector = 'iframe[title*="Easy Apply"], iframe[src*="easy-apply"], iframe[title*="Apply"]'
        modal = self.page.frame_locator(iframe_selector)

        iframe_attached = False
        for _ in range(10):
            try:
                cnt = await self.page.locator(iframe_selector).count()
                if cnt > 0:
                    iframe_attached = True
                    break
            except Exception:
                pass
            await asyncio.sleep(1)

        if not iframe_attached:
            return {"status": "failed", "reason": "Easy Apply modal iframe did not appear"}

        # 5. Step through the multi-step modal
        try:
            await modal.locator("body").wait_for(state="attached", timeout=10000)
        except Exception as e:
            return {"status": "failed", "reason": f"Modal body not found: {e}"}

        max_steps = 15
        submitted = False
        for step in range(max_steps):
            await asyncio.sleep(2)

            # Check for submit confirmation
            try:
                page_text = await self.page.evaluate(
                    "document.body ? document.body.innerText : ''"
                )
                if "Application submitted" in page_text or "Your application was sent" in page_text:
                    submitted = True
                    break
            except Exception:
                pass

            # Try buttons in priority order
            clicked = False
            for btn_name in ["Submit application", "Review", "Next", "Continue"]:
                try:
                    btn = modal.get_by_role("button", name=btn_name).first
                    if await btn.count() > 0 and await btn.is_visible():
                        await btn.click()
                        clicked = True
                        await asyncio.sleep(2)
                        break
                except Exception:
                    continue

            if not clicked:
                # No more buttons - could be done or stuck
                break

        # 6. Determine final status
        await asyncio.sleep(2)
        try:
            final_text = await self.page.evaluate("document.body ? document.body.innerText : ''")
            if "Application submitted" in final_text or "Your application was sent" in final_text:
                return {"status": "success"}
        except Exception:
            pass

        # Check if iframe closed (modal dismissed)
        try:
            iframe_count = await self.page.locator(iframe_selector).count()
            if iframe_count == 0:
                return {"status": "success", "reason": "Modal closed after submit"}
        except Exception:
            pass

        return {"status": "failed", "reason": "Easy Apply flow incomplete or stuck"}
