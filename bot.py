"""
bot.py — Telegram listener bot for AutoApply.

Handles inbound commands from the user:
  /status       -> today's summary
  /resume_<id>  -> resume job <id> after manual fix
  /skip_<id>    -> skip job <id>
  /pause        -> pause the agent loop
  /start_agent  -> start/resume the agent loop
  /logs         -> last 20 log lines
  /jobs         -> last 10 jobs with status

Outbound messages (stuck/applied/daily summary/agent started) are sent via
core.notifier, not from here.

Uses python-telegram-bot. Run standalone alongside main.py.
"""

# TODO: from telegram.ext import Application, CommandHandler, ContextTypes
# TODO: from core import db

import yaml


def load_token(config_path: str = "config.yaml") -> str:
    """Read TELEGRAM_TOKEN from config.yaml."""
    pass


async def cmd_status(update, context) -> None:
    """Reply with today's applied/stuck/failed counts."""
    pass


async def cmd_resume(update, context) -> None:
    """Parse job id from /resume_<id>, mark job 'queued' again, notify agent."""
    pass


async def cmd_skip(update, context) -> None:
    """Parse job id from /skip_<id>, mark job 'skipped'."""
    pass


async def cmd_pause(update, context) -> None:
    """Signal main.py agent loop to pause."""
    pass


async def cmd_start_agent(update, context) -> None:
    """Signal main.py agent loop to start/resume."""
    pass


async def cmd_logs(update, context) -> None:
    """Return last 20 lines from logs/*.log."""
    pass


async def cmd_jobs(update, context) -> None:
    """Return last 10 jobs with status from the DB."""
    pass


def main() -> None:
    """Build the Application, register handlers, run polling."""
    # TODO: implement
    pass


if __name__ == "__main__":
    main()
