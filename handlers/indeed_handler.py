"""handlers/indeed_handler.py — Indeed's native "Indeed Apply" flow.

Indeed Apply is shaped just like LinkedIn Easy Apply: a multi-step modal
(often inside an iframe) with resume selection, contact fields, screener
questions, and a final submit. Rather than duplicating the whole step-loop
state machine (stuck-loop detection, batched LLM fallback, per-field-type
filling), IndeedHandler subclasses LinkedInHandler and only overrides the
three platform-specific pieces: how to find the Apply button, how to find
the active step container, and how to recognize a successful submission.
"""

from handlers.linkedin_handler import LinkedInHandler


class IndeedHandler(LinkedInHandler):
    async def detect_easy_apply_button(self):
        selectors = [
            '#indeedApplyButton',
            'button#indeedApplyButton',
            'button[id*="indeedApplyButton"]',
            '.jobsearch-IndeedApplyButton-newDesign',
            'button:has-text("Apply now")',
            'button:has-text("Apply Now")',
            'a:has-text("Apply now")',
            '[data-testid="indeedApplyButton"]',
        ]
        for sel in selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    return loc
            except Exception:
                continue
        return None

    async def detect_external_apply_button(self):
        selectors = [
            'a:has-text("Apply on company site")',
            'button:has-text("Apply on company site")',
            'a[href*="apply"]:visible',
        ]
        for sel in selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    return loc
            except Exception:
                continue
        return None

    async def find_application_container(self):
        dom_modal_selectors = [
            '#indeedapply-modal',
            '.indeed-apply-modal',
            'div[role="dialog"]',
            '[role="dialog"]',
        ]
        for sel in dom_modal_selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    return {"type": "dom", "root": loc, "target": self.page}
            except Exception:
                pass

        iframe_selectors = [
            'iframe[title*="Indeed Apply"]',
            'iframe[id*="indeedapply"]',
            'iframe[src*="indeedapply"]',
            'iframe',
        ]
        for sel in iframe_selectors:
            try:
                if await self.page.locator(sel).count() > 0:
                    frame = self.page.frame_locator(sel)
                    body = frame.locator("body")
                    if await body.count() > 0:
                        return {"type": "iframe", "root": body, "target": frame}
            except Exception:
                pass

        return {"type": "fallback", "root": self.page.locator("body"), "target": self.page}

    async def _verify_submission_confirmed(self, root) -> bool:
        confirmation_phrases = [
            "application submitted",
            "your application has been submitted",
            "you applied to",
            "application sent",
        ]
        try:
            text = await self.page.evaluate("document.body ? document.body.innerText : ''")
            text_lower = text.lower()
            for phrase in confirmation_phrases:
                if phrase in text_lower:
                    return True
        except Exception:
            pass
        return False
