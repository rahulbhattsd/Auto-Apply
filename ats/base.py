"""ats/base.py — Abstract base class every ATS handler implements."""

from abc import ABC, abstractmethod


class ATSHandler(ABC):
    def __init__(self, page, job: dict, profile: dict, resume: dict):
        self.page = page
        self.job = job
        self.profile = profile
        self.resume = resume

    @abstractmethod
    async def apply(self) -> dict:
        """Returns {'status': 'applied'|'stuck'|'failed', 'reason': str|None}."""
        raise NotImplementedError

    async def fill_known_fields(self) -> None:
        """Fill fields directly mappable from self.profile (name, email, phone, links...)."""
        pass

    async def fill_unknown_fields(self) -> None:
        """Scan remaining empty inputs, batch through core.llm.map_fields_batch(), fill them."""
        pass

    async def check_barriers(self) -> str | None:
        """Return a barrier reason (captcha/login_wall) if blocked, else None."""
        from barriers.captcha import detect_captcha
        return await detect_captcha(self.page)

    async def submit(self) -> None:
        """Click the final submit/apply button."""
        pass