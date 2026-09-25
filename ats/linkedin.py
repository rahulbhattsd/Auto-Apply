"""ats/linkedin.py — LinkedIn Easy Apply flow using unified LinkedInHandler."""

from ats.base import ATSHandler
from handlers.linkedin_handler import LinkedInHandler as UnifiedLinkedInHandler

class LinkedInHandler(ATSHandler):
    async def apply(self) -> dict:
        handler = UnifiedLinkedInHandler(
            page=self.page,
            llm_pool=self.pool,
            resume_text=str(self.resume.get("resume_text", "")),
            profile=self.profile
        )
        job_url = self.job.get("url", "")
        return await handler.apply(job_url)
