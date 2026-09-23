"""ats/workday.py — Best-effort applier; Workday flows vary most per-tenant."""

from ats.base import ATSHandler

class WorkdayHandler(ATSHandler):
    SUBMIT_SELECTOR = "button[data-automation-id='bottom-navigation-next-button']"
    FILE_INPUT_SELECTOR = "input[data-automation-id='file-upload-input-ref']"

    async def apply(self) -> dict:
        page = self.page
        if await page.query_selector("input[data-automation-id='signInPassword']"):
            return {"status": "stuck", "reason": "Workday login/account creation required"}
        if reason := await self.check_barriers():
            return {"status": "stuck", "reason": reason}

        await self.fill_known_fields()
        await self.upload_resume(self.resume.get("resume_path", ""))
        await self.fill_unknown_fields()

        if reason := await self.check_barriers():
            return {"status": "stuck", "reason": reason}

        submit = await page.query_selector(self.SUBMIT_SELECTOR)
        if not submit:
            return {"status": "stuck", "reason": "non-standard Workday flow"}
        await submit.click()
        await page.wait_for_timeout(1500)

        if await page.query_selector("text=/review|complete/i"):
            return {"status": "applied", "reason": None}
        return {"status": "stuck", "reason": "Workday flow did not reach confirmation"}
