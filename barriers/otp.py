"""
barriers/otp.py — Gmail IMAP OTP auto-reader.

Polls the inbox (imaplib, built-in) for a recent unread email containing a
numeric code and extracts it. Only handles EMAIL OTP — phone OTP has no
free path and is NOT handled here (see main constraints: skip or hand off
to Telegram).
"""

import imaplib
import email
import re
import time


def connect(gmail_user: str, app_password: str, imap_host: str = "imap.gmail.com"):
    """Open an authenticated IMAP4_SSL connection."""
    pass


def wait_for_otp(gmail_user: str, app_password: str, timeout_sec: int = 90) -> str | None:
    """
    Poll INBOX for a new email (from the target company) containing an OTP
    code. Returns the extracted code, or None on timeout.
    """
    # TODO: search recent UNSEEN messages, regex for 4-8 digit codes
    pass


def extract_code(body: str) -> str | None:
    """Regex-extract a 4-8 digit numeric code from an email body."""
    match = re.search(r"\b\d{4,8}\b", body)
    return match.group(0) if match else None
