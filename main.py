import asyncio
import os
import yaml
from core.browser_manager import BrowserManager
from core.llm import GroqPool
from handlers.linkedin_handler import LinkedInHandler
from core.db import Database

async def run_one_job(job_id: int, job_url: str, db: Database, config: dict, llm_pool: GroqPool, browser_manager: BrowserManager):
    page = browser_manager.page
    resume_text = config.get("resume_text", "")
    profile = config.get("profile", {})

    handler = None
    if "linkedin.com" in job_url or True:  # Default handler
        handler = LinkedInHandler(page, llm_pool, resume_text, profile)

    try:
        result = await handler.apply(job_url)
        status = result.get("status", "failed")
        reason = result.get("reason")

        db.update_job_status(job_id, status, reason)

        if status in ("applied", "success"):
            print(f"[✓] Job #{job_id} successfully applied.")
        elif status in ("skipped_external", "skipped"):
            print(f"[⏭] Job #{job_id} skipped: {reason}")
        elif status == "stuck":
            print(f"[⏸] Job #{job_id} stuck: {reason}")
        elif status == "blocked":
            print(f"[🛑] Job #{job_id} blocked: {reason}")
        else:
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
    groq_keys = (
        config.get("groq_api_keys")
        or config.get("groq", {}).get("keys")
        or ["dummy_key"]
    )
    llm_pool = GroqPool(groq_keys)
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
