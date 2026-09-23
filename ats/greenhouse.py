"""ats/greenhouse.py — Applier for boards.greenhouse.io postings."""

from ats.base import ATSHandler

class GreenhouseHandler(ATSHandler):
    SUBMIT_SELECTOR = "button#submit_app, input[type=submit][value*='Submit' i]"
    FILE_INPUT_SELECTOR = "input#resume, input[name='resume'], input[type=file]"

    async def apply(self) -> dict:
        try:
            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}
            await self.fill_known_fields()
            await self.upload_resume(self.resume.get("resume_path", ""))
            await self.fill_unknown_fields()
            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}
            await self.submit()
            try:
                await self.page.wait_for_selector(
                    "text=/thank you|application received|successfully submitted|application submitted/i",
                    timeout=20000,
                )
                return {"status": "applied", "reason": None}
            except Exception:
                return {"status": "stuck", "reason": "no submission confirmation detected"}
        except Exception as e:
            return {"status": "failed", "reason": str(e)}
