"""core/notifier.py — Outbound Telegram messages sent BY the agent."""

import asyncio
import yaml
from telegram import Bot

_bot, _chat_id = None, None


def get_bot(token: str) -> Bot:
    return Bot(token=token)


def _load() -> tuple[Bot, str]:
    global _bot, _chat_id
    if _bot is None:
        with open("config.yaml") as f:
            cfg = yaml.safe_load(f)
        _bot = get_bot(cfg["telegram"]["token"])
        _chat_id = cfg["telegram"]["chat_id"]
    return _bot, _chat_id


async def notify_agent_started(target_jobs: int) -> None:
    bot, chat_id = _load()
    await bot.send_message(chat_id=chat_id, text=f"🚀 Agent started. Target: {target_jobs} jobs")


async def notify_job_applied(job_id: int, company: str, role: str) -> None:
    bot, chat_id = _load()
    await bot.send_message(chat_id=chat_id, text=f"✅ Job #{job_id} applied: {company} — {role}")


async def notify_job_stuck(job_id: int, company: str, reason: str, screenshot_path: str) -> None:
    bot, chat_id = _load()
    caption = f"🚧 Job #{job_id} stuck: {reason} | Company: {company}"
    try:
        with open(screenshot_path, "rb") as f:
            await bot.send_photo(chat_id=chat_id, photo=f, caption=caption)
    except FileNotFoundError:
        await bot.send_message(chat_id=chat_id, text=caption)


async def notify_daily_summary(applied: int, stuck: int, failed: int) -> None:
    bot, chat_id = _load()
    await bot.send_message(chat_id=chat_id, text=f"📊 Daily: {applied} applied, {stuck} stuck, {failed} failed")
