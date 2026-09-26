"""ats/generic.py — Fallback for unrecognized ATS platforms."""

from ats.base import ATSHandler


class GenericHandler(ATSHandler):
    async def apply(self) -> dict:
        try:
            try:
                await self.page.goto(self.job.get("url", ""), wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                return {"status": "failed", "reason": f"Navigation failed: {e}"}

            if not self.page.url or self.page.url.startswith("about:"):
                return {"status": "failed", "reason": "site unreachable"}

            if reason := await self.check_barriers():
                return {"status": "stuck", "reason": reason}

            try:
                await self.page.evaluate(
                    "window.scrollTo(0, document.body.scrollHeight)"
                )
                await self.page.wait_for_timeout(500)
            except Exception:
                pass

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
                title = await self.page.title()
                return {"status": "stuck", "reason": f"no confirmation detected (page: {title[:40]})"}

        except Exception as e:
            return {"status": "failed", "reason": str(e)}