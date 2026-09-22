"""
ats/greenhouse.py — Applier for Greenhouse-hosted job postings
(boards.greenhouse.io/...).
"""

from ats.base import ATSHandler


class GreenhouseHandler(ATSHandler):
    async def apply(self) -> dict:
        # TODO: navigate form, fill_known_fields(), resume upload,
        # fill_unknown_fields() for anything custom, check_barriers(), submit
        pass
