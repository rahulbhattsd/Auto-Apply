# AutoApply Agent

A local Python agent that applies to jobs on your behalf: scrapes listings,
tailors your resume per job via Groq LLM, fills application forms with
Playwright, handles Gmail OTP automatically, and escalates anything it
can't handle (CAPTCHA, phone OTP, login walls) to you via Telegram.

## Setup

1. **Python & dependencies**
   ```bash
   python3.11 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Install Playwright browsers**
   ```bash
   playwright install chromium
   ```

3. **Groq API keys**
   - Create up to 7 free keys at https://console.groq.com
   - Paste them into `config.yaml` under `groq.keys`

4. **Gmail App Password (for OTP auto-read)**
   - Enable 2-Step Verification on your Google account
   - Go to Google Account -> Security -> App Passwords
   - Generate a password for "Mail" and paste it into `config.yaml`
     under `gmail.app_password`
   - Put your Gmail address under `gmail.user`

5. **Telegram bot**
   - Message [@BotFather](https://t.me/BotFather) on Telegram -> `/newbot`
   - Copy the bot token into `config.yaml` under `telegram.token`
   - Message your new bot once, then get your chat id (e.g. via
     `https://api.telegram.org/bot<token>/getUpdates`) and paste it into
     `telegram.chat_id`

6. **Fill in your data**
   - `profile.yaml` — personal details, target roles, eligibility answers
   - `resume_base.json` — your structured resume content

## Run order

```bash
# Terminal 1 — the agent
python main.py

# Terminal 2 — the Telegram bot listener
python bot.py

# Terminal 3 — the dashboard
uvicorn dashboard:app --reload --port 8000
```

Then open http://localhost:8000 to watch progress, and use your Telegram
bot to respond when a job gets stuck (`/resume_23`, `/skip_23`, etc.).

## Notes

- Budget: ₹0/month — no VPS, no proxies, no paid APIs.
- Max 2 LLM calls per job (resume tailoring + batched unknown-field mapping).
- LLM responses are cached by prompt hash in SQLite to avoid repeat calls.
- A random 2–5 min delay is inserted between applications.
