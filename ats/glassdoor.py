"""ats/glassdoor.py — Applier for glassdoor.com job postings.

Glassdoor rarely hosts its own application form. Most listings either:
  (a) open an "Easy Apply"-style modal on Glassdoor itself, or
  (b) open the real ATS (Greenhouse/Lever/Workday/company career page) in
      a new tab/window when you click "Apply".

For (b), rather than guessing, this handler waits for the popup, reads its
final URL, and re-dispatches through core.router.get_handler so the job
gets handled by whatever ATS it actually landed on - the same logic
main.py uses for the initial job URL.
"""

from ats.base import ATSHandler


class GlassdoorHandler(ATSHandler):
    APPLY_SELECTORS = [
        'button:has-text("Easy Apply")',
        'a:has-text("Easy Apply")',
        'button:has-text("Apply Now")',
        'a:has-text("Apply Now")',
        'button:has-text("Apply")',
        'a:has-text("Apply")',
    ]

    async def apply(self) -> dict:
        page = self.page
        try:
            await page.goto(self.job.get("url", ""), wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            return {"status": "failed", "reason": f"Navigation failed: {e}"}

        if reason := await self.check_barriers():
            return {"status": "stuck", "reason": reason}

        apply_btn = None
        for sel in self.APPLY_SELECTORS:
            try:
                loc = page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    apply_btn = loc
                    break
            except Exception:
                continue

        if not apply_btn:
            return {"status": "skipped_external", "reason": "No apply button found on Glassdoor listing"}

        # Click and see whether a new tab opens (external ATS) or the
        # current page grows a form (native Glassdoor/Indeed apply).
        try:
            async with page.context.expect_page(timeout=6000) as new_page_info:
                await apply_btn.click()
            new_page = await new_page_info.value
            await new_page.wait_for_load_state("domcontentloaded", timeout=15000)
            resolved_url = new_page.url
        except Exception:
            new_page = None
            resolved_url = page.url

        if new_page and new_page is not page:
            kind, handler_cls = _resolve(resolved_url)
            if kind == "self_nav":
                handler = handler_cls(new_page, self.pool, str(self.resume.get("resume_text", "")), self.profile)
                return await handler.apply(resolved_url)
            job = {**self.job, "url": resolved_url}
            handler = handler_cls(new_page, job, self.profile, self.resume, self.pool)
            return await handler.apply()

        # No popup - Glassdoor (or Indeed, which now backs most Glassdoor
        # apply flows) rendered the form in place. Fall back to the same
        # generic best-effort fill used for unrecognized career pages.
        if reason := await self.check_barriers():
            return {"status": "stuck", "reason": reason}
        await self.fill_known_fields()
        await self.upload_resume(self.resume.get("resume_path", ""))
        await self.fill_unknown_fields()
        if reason := await self.check_barriers():
            return {"status": "stuck", "reason": reason}
        await self.submit()
        try:
            await page.wait_for_selector(
                "text=/application (received|submitted)|thank you for applying/i", timeout=20000
            )
            return {"status": "applied", "reason": None}
        except Exception:
            return {"status": "stuck", "reason": "no submission confirmation detected"}


def _resolve(url: str):
    from core.router import get_handler
    return get_handler(url)
