"""barriers/captcha.py — CAPTCHA / OTP / login-wall detection only (never solves)."""

MARKERS = [
    ("iframe[src*='recaptcha']", "reCAPTCHA detected"),
    ("iframe[src*='hcaptcha']", "hCaptcha detected"),
    ("div.cf-turnstile, iframe[src*='challenges.cloudflare.com']", "Cloudflare Turnstile detected"),
    ("text=/verify you are human|are you a robot/i", "generic bot-check text detected"),
    ("text=/enter (the )?(verification|otp|one[- ]time) code|we (sent|texted|emailed) you a code/i", "OTP verification required"),
    ("text=/sign in to continue|log in to apply|create an account to apply/i", "login wall detected"),
    ("input[name*='otp'], input[placeholder*='code'], input[aria-label*='verification']", "OTP required"),
    ("form[action*=register], form[action*=signup], a[href*=signup]", "Profile creation required"),
]

async def detect_captcha(page) -> str | None:
    for selector, reason in MARKERS:
        try:
            if await page.query_selector(selector):
                return reason
        except Exception:
            continue
    return None
