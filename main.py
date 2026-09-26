import asyncio
import os
import yaml
from core.browser_manager import BrowserManager
from core.llm import GroqPool
from core.router import get_handler
from core.db import Database

def load_profile(config: dict) -> dict:
    profile = config.get("profile", {}) or {}
    if not profile and os.path.exists("profile.yaml"):
        try:
            with open("profile.yaml", "r", encoding="utf-8") as f:
                profile = yaml.safe_load(f) or {}
        except Exception:
            profile = {}
    return profile

async def run_one_job(job_id: int, job_url: str, db: Database, config: dict, llm_pool: GroqPool, browser_manager: BrowserManager):
    page = browser_manager.page
    resume_text = config.get("resume_text", "")
    profile = load_profile(config)

    # Route by domain instead of always using the LinkedIn handler - this
    # is the fix for Indeed/Glassdoor/Greenhouse/Lever/Workday/Ashby/generic
    # career-page jobs being silently skipped or mishandled.
    kind, handler_cls = get_handler(job_url)
    if kind == "self_nav":
        handler = handler_cls(page, llm_pool, resume_text, profile)
    else:
        job_row = db.get_job(job_id) or {}
        job_dict = {"url": job_url, "company": job_row.get("company", ""), "role": job_row.get("role", "")}
        resume_dict = {"resume_text": resume_text, "resume_path": profile.get("resume_path", "")}
        handler = handler_cls(page, job_dict, profile, resume_dict, llm_pool)

    db.increment_attempts(job_id)

    try:
        result = await (handler.apply(job_url) if kind == "self_nav" else handler.apply())
        status = result.get("status", "failed")
        reason = result.get("reason")

        if status in ("applied", "success"):
            db.update_job_status(job_id, "applied", reason)
            print(f"[✓] Job #{job_id} successfully applied.")
        elif status in ("skipped_external", "skipped"):
            db.update_job_status(job_id, "skipped_external", reason)
            print(f"[⏭] Job #{job_id} skipped: {reason}")
        elif status == "stuck":
            db.update_job_status(job_id, "stuck", reason)
            print(f"[⏸] Job #{job_id} stuck: {reason}")
        elif status == "blocked":
            db.update_job_status(job_id, "blocked", reason)
            print(f"[🛑] Job #{job_id} blocked: {reason}")
        else:
            db.update_job_status(job_id, "failed", reason)
            # Capture screenshot and HTML for debugging on true failures
            os.makedirs("./debug", exist_ok=True)
            screenshot_path = f"./debug/job_{job_id}_failed.png"
            html_path = f"./debug/job_{job_id}_failed.html"
            try:
                await page.screenshot(path=screenshot_path, full_page=True)
            except Exception:
                pass
            try:
                content = await page.content()
                with open(html_path, "w", encoding="utf-8", errors="replace") as f:
                    f.write(content)
            except Exception:
                pass
            print(f"[✗] Job #{job_id} failed: {reason}. Debug files saved if available.")
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.update_job_status(job_id, "failed", str(e))
        os.makedirs("./debug", exist_ok=True)
        screenshot_path = f"./debug/job_{job_id}_exception.png"
        try:
            await page.screenshot(path=screenshot_path, full_page=True)
        except Exception:
            pass
        return {"status": "failed", "reason": str(e)}

async def main():
    config_path = "config.yaml"
    if not os.path.exists(config_path):
        config_path = "config.example.yaml"

    with open(config_path, "r", encoding="utf-8-sig") as f:
        config = yaml.safe_load(f)

    db = Database()
    groq_cfg = config.get("groq", {}) or {}
    groq_keys = config.get("groq_api_keys") or groq_cfg.get("keys") or ["dummy_key"]
    llm_pool = GroqPool(
        groq_keys,
        model=groq_cfg.get("model", "openai/gpt-oss-20b"),
        fallback_model=groq_cfg.get("fallback_model", "openai/gpt-oss-120b"),
        cooldown_seconds=groq_cfg.get("cooldown_seconds", 60),
    )
    browser_manager = BrowserManager()
    await browser_manager.start()

    print(f">>> DB path: {os.path.abspath('data.db')}")
    jobs = db.get_pending_jobs()
    print(f">>> get_pending_jobs() returned {len(jobs)} jobs")
    if jobs:
        print(f">>> First job: #{jobs[0].id} {jobs[0].url[:80]}")
    for job in jobs:
        await run_one_job(job.id, job.url, db, config, llm_pool, browser_manager)
        await asyncio.sleep(2)

    await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(main())
