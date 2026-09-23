"""barriers/human_handoff.py — Pause/resume bridge, polled by main.py's retry loop."""

import asyncio
from core import db
from core.notifier import notify_job_stuck

async def pause_for_human(job_id: int, reason: str, screenshot_path: str) -> None:
    job = db.get_job(job_id)
    db.update_job_status(job_id, "stuck", stuck_reason=reason, screenshot_path=screenshot_path)
    asyncio.create_task(notify_job_stuck(job_id, job["company"] if job else "?", reason, screenshot_path))

def should_resume(job_id: int) -> bool:
    job = db.get_job(job_id)
    return bool(job and job["status"] == "resume_requested")

def should_skip(job_id: int) -> bool:
    job = db.get_job(job_id)
    return bool(job and job["status"] == "skip_requested")

async def try_otp(config_path: str = "config.yaml", timeout_sec: int = 90) -> str | None:
    import asyncio, yaml
    from barriers.otp import wait_for_otp
    with open(config_path) as f:
        cfg = yaml.safe_load(f)
    g = cfg.get("gmail", {})
    if not g.get("user") or not g.get("app_password"):
        return None
    return await asyncio.to_thread(wait_for_otp, g["user"], g["app_password"], timeout_sec)
