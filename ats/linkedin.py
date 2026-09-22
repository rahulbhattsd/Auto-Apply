"""
ats/linkedin.py — LinkedIn "Easy Apply" flow handler.

Note: requires an authenticated Playwright context (saved cookies) —
see barriers/human_handoff.py fallback if login wall is hit.
"""

from ats.base import ATSHandler


class LinkedInHandler(ATSHandler):
    async def apply(self) -> dict:
        # TODO: click Easy Apply, step through multi-page modal,
        # fill_known_fields() / fill_unknown_fields() per step, submit
        pass
