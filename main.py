import asyncio
import yaml
from core.browser_manager import BrowserManager
from core.llm import GroqPool
from handlers.linkedin_handler import LinkedInHandler
from core.db import Database

async def run_one_job(job_id: int, job_url: str, db: Database, config: dict, llm_pool: GroqPool, browser_manager: BrowserManager):
    page = browser_manager.page
    resume_text = config.get("resume_text", "")

    handler = None
    if "linkedin.com" in job_url:
        handler = LinkedInHandler(page, llm_pool, resume_text)
    else:
        # Fallback to generic handler (you should implement it similarly)
        return {"status": "skipped", "reason": "Unsupported site"}

    try:
        result = await handler.apply(job_url)
        db.update_job_status(job_id, result["status"], result.get("reason"))
        if result["status"] != "success":
            # Capture screenshot and HTML for debugging
            screenshot_path = f"./debug/job_{job_id}_failed.png"
            html_path = f"./debug/job_{job_id}_failed.html"
            await page.screenshot(path=screenshot_path, full_page=True)
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(await page.content())
            print(f"[âœ—] Job #{job_id} failed: {result['reason']}. Debug files saved.")
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.update_job_status(job_id, "failed", str(e))
        # Capture debug info
        screenshot_path = f"./debug/job_{job_id}_exception.png"
        await page.screenshot(path=screenshot_path, full_page=True)
        return {"status": "failed", "reason": str(e)}

async def main():
    with open("config.yaml", "r", encoding="utf-8-sig") as f:
        config = yaml.safe_load(f)

    db = Database()
    groq_keys = (
        config.get("groq_api_keys")
        or config.get("groq", {}).get("keys")
        or []
    )
    if not groq_keys:
        raise RuntimeError(
            "No Groq API keys found in config.yaml. "
            "Add them under groq.keys (list) or groq_api_keys (list)."
        )
    llm_pool = GroqPool(groq_keys)
    browser_manager = BrowserManager()
    await browser_manager.start()

    # Get pending jobs from DB
    import os
    print(f">>> DB path: {os.path.abspath('data.db')}")
    print(f">>> DB exists: {os.path.exists('data.db')}")
    jobs = db.get_pending_jobs()
    print(f">>> get_pending_jobs() returned {len(jobs)} jobs")
    if jobs:
        print(f">>> First job: #{jobs[0].id} {jobs[0].url[:80]}")
    for job in jobs:
        await run_one_job(job.id, job.url, db, config, llm_pool, browser_manager)
        await asyncio.sleep(5)  # Human-like delay between jobs

    await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(main())

