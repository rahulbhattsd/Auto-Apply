"""ats/linkedin.py — LinkedIn Easy Apply flow."""

from ats.base import ATSHandler

class LinkedInHandler(ATSHandler):
    SUBMIT_SELECTOR = "button[aria-label*='Submit application']"

    async def apply(self) -> dict:
        page = self.page
        btn = await page.query_selector("button:has-text('Easy Apply')")
        if not btn:
            return {"status": "stuck", "reason": "no Easy Apply button (external/login wall)"}
        await btn.click()

        for _ in range(8):
            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}
            await self.fill_known_fields()
            await self.upload_resume(self.resume.get("resume_path", ""))
            await self.fill_unknown_fields()

            if await page.query_selector(self.SUBMIT_SELECTOR):
                await self.submit()
                return {"status": "applied", "reason": None}

            next_btn = await page.query_selector(
                "button[aria-label*='Continue to next step'], button:has-text('Next'), button:has-text('Review')"
            )
            if not next_btn:
                return {"status": "stuck", "reason": "unrecognized Easy Apply step"}
            await next_btn.click()
            await page.wait_for_timeout(800)

        return {"status": "stuck", "reason": "Easy Apply exceeded max steps"}
