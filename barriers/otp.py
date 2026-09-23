"""barriers/otp.py — Gmail IMAP OTP auto-reader (email OTP only, no phone OTP)."""

import imaplib, email, re, time

def connect(gmail_user: str, app_password: str, imap_host: str = "imap.gmail.com") -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(imap_host)
    conn.login(gmail_user, app_password)
    conn.select("INBOX")
    return conn

def extract_code(body: str) -> str | None:
    m = re.search(r"\b\d{4,8}\b", body or "")
    return m.group(0) if m else None

def wait_for_otp(gmail_user: str, app_password: str, timeout_sec: int = 90) -> str | None:
    deadline = time.monotonic() + timeout_sec
    conn = None
    try:
        conn = connect(gmail_user, app_password)
        while time.monotonic() < deadline:
            _, data = conn.search(None, "UNSEEN")
            for num in reversed(data[0].split()):
                _, msg_data = conn.fetch(num, "(RFC822)")
                msg = email.message_from_bytes(msg_data[0][1])
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            body += part.get_payload(decode=True).decode(errors="ignore")
                else:
                    body = msg.get_payload(decode=True).decode(errors="ignore")
                code = extract_code(msg.get("Subject", "") + " " + body)
                if code:
                    conn.store(num, "+FLAGS", "\\Seen")
                    return code
            time.sleep(5)
        return None
    finally:
        if conn:
            conn.logout()
