"""filter_easy_apply.py — Script to inspect pending/queued jobs and mark non-Easy-Apply ones as skipped_external."""

import asyncio
import sqlite3
from core.browser_manager import BrowserManager

EASY_SELECTORS = [
    'button[aria-label*="Easy Apply"]',
    'button[aria-label*="LinkedIn Apply"]',
    'button:has-text("Easy Apply")',
    'button.jobs-apply-button',
    '[data-control-name="jobdetails_topcard_inapply"]',
]


async def filter_pending_easy_apply(db_path: str = "data.db"):
    """Visit each pending/queued job, mark non-Easy-Apply as skipped_external."""
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT id, url, company, role FROM jobs WHERE status IN ('pending', 'queued')"
    ).fetchall()
    con.close()

    if not rows:
        print("No pending/queued jobs to filter.")
        return

    print(f"Found {len(rows)} pending/queued job(s) to check.")

    bm = BrowserManager()
    page = await bm.start()

    easy_count = 0
    ext_count = 0

    try:
        for row in rows:
            job_id = row["id"]
            url = row["url"]
            print(f"Checking job #{job_id}: {row['company']} - {row['role']}")

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await asyncio.sleep(3)

                has_easy = False
                for sel in EASY_SELECTORS:
                    try:
                        loc = page.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            has_easy = True
                            break
                    except Exception:
                        continue

                if has_easy:
                    easy_count += 1
                    print(f"  [EASY] Job #{job_id} is Easy Apply.")
                else:
                    con = sqlite3.connect(db_path)
                    con.execute("UPDATE jobs SET status='skipped_external' WHERE id=?", (job_id,))
                    con.commit()
                    con.close()
                    ext_count += 1
                    print(f"  [EXT] Job #{job_id} marked as skipped_external.")

                await asyncio.sleep(1)
            except Exception as e:
                print(f"  [ERR] Job #{job_id}: {e}")
    finally:
        await bm.close()

    print(f"\nDone filtering. Easy Apply: {easy_count}, External Skipped: {ext_count}")


if __name__ == "__main__":
    asyncio.run(filter_pending_easy_apply())
