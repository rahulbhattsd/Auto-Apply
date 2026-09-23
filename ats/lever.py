"""ats/lever.py — Applier for jobs.lever.co postings."""

from ats.base import ATSHandler

class LeverHandler(ATSHandler):
    FILE_INPUT_SELECTOR = "input[name=resume], input[type=file]"

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
                    "text=/thanks for applying|application submitted|we have received your application/i",
                    timeout=20000,
                )
                return {"status": "applied", "reason": None}
            except Exception:
                return {"status": "stuck", "reason": "no submission confirmation detected"}
        except Exception as e:
            return {"status": "failed", "reason": str(e)}
