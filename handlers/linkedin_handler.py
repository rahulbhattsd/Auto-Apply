import asyncio
import os
import re
import yaml
from pathlib import Path
from playwright.async_api import Page, Locator
from core.llm import GroqPool


class LinkedInHandler:
    def __init__(self, page: Page, llm_pool: GroqPool = None, resume_text: str = "", profile: dict = None):
        self.page = page
        self.llm_pool = llm_pool
        self.resume_text = resume_text
        self.profile = profile or self._load_profile()

    def _load_profile(self) -> dict:
        profile_path = Path("profile.yaml")
        if profile_path.exists():
            try:
                with open(profile_path, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception:
                pass
        return {}

    async def detect_easy_apply_button(self):
        """Finds Easy Apply button across various possible selectors, aria-labels, and data attributes."""
        selectors = [
            'button[aria-label*="Easy Apply"]',
            'button[aria-label*="LinkedIn Apply"]',
            'button[aria-label*="easy apply"]',
            '[role="button"][aria-label*="Easy Apply"]',
            'a[aria-label*="Easy Apply"]',
            '[data-easy-apply-next-button]',
            '[data-control-name="jobdetails_topcard_inapply"]',
            '[data-control-name*="easy_apply"]',
            'button.jobs-apply-button',
            '.jobs-apply-button',
            'button:has-text("Easy Apply")',
            'button:has-text("LinkedIn Apply")',
            'a:has-text("Easy Apply")',
            '[role="button"]:has-text("Easy Apply")',
        ]
        for sel in selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0:
                    try:
                        if await loc.is_visible():
                            return loc
                    except Exception:
                        continue
            except Exception:
                continue
        return None

    async def detect_external_apply_button(self):
        """Finds external apply links/buttons."""
        selectors = [
            'a[aria-label*="Apply on"]',
            'a[data-control-name*="apply"]',
            'a[href*="apply"]:visible',
            'a:has-text("Apply")',
            'button:has-text("Apply")',
        ]
        for sel in selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0:
                    try:
                        if await loc.is_visible():
                            return loc
                    except Exception:
                        continue
            except Exception:
                continue
        return None

    async def find_application_container(self):
        """
        Dynamically detects active dialog or application modal.
        Searches DOM dialogs first, then iframes, avoiding single-iframe dependence.
        """
        dom_modal_selectors = [
            'div[role="dialog"]',
            '[role="dialog"]',
            '.artdeco-modal',
            '.jobs-easy-apply-modal',
            '[data-test-modal]',
            '.jobs-easy-apply-content',
        ]
        for sel in dom_modal_selectors:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    return {"type": "dom", "root": loc, "target": self.page}
            except Exception:
                pass

        iframe_selectors = [
            'iframe[title*="Easy Apply"]',
            'iframe[src*="easy-apply"]',
            'iframe[src*="/apply"]',
            'iframe[title*="Apply"]',
            'iframe[data-test-modal]',
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

    async def apply(self, job_url: str):
        # 1. Navigate to job page
        try:
            await self.page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            return {"status": "failed", "reason": f"Navigation failed: {e}"}
        await asyncio.sleep(0.3)

        # 2. Check for Easy Apply button vs External Apply
        easy_apply_btn = await self.detect_easy_apply_button()
        if not easy_apply_btn:
            external_btn = await self.detect_external_apply_button()
            if external_btn:
                return {"status": "skipped_external", "reason": "External application (no Easy Apply)"}
            return {"status": "skipped_external", "reason": "No Easy Apply button found"}

        # 3. Click Easy Apply
        try:
            await easy_apply_btn.click()
        except Exception as e:
            return {"status": "failed", "reason": f"Easy Apply click failed: {e}"}

        await asyncio.sleep(0.3)

        # 4. Find active application container dynamically
        container_info = None
        for _ in range(5):
            container_info = await self.find_application_container()
            if container_info and container_info.get("type") != "fallback":
                try:
                    if await container_info["root"].is_visible():
                        break
                except Exception:
                    pass
            await asyncio.sleep(0.2)

        root = container_info["root"] if container_info else self.page.locator("body")

        # 5. Process multi-step application form
        max_steps = 15
        submitted = False

        for step in range(max_steps):
            await asyncio.sleep(0.3)

            # Check if submission is already confirmed
            if await self._verify_submission_confirmed(root):
                submitted = True
                break

            # Fill form fields in current step container
            await self._fill_form_step(root)

            # Try step action buttons in priority order
            clicked_action = await self._click_next_or_submit(root)
            if not clicked_action:
                if await self._verify_submission_confirmed(root):
                    submitted = True
                break

        # 6. Final verification
        await asyncio.sleep(0.3)
        if submitted or await self._verify_submission_confirmed(root):
            return {"status": "applied", "reason": None}

        # Check if modal closed after submit
        try:
            modal_visible = False
            for sel in ['div[role="dialog"]', '.artdeco-modal', '.jobs-easy-apply-modal']:
                if await self.page.locator(sel).count() > 0 and await self.page.locator(sel).first.is_visible():
                    modal_visible = True
                    break
            if not modal_visible:
                return {"status": "applied", "reason": "Modal closed after submission"}
        except Exception:
            pass

        return {"status": "stuck", "reason": "Easy Apply flow incomplete or required fields missing"}

    async def _fill_form_step(self, root: Locator):
        """Extracts and fills fields present in current step root container."""
        await self._fill_resume_inputs(root)
        await self._fill_text_inputs(root)
        await self._fill_select_dropdowns(root)
        await self._fill_radio_groups(root)
        await self._fill_checkboxes(root)
        await self._fill_comboboxes(root)

    async def _get_field_label(self, element: Locator) -> str:
        """Gets accessible label, placeholder, aria-label, or associated label text for an element."""
        try:
            aria_label = await element.get_attribute("aria-label")
            if aria_label:
                return aria_label.strip()

            elem_id = await element.get_attribute("id")
            if elem_id:
                label_loc = self.page.locator(f'label[for="{elem_id}"]')
                if await label_loc.count() > 0:
                    txt = await label_loc.first.inner_text()
                    if txt:
                        return txt.strip()

            placeholder = await element.get_attribute("placeholder")
            if placeholder:
                return placeholder.strip()

            name_attr = await element.get_attribute("name")
            if name_attr:
                return name_attr.strip()

            parent_text = await element.evaluate("el => el.closest('label, div, fieldset')?.innerText || ''")
            if parent_text:
                lines = [l.strip() for l in parent_text.split('\n') if l.strip()]
                if lines:
                    return lines[0]
        except Exception:
            pass
        return ""

    def _resolve_profile_answer(self, label: str) -> str:
        """Resolves deterministic answer based on profile and common application questions."""
        lbl = label.lower()
        pers = self.profile.get("personal", {})
        links = self.profile.get("links", {})
        work = self.profile.get("work_eligibility", {})
        prefs = self.profile.get("preferences", {})

        if "first name" in lbl:
            return pers.get("first_name", "Rahul")
        if "last name" in lbl:
            return pers.get("last_name", "Bhatt")
        if "full name" in lbl or ("name" in lbl and "company" not in lbl and "title" not in lbl):
            return pers.get("full_name", f"{pers.get('first_name', 'Rahul')} {pers.get('last_name', 'Bhatt')}")
        if "email" in lbl:
            return pers.get("email", "rahul@example.com")
        if "phone" in lbl or "mobile" in lbl:
            return pers.get("phone", "+919876543210")
        if "city" in lbl or "location" in lbl:
            return pers.get("location", {}).get("city", "Bengaluru") if isinstance(pers.get("location"), dict) else "Bengaluru"
        if "linkedin" in lbl:
            return links.get("linkedin", "https://linkedin.com/in/rahulbhatt")
        if "github" in lbl:
            return links.get("github", "https://github.com/rahulbhatt")
        if "portfolio" in lbl or "website" in lbl:
            return links.get("portfolio", "https://rahulbhatt.dev")

        if "sponsorship" in lbl or "visa" in lbl:
            return "No" if not work.get("requires_sponsorship", False) else "Yes"
        if "authorized" in lbl or "legally" in lbl:
            return "Yes" if work.get("authorized_to_work", True) else "No"
        if "experience" in lbl or "years" in lbl:
            return str(prefs.get("years_of_experience", 3))
        if "salary" in lbl or "compensation" in lbl or "ctc" in lbl:
            return str(prefs.get("expected_salary", "1500000"))
        if "notice" in lbl:
            return str(prefs.get("notice_period_days", 30))

        if "gender" in lbl:
            return pers.get("gender", "Decline to self-identify")
        if "veteran" in lbl:
            return "No"
        if "disability" in lbl:
            return "No"

        return ""

    async def _fill_resume_inputs(self, root: Locator):
        try:
            file_inputs = root.locator('input[type="file"]')
            cnt = await file_inputs.count()
            if cnt > 0:
                resume_file = None
                possible_paths = [
                    self.profile.get("resume_path"),
                    "profiles/resumes/Rahul_Bhatt_Resume.pdf",
                    "profiles/resumes/resume.pdf",
                    "resume.pdf",
                ]
                for p in possible_paths:
                    if p and os.path.exists(p):
                        resume_file = os.path.abspath(p)
                        break

                if resume_file:
                    for i in range(cnt):
                        inp = file_inputs.nth(i)
                        try:
                            await inp.set_input_files(resume_file)
                        except Exception:
                            pass
        except Exception:
            pass

    async def _fill_text_inputs(self, root: Locator):
        try:
            inputs = root.locator('input[type="text"], input[type="number"], input[type="tel"], input:not([type]), textarea')
            cnt = await inputs.count()
            for i in range(cnt):
                inp = inputs.nth(i)
                try:
                    if not await inp.is_visible():
                        continue
                    curr_val = await inp.input_value()
                    if curr_val and len(curr_val.strip()) > 0:
                        continue

                    label = await self._get_field_label(inp)
                    val = self._resolve_profile_answer(label)

                    if not val and self.llm_pool and label:
                        fields_desc = [{"accessible_name": label, "type": "text"}]
                        mapping = await self.llm_pool.map_fields_batch(fields_desc, self.resume_text)
                        val = mapping.get(label, "")

                    if val:
                        await inp.fill(str(val))
                except Exception:
                    continue
        except Exception:
            pass

    async def _fill_select_dropdowns(self, root: Locator):
        try:
            selects = root.locator('select')
            cnt = await selects.count()
            for i in range(cnt):
                sel = selects.nth(i)
                try:
                    if not await sel.is_visible():
                        continue
                    label = await self._get_field_label(sel)
                    answer = self._resolve_profile_answer(label)

                    options = await sel.locator('option').all_inner_texts()
                    options = [o.strip() for o in options if o.strip()]

                    chosen_val = None
                    if answer:
                        for opt in options:
                            if answer.lower() in opt.lower():
                                chosen_val = opt
                                break
                    if not chosen_val and options:
                        chosen_val = options[1] if len(options) > 1 else options[0]

                    if chosen_val:
                        await sel.select_option(label=chosen_val)
                except Exception:
                    continue
        except Exception:
            pass

    async def _fill_radio_groups(self, root: Locator):
        try:
            fieldsets = root.locator('fieldset')
            cnt = await fieldsets.count()
            for i in range(cnt):
                fs = fieldsets.nth(i)
                radios = fs.locator('input[type="radio"]')
                if await radios.count() == 0:
                    continue

                is_any_checked = False
                for r_idx in range(await radios.count()):
                    if await radios.nth(r_idx).is_checked():
                        is_any_checked = True
                        break
                if is_any_checked:
                    continue

                legend = fs.locator('legend')
                label = await legend.inner_text() if await legend.count() > 0 else await self._get_field_label(fs)
                answer = self._resolve_profile_answer(label)

                radio_to_click = radios.first
                if answer:
                    for r_idx in range(await radios.count()):
                        r_item = radios.nth(r_idx)
                        r_lbl = await self._get_field_label(r_item)
                        if answer.lower() in r_lbl.lower():
                            radio_to_click = r_item
                            break

                try:
                    await radio_to_click.click(force=True)
                except Exception:
                    pass
        except Exception:
            pass

    async def _fill_checkboxes(self, root: Locator):
        try:
            checkboxes = root.locator('input[type="checkbox"]')
            cnt = await checkboxes.count()
            for i in range(cnt):
                cb = checkboxes.nth(i)
                try:
                    if await cb.is_visible() and not await cb.is_checked():
                        label = await self._get_field_label(cb)
                        if "agree" in label.lower() or "terms" in label.lower() or "privacy" in label.lower() or "acknowledge" in label.lower():
                            await cb.check(force=True)
                except Exception:
                    continue
        except Exception:
            pass

    async def _fill_comboboxes(self, root: Locator):
        try:
            combos = root.locator('[role="combobox"]')
            cnt = await combos.count()
            for i in range(cnt):
                cb = combos.nth(i)
                try:
                    if not await cb.is_visible():
                        continue
                    label = await self._get_field_label(cb)
                    val = self._resolve_profile_answer(label) or "India"
                    await cb.click()
                    await cb.fill(val)
                    await asyncio.sleep(0.1)
                    await self.page.keyboard.press("Enter")
                except Exception:
                    continue
        except Exception:
            pass

    async def _click_next_or_submit(self, root: Locator) -> bool:
        """Attempts to click step progression buttons in order of priority."""
        button_selectors = [
            'button[aria-label="Submit application"]',
            'button[aria-label*="Submit application"]',
            'button[aria-label="Continue to next step"]',
            'button[aria-label="Review your application"]',
            'button[aria-label*="Submit"]',
            'button[aria-label*="Next"]',
            'button[aria-label*="Review"]',
            'button[aria-label*="Continue"]',
            'button:has-text("Submit application")',
            'button:has-text("Review")',
            'button:has-text("Next")',
            'button:has-text("Continue")',
            'footer button[type="submit"]',
            'button[type="submit"]',
        ]
        for sel in button_selectors:
            try:
                btn = root.locator(sel).first
                if await btn.count() > 0:
                    try:
                        if await btn.is_visible() and await btn.is_enabled():
                            await btn.click()
                            return True
                    except Exception:
                        continue
            except Exception:
                continue

        button_names = [
            "Submit application",
            "Submit",
            "Review",
            "Next",
            "Continue to next step",
            "Continue",
        ]
        for name in button_names:
            try:
                btn = root.get_by_role("button", name=re.compile(rf"^{name}$", re.I)).first
                if await btn.count() > 0 and await btn.is_visible() and await btn.is_enabled():
                    await btn.click()
                    return True
            except Exception:
                continue
        return False

    async def _verify_submission_confirmed(self, root: Locator) -> bool:
        """Verifies if application submission confirmation text is present."""
        confirmation_phrases = [
            "application submitted",
            "your application was sent",
            "application was submitted",
            "thank you for applying",
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
