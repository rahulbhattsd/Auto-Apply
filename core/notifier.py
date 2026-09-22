"""
core/notifier.py — Outbound Telegram messages sent BY the agent.

(Inbound command handling lives in bot.py, not here.)

Message types:
  - Agent started:      "🚀 Agent started. Target: 50 jobs"
  - Job stuck:           "🚧 Job #23 stuck: Phone OTP | Company: X" + screenshot
  - Job applied:          "✅ Job #23 applied: Google SDE"
  - Daily summary:        "📊 Daily: 43 applied, 5 stuck, 2 failed"
"""

# TODO: from telegram import Bot


def get_bot(token: str):
    """Build a telegram.Bot instance from config."""
    pass


async def notify_agent_started(target_jobs: int) -> None:
    pass


async def notify_job_applied(job_id: int, company: str, role: str) -> None:
    pass


async def notify_job_stuck(job_id: int, company: str, reason: str, screenshot_path: str) -> None:
    """Send stuck notice with the screenshot attached."""
    pass


async def notify_daily_summary(applied: int, stuck: int, failed: int) -> None:
    pass
