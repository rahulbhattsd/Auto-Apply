"""ats/generic.py — Fallback for unrecognized ATS platforms."""

from ats.base import ATSHandler

class GenericHandler(ATSHandler):
    async def apply(self) -> dict:
        try:
            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}
            await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await self.fill_known_fields()
            await self.upload_resume(self.resume.get("resume_path", ""))
            await self.fill_unknown_fields()
            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}
            await self.submit()
            try:
                await self.page.wait_for_selector(
                    "text=/thank you|application received|success|confirmation/i",
                    timeout=20000,
                )
                return {"status": "applied", "reason": None}
            except Exception:
                return {"status": "stuck", "reason": "no submission confirmation detected"}
        except Exception as e:
            return {"status": "failed", "reason": str(e)}
