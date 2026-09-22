"""
barriers/captcha.py — CAPTCHA / bot-check detection on the current page.

This module DETECTS and reports only — it never attempts to solve or bypass
CAPTCHAs. On detection, the caller (ats/*.py) should take a screenshot,
mark the job 'stuck', and hand off to the user via Telegram
(barriers/human_handoff.py).
"""


async def detect_captcha(page) -> str | None:
    """
    Look for common CAPTCHA / bot-check markers on the page
    (reCAPTCHA iframe, hCaptcha iframe, Cloudflare Turnstile challenge).
    Returns a short reason string if found, else None.
    """
    # TODO: check for iframe[src*='recaptcha'], iframe[src*='hcaptcha'],
    # Cloudflare challenge markers, etc.
    pass
