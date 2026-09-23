"""barriers/human_handoff.py — Pause/resume bridge, polled by main.py's retry loop."""

from core import db
from core.notifier import notify_job_stuck

async def pause_for_human(job_id: int, reason: str, screenshot_path: str) -> None:
    job = db.get_job(job_id)
    db.update_job_status(job_id, "stuck", stuck_reason=reason, screenshot_path=screenshot_path)
    await notify_job_stuck(job_id, job["company"] if job else "?", reason, screenshot_path)

def should_resume(job_id: int) -> bool:
    job = db.get_job(job_id)
    return bool(job and job["status"] == "resume_requested")

def should_skip(job_id: int) -> bool:
    job = db.get_job(job_id)
    return bool(job and job["status"] == "skip_requested")
