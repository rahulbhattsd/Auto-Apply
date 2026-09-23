"""barriers/captcha.py — CAPTCHA / bot-check detection only (never solves)."""

MARKERS = [
    ("iframe[src*='recaptcha']", "reCAPTCHA detected"),
    ("iframe[src*='hcaptcha']", "hCaptcha detected"),
    ("div.cf-turnstile, iframe[src*='challenges.cloudflare.com']", "Cloudflare Turnstile detected"),
    ("text=/verify you are human|are you a robot/i", "generic bot-check text detected"),
]

async def detect_captcha(page) -> str | None:
    for selector, reason in MARKERS:
        try:
            if await page.query_selector(selector):
                return reason
        except Exception:
            continue
    return None
