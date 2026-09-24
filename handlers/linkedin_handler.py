import asyncio
import re
from playwright.async_api import Page
from core.dom_utils import extract_all_form_fields, find_and_fill_field
from core.llm import GroqPool

class LinkedInHandler:
    def __init__(self, page: Page, llm_pool: GroqPool, resume_text: str):
        self.page = page
        self.llm_pool = llm_pool
        self.resume_text = resume_text
        self.phone = self._extract_phone(resume_text)
        self.email = self._extract_email(resume_text)

    def _extract_phone(self, text: str) -> str:
        if not text:
            return "123-456-7890"
        match = re.search(r'Phone:\s*([^\n]+)', text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        match = re.search(r'(\+?\d[\d\s\-\(\)]{7,}\d)', text)
        return match.group(1).strip() if match else "123-456-7890"

    def _extract_email(self, text: str) -> str:
        if not text:
            return "your@email.com"
        match = re.search(r'Email:\s*([^\n]+)', text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        return match.group(0).strip() if match else "your@email.com"

    async def apply(self, job_url: str):
        await self.page.goto(job_url, wait_until="networkidle")
        await asyncio.sleep(2)

        # 1. Click the "Easy Apply" button
        easy_apply_btn = self.page.get_by_role("button", name="Easy Apply")
        if not await easy_apply_btn.is_visible():
            # Try alternative selectors
            easy_apply_btn = self.page.locator('button[aria-label*="Easy Apply"]')
        if not await easy_apply_btn.is_visible():
            return {"status": "failed", "reason": "Easy Apply button not found"}

        await easy_apply_btn.click()
        await asyncio.sleep(3)

        # 2. Handle the multi-step modal (inside iframe + shadow DOM)
        # LinkedIn's Easy Apply modal is inside a same-origin iframe
        modal_frame = self.page.frame_locator('iframe[title*="Easy Apply"]')
        # If the iframe title changes, try a generic iframe locator
        if await modal_frame.locator("body").count() == 0:
            modal_frame = self.page.frame_locator("iframe").first

        max_steps = 10
        for step in range(max_steps):
            # Check if the modal is still open
            if await modal_frame.locator("body").count() == 0:
                break  # Modal closed, likely submitted

            # Extract field metadata using a frame-aware script
            field_data = await self._extract_fields_from_frame(modal_frame)

            # Separate known and unknown fields
            known_fields = {}
            unknown_fields = []
            for field in field_data:
                name = field.get('accessible_name', '').lower()
                if 'phone' in name and 'phone' not in known_fields:
                    known_fields[field['accessible_name']] = self.phone
                elif 'email' in name:
                    known_fields[field['accessible_name']] = self.email
                else:
                    unknown_fields.append(field)

            # Fill known fields
            for field_name, value in known_fields.items():
                await self._fill_field_in_frame(modal_frame, field_name, value)

            # Ask LLM for unknown fields
            if unknown_fields:
                mapping = await self.llm_pool.map_fields_batch(unknown_fields, self.resume_text)
                if isinstance(mapping, dict):
                    for field_name, value in mapping.items():
                        if value:
                            await self._fill_field_in_frame(modal_frame, field_name, value)

            # Click "Next", "Review", or "Submit"
            next_btn = modal_frame.get_by_role("button", name="Next")
            if not await next_btn.is_visible():
                next_btn = modal_frame.get_by_role("button", name="Review")
            if not await next_btn.is_visible():
                next_btn = modal_frame.get_by_role("button", name="Submit application")
            if not await next_btn.is_visible():
                # Try generic submit button
                next_btn = modal_frame.locator('button[type="submit"]')

            if await next_btn.is_visible():
                await next_btn.click()
                await asyncio.sleep(2)
            else:
                break  # No next button, maybe we are done

        # Check for success
        success_msg = self.page.get_by_text("Application submitted")
        if await success_msg.is_visible():
            return {"status": "success"}
        else:
            return {"status": "failed", "reason": "Could not complete Easy Apply flow"}

    async def _extract_fields_from_frame(self, frame_locator) -> list[dict]:
        """Extract field metadata from within an iframe using a JS evaluation on the frame's document."""
        target_frame = None
        for frame in self.page.frames:
            if frame != self.page.main_frame and ("easy-apply" in frame.url.lower() or "job" in frame.url.lower()):
                target_frame = frame
                break
        if not target_frame and len(self.page.frames) > 1:
            target_frame = self.page.frames[1]

        if target_frame:
            return await extract_all_form_fields(target_frame)
        return await extract_all_form_fields(self.page)

    async def _fill_field_in_frame(self, frame_locator, field_name: str, value: str):
        try:
            loc = frame_locator.get_by_label(field_name, exact=False)
            if await loc.count() > 0:
                await loc.first.fill(str(value))
                return True
        except Exception:
            pass
        try:
            loc = frame_locator.locator(f'[name="{field_name}"]')
            if await loc.count() > 0:
                await loc.first.fill(str(value))
                return True
        except Exception:
            pass
        return False
