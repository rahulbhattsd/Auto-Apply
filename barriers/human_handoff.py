"""
barriers/human_handoff.py — Pause / resume flow bridging the agent loop
and Telegram commands.

When an ats/*.py handler hits something it can't clear (CAPTCHA, phone
OTP, login wall), it calls pause_for_human() here. main.py's loop should
poll should_resume()/should_skip() (backed by job status in core.db,
updated by bot.py's /resume_<id> and /skip_<id> handlers) before moving on.
"""

# TODO: from core import db, notifier


async def pause_for_human(job_id: int, reason: str, screenshot_path: str) -> None:
    """Mark job 'stuck' in DB and send the Telegram notification with screenshot."""
    pass


def should_resume(job_id: int) -> bool:
    """True if the user sent /resume_<job_id> since it went stuck."""
    pass


def should_skip(job_id: int) -> bool:
    """True if the user sent /skip_<job_id> since it went stuck."""
    pass
