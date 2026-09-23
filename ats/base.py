"""ats/base.py — Abstract base; concrete handlers only implement apply()."""

from abc import ABC, abstractmethod
from barriers.captcha import detect_captcha
from core.llm import map_fields_batch

def _get(obj: dict, path: str) -> str:
    for key in path.split("."):
        if not isinstance(obj, dict):
            return ""
        obj = obj.get(key)
        if obj is None:
            return ""
    return str(obj) if obj is not None else ""

LABEL_MAP = {
    "first name": "personal.first_name", "last name": "personal.last_name",
    "full name": "personal.full_name", "email": "personal.email",
    "phone": "personal.phone", "city": "personal.location.city",
    "linkedin": "links.linkedin", "github": "links.github",
    "portfolio": "links.portfolio", "website": "links.portfolio",
}

class ATSHandler(ABC):
    SUBMIT_SELECTOR = "button[type=submit]"
    FILE_INPUT_SELECTOR = "input[type=file]"

    def __init__(self, page, job: dict, profile: dict, resume: dict, pool=None):
        self.page, self.job, self.profile, self.resume, self.pool = page, job, profile, resume, pool

    @abstractmethod
    async def apply(self) -> dict:
        """Returns {'status': 'applied'|'stuck'|'failed', 'reason': str|None}."""

    async def check_barriers(self) -> str | None:
        return await detect_captcha(self.page)

    async def fill_known_fields(self) -> None:
        for el in await self.page.query_selector_all(
            "input:not([type=hidden]):not([type=file]):not([type=submit]), textarea"
        ):
            label = (await el.get_attribute("aria-label") or await el.get_attribute("placeholder")
                      or await el.get_attribute("name") or "").lower()
            for kw, path in LABEL_MAP.items():
                if kw in label:
                    value = _get(self.profile, path)
                    if value:
                        try:
                            await el.fill(str(value))
                        except Exception:
                            pass
                    break

    async def upload_resume(self, resume_path: str) -> None:
        el = await self.page.query_selector(self.FILE_INPUT_SELECTOR)
        if el and resume_path:
            try:
                await el.set_input_files(resume_path)
            except Exception:
                pass

    async def fill_unknown_fields(self) -> None:
        if not self.pool:
            return
        els, unmapped = [], []
        for el in await self.page.query_selector_all(
            "input:not([type=hidden]):not([type=file]):not([type=submit]), textarea"
        ):
            try:
                if await el.evaluate("el => el.value"):
                    continue
            except Exception:
                pass
            label = (await el.get_attribute("aria-label") or await el.get_attribute("placeholder")
                      or await el.get_attribute("name") or "").strip()
            if label and not any(k in label.lower() for k in LABEL_MAP):
                els.append(el)
                unmapped.append({"name": label})
        if not unmapped:
            return
        mapping = await map_fields_batch(unmapped, self.profile, self.pool)
        for el, field in zip(els, unmapped):
            value = mapping.get(field["name"])
            if value:
                try:
                    await el.fill(str(value))
                except Exception:
                    pass

    async def submit(self) -> None:
        btn = await self.page.query_selector(self.SUBMIT_SELECTOR)
        if btn:
            await btn.click()
            await self.page.wait_for_load_state("networkidle", timeout=15000)
