"""
ats/lever.py — Applier for Lever-hosted job postings (jobs.lever.co/...).
"""

from ats.base import ATSHandler


class LeverHandler(ATSHandler):
    async def apply(self) -> dict:
        # TODO: navigate form, fill_known_fields(), resume upload,
        # fill_unknown_fields(), check_barriers(), submit
        pass
