"""handlers/linkedin_handler.py — Complete rewrite for LinkedIn's 2026 hashed-CSS design.

Key findings from real DOM analysis (debug HTML files):
- LinkedIn now uses FULLY HASHED CSS classes (bae35a6a, _340877d5, etc.)
  → artdeco-modal, artdeco-button--primary selectors are ALL dead.
- The Easy Apply modal is NOT a role=dialog — it renders as a full-page overlay.
- The "Next/Submit" button lives inside a <footer> tag.
- Form field IDs are also hashed — must use aria-label, label[for], or JS traversal.
- Success confirmation uses text phrases, NOT class selectors.

Strategy:
1. Use text-content + role selectors exclusively (not class-based).
2. Find modal by detecting the progress bar (SVG progressbar role) — unique to EA modal.
3. Find Next/Submit button by text content in <footer>.
4. Use page.get_by_role() + page.get_by_text() — Playwright's text-matching is hash-immune.
5. One batched Groq call per step for unknown fields (token-frugal).
"""

import asyncio
import json
import os
import re
import yaml
from pathlib import Path
from playwright.async_api import Page, Locator


class LinkedInHandler:
    def __init__(self, page: Page, llm_pool=None, resume_text: str = "", profile: dict = None):
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

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 1: Detect Easy Apply button (text-based, hash-immune)
    # ─────────────────────────────────────────────────────────────────────────
    async def detect_easy_apply_button(self):
        """Find Easy Apply button using text + aria-label (NOT class selectors)."""
        # Priority 1: aria-label (most reliable)
        aria_candidates = [
            'button[aria-label*="Easy Apply"]',
            'button[aria-label*="easy apply"]',
            '[role="button"][aria-label*="Easy Apply"]',
            '[data-control-name="jobdetails_topcard_inapply"]',
            '[data-control-name*="easy_apply"]',
        ]
        for sel in aria_candidates:
            try:
                loc = self.page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    return loc
            except Exception:
                continue

        # Priority 2: text-based (handles hashed classes)
        text_candidates = ["Easy Apply", "LinkedIn Easy Apply"]
        for text in text_candidates:
            try:
                loc = self.page.get_by_role("button", name=re.compile(text, re.I)).first
                if await loc.count() > 0 and await loc.is_visible():
                    return loc
            except Exception:
                continue

        # Priority 3: any button containing "Easy Apply" text anywhere
        try:
            loc = self.page.locator("button").filter(has_text=re.compile(r"easy apply", re.I)).first
            if await loc.count() > 0 and await loc.is_visible():
                return loc
        except Exception:
            pass

        return None

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 2: Wait for modal / form to appear
    # ─────────────────────────────────────────────────────────────────────────
    async def _wait_for_modal(self, timeout: float = 8.0) -> bool:
        """
        Wait for the Easy Apply form modal to appear.
        Detection strategy: look for a <footer> with a Next/Continue/Submit/Review button,
        OR a progress bar (SVG role=progressbar unique to EA modal),
        OR any form input appearing after Easy Apply click.
        """
        elapsed = 0.0
        poll = 0.3
        while elapsed < timeout:
            try:
                # Check for footer with action button (the definitive modal signal)
                footer_btn = await self._find_action_button()
                if footer_btn:
                    return True

                # Check for progressbar (LinkedIn EA modal always shows step progress)
                pb = self.page.locator('[role="progressbar"]')
                if await pb.count() > 0:
                    return True
            except Exception:
                pass
            await asyncio.sleep(poll)
            elapsed += poll
        return False

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 3: Find the primary action button (Next / Review / Submit)
    # ─────────────────────────────────────────────────────────────────────────
    async def _find_action_button(self) -> Locator | None:
        """
        Finds the primary CTA button using TEXT not class selectors.
        LinkedIn's new design puts the CTA inside <footer>.
        We try footer-scoped text match first, then page-wide.
        """
        action_texts = [
            "Submit application",
            "Submit",
            "Review your application",
            "Review",
            "Continue to next step",
            "Next",
            "Continue",
            "Save",
        ]

        # Try footer-scoped first (most reliable — avoids nav/sidebar buttons)
        for text in action_texts:
            try:
                # Playwright's filter(has_text) is hash-immune
                btn = self.page.locator("footer button").filter(
                    has_text=re.compile(rf"^{re.escape(text)}$", re.I)
                ).first
                if await btn.count() > 0:
                    vis = await btn.is_visible()
                    enabled = await btn.is_enabled()
                    if vis and enabled:
                        return btn
            except Exception:
                continue

        # Fallback: page-wide by exact role+name match (Playwright locator is text-based)
        for text in action_texts:
            try:
                btn = self.page.get_by_role(
                    "button", name=re.compile(rf"^{re.escape(text)}$", re.I)
                ).first
                if await btn.count() > 0:
                    vis = await btn.is_visible()
                    enabled = await btn.is_enabled()
                    if vis and enabled:
                        return btn
            except Exception:
                continue

        # Last resort: any footer button that isn't Dismiss/Close/Back
        try:
            skip_texts = re.compile(r"dismiss|close|discard|back|cancel|linkedin", re.I)
            all_footer_btns = self.page.locator("footer button")
            count = await all_footer_btns.count()
            for i in range(count):
                btn = all_footer_btns.nth(i)
                try:
                    txt = (await btn.inner_text()).strip()
                    if txt and not skip_texts.search(txt) and await btn.is_visible() and await btn.is_enabled():
                        return btn
                except Exception:
                    continue
        except Exception:
            pass

        return None

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 4: Detect submission confirmed
    # ─────────────────────────────────────────────────────────────────────────
    async def _verify_submission_confirmed(self) -> bool:
        """
        Checks for real submission confirmation — text-based only since
        LinkedIn's success toast classes are now hashed too.
        """
        confirmation_phrases = [
            "application submitted",
            "your application was sent",
            "application was submitted",
            "thank you for applying",
            "application sent",
            "your application has been sent",
            "you applied",
            "successfully applied",
        ]
        try:
            text = await self.page.evaluate("document.body ? document.body.innerText.toLowerCase() : ''")
            for phrase in confirmation_phrases:
                if phrase in text:
                    return True
        except Exception:
            pass

        # Also check for the done/success header text visible on page
        try:
            done_loc = self.page.get_by_text(
                re.compile(r"application submitted|you applied|application sent", re.I)
            ).first
            if await done_loc.count() > 0 and await done_loc.is_visible():
                return True
        except Exception:
            pass

        return False

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 5: Step-change fingerprint (stuck-loop detection)
    # ─────────────────────────────────────────────────────────────────────────
    async def _step_signature(self) -> str:
        """Hash of visible form field states — changes when Next advances the form."""
        import hashlib
        try:
            sig = await self.page.evaluate("""
                () => {
                    const els = document.querySelectorAll(
                        'input:not([type=hidden]), select, textarea, [role="combobox"]'
                    );
                    return Array.from(els).map(el => {
                        const label = el.getAttribute('aria-label') || el.id || el.name || '';
                        const val = el.value || '';
                        return label + ':' + (val.trim() ? '1' : '0');
                    }).join('|');
                }
            """)
        except Exception:
            sig = ""
        return hashlib.sha256((sig or "").encode()).hexdigest()

    async def _wait_for_step_change(self, prev_sig: str, timeout: float = 8.0) -> bool:
        """Poll until form content changes or confirmation appears."""
        elapsed = 0.0
        poll = 0.3
        while elapsed < timeout:
            if await self._verify_submission_confirmed():
                return True
            sig = await self._step_signature()
            if sig != prev_sig:
                return True
            await asyncio.sleep(poll)
            elapsed += poll
        return False

    # ─────────────────────────────────────────────────────────────────────────
    # MAIN APPLY FLOW
    # ─────────────────────────────────────────────────────────────────────────
    async def apply(self, job_url: str) -> dict:
        # 1. Navigate
        try:
            await self.page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            return {"status": "failed", "reason": f"Navigation failed: {e}"}

        await asyncio.sleep(1.0)  # Let SPA hydrate

        # 2. Find Easy Apply button
        easy_apply_btn = await self.detect_easy_apply_button()
        if not easy_apply_btn:
            return {"status": "skipped_external", "reason": "No Easy Apply button found"}

        # 3. Click Easy Apply
        try:
            await easy_apply_btn.scroll_into_view_if_needed()
            await easy_apply_btn.click(timeout=5000)
        except Exception as e:
            return {"status": "failed", "reason": f"Easy Apply click failed: {e}"}

        # 4. Wait for modal to appear
        modal_appeared = await self._wait_for_modal(timeout=8.0)
        if not modal_appeared:
            return {"status": "failed", "reason": "Easy Apply modal did not appear after click"}

        # 5. Multi-step form loop
        max_steps = 20
        submitted = False
        prev_sig = await self._step_signature()
        stagnant_count = 0

        for step in range(max_steps):
            print(f"  [EA] Step {step + 1}/{max_steps}")

            # Check if already submitted
            if await self._verify_submission_confirmed():
                submitted = True
                break

            # Fill all visible form fields
            await self._fill_form_step()

            # Small wait for any auto-fill effects to settle
            await asyncio.sleep(0.5)

            # Find and click the action button
            action_btn = await self._find_action_button()
            if not action_btn:
                # No action button found — check if submission happened
                if await self._verify_submission_confirmed():
                    submitted = True
                break

            # Log what we're clicking
            try:
                btn_text = (await action_btn.inner_text()).strip()
                print(f"  [EA]   Clicking: '{btn_text}'")
            except Exception:
                btn_text = "?"

            # Click with scroll + force as fallback
            clicked = False
            try:
                await action_btn.scroll_into_view_if_needed()
                await action_btn.click(timeout=5000)
                clicked = True
            except Exception:
                try:
                    await action_btn.click(force=True, timeout=5000)
                    clicked = True
                except Exception as e:
                    print(f"  [EA]   Click failed: {e}")

            if not clicked:
                stagnant_count += 1
                if stagnant_count >= 3:
                    break
                continue

            # Wait for form to advance
            changed = await self._wait_for_step_change(prev_sig, timeout=8.0)

            if await self._verify_submission_confirmed():
                submitted = True
                break

            if not changed:
                stagnant_count += 1
                print(f"  [EA]   Form didn't advance (stagnant={stagnant_count})")
                if stagnant_count >= 2:
                    # Try one last time with force click on any submit button
                    try:
                        submit_btn = self.page.get_by_role(
                            "button", name=re.compile(r"submit", re.I)
                        ).first
                        if await submit_btn.count() > 0:
                            await submit_btn.click(force=True, timeout=5000)
                            await asyncio.sleep(2.0)
                            if await self._verify_submission_confirmed():
                                submitted = True
                    except Exception:
                        pass
                    break
            else:
                stagnant_count = 0
                prev_sig = await self._step_signature()

        # 6. Final result
        await asyncio.sleep(1.0)
        if submitted or await self._verify_submission_confirmed():
            return {"status": "applied", "reason": None}

        return {
            "status": "stuck",
            "reason": "Easy Apply flow ended without confirmed submission — debug files saved"
        }

    # ─────────────────────────────────────────────────────────────────────────
    # FORM FILLING
    # ─────────────────────────────────────────────────────────────────────────
    async def _fill_form_step(self):
        """Fill all visible form fields in the current step."""
        await self._fill_resume_upload()
        await self._fill_text_and_number_inputs()
        await self._fill_select_dropdowns()
        await self._fill_radio_groups()
        await self._fill_checkboxes()
        await self._fill_comboboxes()

    async def _get_field_label(self, element: Locator) -> str:
        """Get accessible label for a field — multiple fallback strategies."""
        try:
            # aria-label (best)
            aria = await element.get_attribute("aria-label")
            if aria and aria.strip():
                return aria.strip()

            # aria-labelledby
            labelledby = await element.get_attribute("aria-labelledby")
            if labelledby:
                try:
                    label_text = await self.page.locator(f"#{labelledby}").inner_text()
                    if label_text.strip():
                        return label_text.strip()
                except Exception:
                    pass

            # label[for=id]
            elem_id = await element.get_attribute("id")
            if elem_id:
                try:
                    label_loc = self.page.locator(f'label[for="{elem_id}"]')
                    if await label_loc.count() > 0:
                        txt = await label_loc.first.inner_text()
                        if txt.strip():
                            return txt.strip()
                except Exception:
                    pass

            # placeholder
            ph = await element.get_attribute("placeholder")
            if ph and ph.strip():
                return ph.strip()

            # name attribute
            name = await element.get_attribute("name")
            if name and name.strip():
                return name.strip()

            # Parent text (legend, nearby label)
            parent_text = await element.evaluate(
                "el => (el.closest('fieldset, div, section')?.querySelector('legend, label')?.innerText || '')"
            )
            if parent_text and parent_text.strip():
                return parent_text.strip().split('\n')[0]

        except Exception:
            pass
        return ""

    def _resolve_profile_answer(self, label: str) -> str:
        """Resolve deterministic answers from profile — zero token cost."""
        if not label:
            return ""
        lbl = label.lower().strip()
        pers = self.profile.get("personal", {}) or {}
        links = self.profile.get("links", {}) or {}
        work = self.profile.get("eligibility", {}) or {}
        prefs = self.profile.get("preferences", {}) or {}
        job_s = self.profile.get("job_search", {}) or {}
        edu = self.profile.get("education", {}) or {}

        # Personal info
        if "first name" in lbl:
            return pers.get("first_name", "Rahul")
        if "last name" in lbl or "surname" in lbl:
            return pers.get("last_name", "Bhatt")
        if ("full name" in lbl or "your name" in lbl) and "company" not in lbl:
            return pers.get("full_name", "Rahul Bhatt")
        if "email" in lbl:
            return pers.get("email", "rahulbhatt.tech@gmail.com")
        if "phone" in lbl or "mobile" in lbl or "contact number" in lbl:
            return pers.get("phone", "+917898372675")
        if "city" in lbl:
            loc = pers.get("location", {})
            return (loc.get("city") if isinstance(loc, dict) else str(loc)) or "Bangalore"
        if "state" in lbl and "united" not in lbl:
            loc = pers.get("location", {})
            return (loc.get("state") if isinstance(loc, dict) else "") or "Karnataka"
        if "country" in lbl:
            return "India"
        if "pincode" in lbl or "zip" in lbl or "postal" in lbl:
            loc = pers.get("location", {})
            return (loc.get("pincode") if isinstance(loc, dict) else "") or "482001"

        # Links
        if "linkedin" in lbl and "url" in lbl:
            return links.get("linkedin", "https://www.linkedin.com/in/rahulbhatt-developer/")
        if "github" in lbl:
            return links.get("github", "https://github.com/rahulbhattsd")
        if "portfolio" in lbl or "website" in lbl or "personal url" in lbl:
            return links.get("portfolio", "https://rahulbhattsd.github.io/rahul-portfolio/")

        # Education
        if "degree" in lbl or "qualification" in lbl:
            return edu.get("degree", "B.Tech")
        if "university" in lbl or "college" in lbl or "institution" in lbl:
            return edu.get("institute", "Gyan Ganga Institute of Technology and Sciences")
        if "major" in lbl or "branch" in lbl or "specialization" in lbl:
            return edu.get("branch", "Computer Science and Engineering")
        if "graduation year" in lbl or "pass out" in lbl or "batch" in lbl:
            return str(edu.get("batch_end", "2026"))
        if "cgpa" in lbl or "gpa" in lbl or "percentage" in lbl or "grade" in lbl:
            return str(edu.get("cgpa", "7.41"))

        # Work eligibility
        if "sponsorship" in lbl or "visa" in lbl:
            return "No" if not work.get("require_visa_sponsorship", False) else "Yes"
        if "authorized" in lbl or "legally" in lbl or "eligible to work" in lbl:
            return "Yes" if work.get("authorized_to_work_in_india", True) else "No"
        if "work authorization" in lbl:
            return "India"

        # Experience
        if any(x in lbl for x in ["experience", "years", "yoe", "yrs", "how long", "how many year"]):
            return str(self.profile.get("experience", {}).get("total_professional_experience_years", 0))

        # Salary / Compensation
        if any(x in lbl for x in ["salary", "compensation", "ctc", "pay", "package"]):
            return prefs.get("expected_ctc", "As per company standards")

        # Notice period
        if "notice" in lbl:
            return str(job_s.get("notice_period_days", 0))

        # Common yes/no questions — always answer positively
        if any(x in lbl for x in ["relocate", "willing to move", "open to travel"]):
            return "Yes"
        if any(x in lbl for x in ["background check", "drug test", "background verification"]):
            return "Yes"
        if any(x in lbl for x in ["commut", "in-office", "hybrid"]):
            return "Yes"
        if "have you" in lbl or "do you have" in lbl or "are you" in lbl:
            return "Yes"
        if "remote" in lbl and ("work" in lbl or "prefer" in lbl):
            return "Yes"

        # Demographics (optional)
        if "gender" in lbl:
            return pers.get("gender", "Prefer not to say") or "Prefer not to say"
        if "veteran" in lbl:
            return "I am not a protected veteran"
        if "disability" in lbl:
            return "No, I don't have a disability"

        return ""

    async def _fill_resume_upload(self):
        """Upload resume file to any file input."""
        try:
            file_inputs = self.page.locator('input[type="file"]')
            cnt = await file_inputs.count()
            if cnt == 0:
                return

            resume_file = None
            possible_paths = [
                self.profile.get("resume_path"),
                self.profile.get("resume_file"),
                "profiles/resumes/Rahul_Bhatt_Resume.pdf",
                "profiles/resumes/resume.pdf",
                "resumes/resume.pdf",
                "resume.pdf",
            ]
            for p in possible_paths:
                if p and os.path.exists(str(p)):
                    resume_file = os.path.abspath(str(p))
                    break

            if resume_file:
                for i in range(cnt):
                    inp = file_inputs.nth(i)
                    try:
                        await inp.set_input_files(resume_file)
                        print(f"  [EA] Resume uploaded: {os.path.basename(resume_file)}")
                    except Exception:
                        pass
            else:
                print("  [EA] WARNING: No resume file found to upload!")
        except Exception:
            pass

    async def _fill_text_and_number_inputs(self):
        """Fill text/number/tel/textarea inputs. Batch unknown fields into ONE LLM call."""
        try:
            inputs = self.page.locator(
                'input[type="text"], input[type="number"], input[type="tel"], '
                'input[type="email"], input[type="url"], input:not([type]), textarea'
            )
            cnt = await inputs.count()
            pending_elements, pending_fields = [], []

            for i in range(cnt):
                inp = inputs.nth(i)
                try:
                    if not await inp.is_visible():
                        continue
                    # Skip if already filled
                    curr_val = await inp.input_value()
                    if curr_val and curr_val.strip():
                        continue

                    label = await self._get_field_label(inp)
                    val = self._resolve_profile_answer(label)
                    if val:
                        await inp.fill(str(val))
                    elif label:
                        pending_elements.append(inp)
                        pending_fields.append({"accessible_name": label, "type": "text"})
                except Exception:
                    continue

            # Batch LLM call for remaining unknown fields
            if pending_fields and self.llm_pool:
                try:
                    mapping = await self.llm_pool.map_fields_batch(
                        pending_fields, self.profile or self.resume_text
                    )
                    for inp, field in zip(pending_elements, pending_fields):
                        val = mapping.get(field["accessible_name"])
                        if val and str(val).lower() not in ("null", "none", ""):
                            try:
                                await inp.fill(str(val))
                            except Exception:
                                continue
                except Exception:
                    pass
        except Exception:
            pass

    async def _fill_select_dropdowns(self):
        """Fill <select> dropdowns with best matching option."""
        try:
            selects = self.page.locator("select")
            cnt = await selects.count()
            for i in range(cnt):
                sel = selects.nth(i)
                try:
                    if not await sel.is_visible():
                        continue

                    # Check if already has a non-placeholder selection
                    curr = await sel.input_value()
                    if curr and curr.strip() and curr not in ("", "0"):
                        options_text = await sel.locator("option").all_inner_texts()
                        # Make sure it's not just the first placeholder
                        if options_text and curr != options_text[0].strip():
                            continue

                    label = await self._get_field_label(sel)
                    answer = self._resolve_profile_answer(label)

                    options = await sel.locator("option").all_inner_texts()
                    options = [o.strip() for o in options if o.strip()]
                    if not options:
                        continue

                    chosen = None
                    if answer:
                        answer_lower = answer.lower()
                        for opt in options:
                            if answer_lower in opt.lower() or opt.lower() in answer_lower:
                                chosen = opt
                                break
                    # Default: skip placeholder (index 0) and pick index 1
                    if not chosen:
                        # Try LLM
                        if self.llm_pool and label and len(options) > 1:
                            try:
                                mapping = await self.llm_pool.map_fields_batch(
                                    [{"accessible_name": label, "type": "select", "options": options}],
                                    self.profile or self.resume_text
                                )
                                llm_val = mapping.get(label, "")
                                if llm_val:
                                    for opt in options:
                                        if llm_val.lower() in opt.lower():
                                            chosen = opt
                                            break
                            except Exception:
                                pass
                        if not chosen:
                            chosen = options[1] if len(options) > 1 else options[0]

                    if chosen:
                        await sel.select_option(label=chosen)
                except Exception:
                    continue
        except Exception:
            pass

    async def _fill_radio_groups(self):
        """Fill radio button groups — prefer profile answer, default to 'Yes'."""
        try:
            fieldsets = self.page.locator("fieldset")
            cnt = await fieldsets.count()
            for i in range(cnt):
                fs = fieldsets.nth(i)
                radios = fs.locator('input[type="radio"]')
                radio_cnt = await radios.count()
                if radio_cnt == 0:
                    continue

                # Skip if already answered
                any_checked = False
                for r in range(radio_cnt):
                    if await radios.nth(r).is_checked():
                        any_checked = True
                        break
                if any_checked:
                    continue

                legend = fs.locator("legend")
                label = (
                    await legend.first.inner_text()
                    if await legend.count() > 0
                    else await self._get_field_label(fs)
                )
                answer = self._resolve_profile_answer(label)

                radio_to_click = None
                if answer:
                    answer_lower = answer.lower()
                    for r in range(radio_cnt):
                        r_item = radios.nth(r)
                        try:
                            r_lbl = await self._get_field_label(r_item)
                            r_val = (await r_item.get_attribute("value") or "").lower()
                            if answer_lower in r_lbl.lower() or answer_lower in r_val:
                                radio_to_click = r_item
                                break
                            # For Yes/No questions, match "yes" option
                            if answer_lower == "yes" and "yes" in r_lbl.lower():
                                radio_to_click = r_item
                                break
                            if answer_lower == "no" and "no" in r_lbl.lower():
                                radio_to_click = r_item
                                break
                        except Exception:
                            continue

                if not radio_to_click:
                    # Default: try to find "Yes" option, else pick first
                    for r in range(radio_cnt):
                        r_item = radios.nth(r)
                        try:
                            r_lbl = await self._get_field_label(r_item)
                            if "yes" in r_lbl.lower():
                                radio_to_click = r_item
                                break
                        except Exception:
                            continue
                    if not radio_to_click:
                        radio_to_click = radios.first

                try:
                    await radio_to_click.scroll_into_view_if_needed()
                    await radio_to_click.click(force=True)
                except Exception:
                    pass
        except Exception:
            pass

    async def _fill_checkboxes(self):
        """Check consent/agreement checkboxes."""
        try:
            checkboxes = self.page.locator('input[type="checkbox"]')
            cnt = await checkboxes.count()
            for i in range(cnt):
                cb = checkboxes.nth(i)
                try:
                    if not await cb.is_visible():
                        continue
                    if await cb.is_checked():
                        continue
                    label = await self._get_field_label(cb)
                    lbl_lower = label.lower()
                    # Auto-check consent/agreement boxes
                    if any(kw in lbl_lower for kw in [
                        "agree", "terms", "privacy", "acknowledge",
                        "certify", "consent", "confirm", "accept"
                    ]):
                        await cb.check(force=True)
                except Exception:
                    continue
        except Exception:
            pass

    async def _fill_comboboxes(self):
        """Fill combobox (autocomplete) fields."""
        try:
            combos = self.page.locator('[role="combobox"]')
            cnt = await combos.count()
            for i in range(cnt):
                cb = combos.nth(i)
                try:
                    if not await cb.is_visible():
                        continue
                    # Skip if already has a value
                    curr = await cb.input_value()
                    if curr and curr.strip():
                        continue

                    label = await self._get_field_label(cb)
                    val = self._resolve_profile_answer(label)
                    if not val:
                        # Contextual defaults for common combobox fields
                        lbl_lower = label.lower()
                        if "country" in lbl_lower:
                            val = "India"
                        elif "city" in lbl_lower or "location" in lbl_lower:
                            val = "Bangalore"
                        elif "state" in lbl_lower:
                            val = "Karnataka"
                        else:
                            continue

                    await cb.click()
                    await asyncio.sleep(0.2)
                    await cb.fill(val)
                    await asyncio.sleep(0.4)
                    # Try clicking first dropdown option
                    try:
                        first_option = self.page.locator(
                            '[role="option"], [role="listitem"], li[data-value]'
                        ).first
                        if await first_option.count() > 0 and await first_option.is_visible():
                            await first_option.click()
                        else:
                            await self.page.keyboard.press("Enter")
                    except Exception:
                        await self.page.keyboard.press("Enter")
                except Exception:
                    continue
        except Exception:
            pass
