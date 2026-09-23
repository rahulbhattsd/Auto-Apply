"""barriers/human_handoff.py — Pause/resume bridge, polled by main.py's retry loop."""

import asyncio
from pathlib import Path
import yaml
from core import db
from core.notifier import notify_job_stuck
from barriers import otp


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


async def try_otp(config_path="config.yaml", timeout_sec=90) -> str | None:
    p = Path(config_path)
    if not p.exists():
        return None
    with open(p, "r") as f:
        config = yaml.safe_load(f) or {}
    gmail_cfg = config.get("gmail", {})
    user = gmail_cfg.get("user")
    app_password = gmail_cfg.get("app_password")
    if not user or not app_password:
        return None
    return await asyncio.to_thread(otp.wait_for_otp, user, app_password, timeout_sec)
