"""ats/ashby.py — Applier for jobs.ashbyhq.com postings.

Ashby forms are usually a single page (no multi-step modal), close in
shape to Greenhouse/Lever: known fields, one resume upload, a handful of
custom questions, one submit button.
"""

from ats.base import ATSHandler


class AshbyHandler(ATSHandler):
    SUBMIT_SELECTOR = "button[type=submit], button:has-text('Submit Application'), button:has-text('Submit')"
    FILE_INPUT_SELECTOR = "input[type=file]"

    async def apply(self) -> dict:
        try:
            try:
                await self.page.goto(self.job.get("url", ""), wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                return {"status": "failed", "reason": f"Navigation failed: {e}"}

            if await self.page.query_selector(
                "input[type=password], form[action*=login], form[action*=signin]"
            ):
                return {"status": "stuck", "reason": "login wall detected"}
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
                    "text=/application (received|submitted)|thank you for applying|we('ve| have) received your application/i",
                    timeout=20000,
                )
                return {"status": "applied", "reason": None}
            except Exception:
                return {"status": "stuck", "reason": "no submission confirmation detected"}
        except Exception as e:
            return {"status": "failed", "reason": str(e)}
