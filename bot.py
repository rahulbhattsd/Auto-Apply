"""bot.py — Telegram listener bot for AutoApply commands."""

import re
from pathlib import Path

import yaml
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

from core import db


def load_token(config_path: str = "config.yaml") -> str:
    with open(config_path) as f:
        cfg = yaml.safe_load(f)
    return cfg["telegram"]["token"]


def _parse_id(text: str, prefix: str) -> int | None:
    m = re.match(rf"/{prefix}_(\d+)", text)
    return int(m.group(1)) if m else None


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    s = db.get_today_stats()
    await update.message.reply_text(f"📊 Today: {s['applied']} applied, {s['stuck']} stuck, {s['failed']} failed")


async def cmd_resume(update: Update, context: ContextTypes.DEFAULT_TYPE):
    job_id = _parse_id(update.message.text, "resume")
    if job_id is None:
        return await update.message.reply_text("Usage: /resume_<job_id>")
    db.update_job_status(job_id, "resume_requested")
    await update.message.reply_text(f"▶️ Resuming job #{job_id}")


async def cmd_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    job_id = _parse_id(update.message.text, "skip")
    if job_id is None:
        return await update.message.reply_text("Usage: /skip_<job_id>")
    db.update_job_status(job_id, "skip_requested")
    await update.message.reply_text(f"⏭ Skipping job #{job_id}")


async def cmd_pause(update: Update, context: ContextTypes.DEFAULT_TYPE):
    Path("PAUSE_FLAG").touch()  # main.py loop should check this file between jobs
    await update.message.reply_text("⏸ Agent will pause after the current job.")


async def cmd_start_agent(update: Update, context: ContextTypes.DEFAULT_TYPE):
    Path("PAUSE_FLAG").unlink(missing_ok=True)
    await update.message.reply_text("▶️ Agent resumed.")


async def cmd_logs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    log_files = sorted(Path("logs").glob("*.log"))
    if not log_files:
        return await update.message.reply_text("No logs yet.")
    lines = log_files[-1].read_text().splitlines()[-20:]
    await update.message.reply_text("\n".join(lines) or "Log file is empty.")


async def cmd_jobs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    jobs = db.get_jobs(limit=10)
    if not jobs:
        return await update.message.reply_text("No jobs yet.")
    lines = [f"#{j['id']} {j['company']} — {j['role']} [{j['status']}]" for j in jobs]
    await update.message.reply_text("\n".join(lines))


def main() -> None:
    app = Application.builder().token(load_token()).build()
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("pause", cmd_pause))
    app.add_handler(CommandHandler("start_agent", cmd_start_agent))
    app.add_handler(CommandHandler("logs", cmd_logs))
    app.add_handler(CommandHandler("jobs", cmd_jobs))
    app.add_handler(MessageHandler(filters.Regex(r"^/resume_\d+"), cmd_resume))
    app.add_handler(MessageHandler(filters.Regex(r"^/skip_\d+"), cmd_skip))
    app.run_polling()


if __name__ == "__main__":
    main()
