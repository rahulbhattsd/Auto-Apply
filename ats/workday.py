"""
ats/workday.py — Best-effort applier for Workday-hosted postings.

Workday flows vary a lot per-tenant (multi-page wizards, account creation
required, etc.) — treat this as partial support; fall back to 'stuck' with
a clear reason whenever the flow diverges from the happy path.
"""

from ats.base import ATSHandler


class WorkdayHandler(ATSHandler):
    async def apply(self) -> dict:
        # TODO: handle account creation/login step, multi-page wizard,
        # fill_known_fields()/fill_unknown_fields() per page, submit.
        # Mark 'stuck' early and often here — Workday is the least uniform ATS.
        pass
