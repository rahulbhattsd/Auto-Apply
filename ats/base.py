"""
ats/base.py — Abstract base class every ATS handler implements.

A handler owns one Playwright page for the lifetime of one application and
returns a status: 'applied' | 'stuck' | 'failed', plus a reason when stuck.
"""

from abc import ABC, abstractmethod


class ATSHandler(ABC):
    """One handler instance per job application."""

    def __init__(self, page, job: dict, profile: dict, resume: dict):
        self.page = page
        self.job = job
        self.profile = profile
        self.resume = resume

    @abstractmethod
    async def apply(self) -> dict:
        """
        Run the full apply flow for this job on self.page.
        Returns {'status': 'applied'|'stuck'|'failed', 'reason': str|None}.
        """
        raise NotImplementedError

    async def fill_known_fields(self) -> None:
        """Fill fields we can map directly from profile.yaml (name, email, etc.)."""
        pass

    async def fill_unknown_fields(self, unknown_fields: list[str]) -> None:
        """
        Batch any fields not covered by fill_known_fields into ONE
        core.llm.map_fields_batch() call, then fill them.
        """
        pass

    async def check_barriers(self) -> str | None:
        """
        Check for CAPTCHA / OTP / login wall on the current page.
        Returns a barrier reason string, or None if clear.
        """
        pass
