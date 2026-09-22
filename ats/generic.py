"""
ats/generic.py — Fallback handler for unrecognized ATS platforms.

Best-effort generic form fill: find visible <input>/<select>/<textarea>
elements, map labels to profile fields, batch anything unmapped through
core.llm.map_fields_batch(). Escalates to 'stuck' more readily than the
named handlers.
"""

from ats.base import ATSHandler


class GenericHandler(ATSHandler):
    async def apply(self) -> dict:
        # TODO: generic DOM scan + field mapping, check_barriers(), submit
        pass
