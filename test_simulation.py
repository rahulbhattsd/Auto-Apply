import asyncio
import os
import sqlite3
import yaml
from pathlib import Path
from playwright.async_api import async_playwright, Page, Route
from core.db import Database, init_db
from core.llm import GroqPool
from handlers.linkedin_handler import LinkedInHandler

# Simulated HTML content generators
def generate_easy_apply_html(job_id: int) -> str:
    if job_id % 3 == 1:
        return """
        <!DOCTYPE html>
        <html>
        <head><title>LinkedIn Easy Apply Job</title></head>
        <body>
            <h1>Software Engineer Job</h1>
            <button class="jobs-apply-button">Easy Apply</button>

            <div role="dialog" class="jobs-easy-apply-modal" style="display:none;" id="modal">
                <h2>Application Form</h2>
                <form id="app-form" onsubmit="return false;">
                    <label for="fname">First Name</label>
                    <input type="text" id="fname" name="first_name" />

                    <label for="lname">Last Name</label>
                    <input type="text" id="lname" name="last_name" />

                    <label for="email">Email address</label>
                    <input type="text" id="email" name="email" />

                    <label for="phone">Phone number</label>
                    <input type="tel" id="phone" name="phone" />

                    <label for="resume">Upload Resume</label>
                    <input type="file" id="resume" name="resume" />

                    <button type="button" id="submit-btn">Submit application</button>
                </form>
                <div id="confirmed" style="display:none;">Application submitted</div>
            </div>

            <script>
                document.querySelector('.jobs-apply-button').addEventListener('click', () => {
                    document.getElementById('modal').style.display = 'block';
                });
                document.getElementById('submit-btn').addEventListener('click', () => {
                    document.getElementById('app-form').style.display = 'none';
                    document.getElementById('confirmed').style.display = 'block';
                });
            </script>
        </body>
        </html>
        """
    elif job_id % 3 == 2:
        return """
        <!DOCTYPE html>
        <html>
        <head><title>LinkedIn Multi-Step Easy Apply</title></head>
        <body>
            <h1>Senior Developer Job</h1>
            <button class="jobs-apply-button">Easy Apply</button>

            <div role="dialog" class="artdeco-modal" style="display:none;" id="modal">
                <div id="step1">
                    <h3>Step 1: Contact</h3>
                    <label for="city">City</label>
                    <input type="text" id="city" name="city" />

                    <label for="linkedin">LinkedIn URL</label>
                    <input type="text" id="linkedin" name="linkedin" />

                    <button type="button" id="next-btn">Next</button>
                </div>

                <div id="step2" style="display:none;">
                    <h3>Step 2: Questions</h3>
                    <label for="exp">Years of experience?</label>
                    <input type="number" id="exp" name="experience" />

                    <fieldset>
                        <legend>Are you authorized to work in India?</legend>
                        <label><input type="radio" name="auth" value="Yes" /> Yes</label>
                        <label><input type="radio" name="auth" value="No" /> No</label>
                    </fieldset>

                    <button type="button" id="review-btn">Review</button>
                </div>

                <div id="step3" style="display:none;">
                    <h3>Step 3: Review & Submit</h3>
                    <button type="button" id="submit-btn">Submit application</button>
                </div>

                <div id="confirmed" style="display:none;">
                    <h2>Your application was sent</h2>
                </div>
            </div>

            <script>
                document.querySelector('.jobs-apply-button').addEventListener('click', () => {
                    document.getElementById('modal').style.display = 'block';
                });
                document.getElementById('next-btn').addEventListener('click', () => {
                    document.getElementById('step1').style.display = 'none';
                    document.getElementById('step2').style.display = 'block';
                });
                document.getElementById('review-btn').addEventListener('click', () => {
                    document.getElementById('step2').style.display = 'none';
                    document.getElementById('step3').style.display = 'block';
                });
                document.getElementById('submit-btn').addEventListener('click', () => {
                    document.getElementById('step3').style.display = 'none';
                    document.getElementById('confirmed').style.display = 'block';
                });
            </script>
        </body>
        </html>
        """
    else:
        return """
        <!DOCTYPE html>
        <html>
        <head><title>LinkedIn Advanced Easy Apply</title></head>
        <body>
            <h1>Lead AI Engineer Job</h1>
            <button class="jobs-apply-button">Easy Apply</button>

            <div role="dialog" class="jobs-easy-apply-modal" style="display:none;" id="modal">
                <form id="app-form" onsubmit="return false;">
                    <label for="degree">Highest level of education</label>
                    <select id="degree" name="degree">
                        <option value="">Select an option</option>
                        <option value="Bachelor">Bachelor's Degree</option>
                        <option value="Master">Master's Degree</option>
                    </select>

                    <label for="country">Country</label>
                    <input type="text" role="combobox" id="country" />

                    <label>
                        <input type="checkbox" id="terms" name="terms" />
                        I agree to terms and privacy policy
                    </label>

                    <button type="button" id="submit-btn">Submit application</button>
                </form>
                <div id="confirmed" style="display:none;">
                    <h3>Application submitted!</h3>
                </div>
            </div>

            <script>
                document.querySelector('.jobs-apply-button').addEventListener('click', () => {
                    document.getElementById('modal').style.display = 'block';
                });
                document.getElementById('submit-btn').addEventListener('click', () => {
                    document.getElementById('app-form').style.display = 'none';
                    document.getElementById('confirmed').style.display = 'block';
                });
            </script>
        </body>
        </html>
        """


def generate_external_html(job_id: int) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head><title>External Job #{job_id}</title></head>
    <body>
        <h1>External Company Job #{job_id}</h1>
        <a href="https://external-company.com/apply" class="apply-link" target="_blank">Apply on company website</a>
    </body>
    </html>
    """


async def run_simulation():
    print("=== Starting 18-Job Simulation Test ===", flush=True)

    db_file = "sim_data.db"
    if os.path.exists(db_file):
        os.remove(db_file)

    init_db(db_file)
    db = Database(db_file)

    profile_data = {
        "personal": {
            "first_name": "Rahul",
            "last_name": "Bhatt",
            "full_name": "Rahul Bhatt",
            "email": "rahul.bhatt@example.com",
            "phone": "+919876543210",
            "location": {"city": "Bengaluru", "country": "India"}
        },
        "links": {
            "linkedin": "https://linkedin.com/in/rahulbhatt",
            "github": "https://github.com/rahulbhatt",
            "portfolio": "https://rahulbhatt.dev"
        },
        "work_eligibility": {
            "authorized_to_work": True,
            "requires_sponsorship": False
        },
        "preferences": {
            "years_of_experience": 4,
            "expected_salary": "1800000",
            "notice_period_days": 30
        }
    }

    os.makedirs("profiles/resumes", exist_ok=True)
    dummy_resume_path = "profiles/resumes/Rahul_Bhatt_Resume.pdf"
    if not os.path.exists(dummy_resume_path):
        with open(dummy_resume_path, "wb") as f:
            f.write(b"%PDF-1.4 Mock Resume PDF Content")

    for i in range(1, 16):
        url = f"https://www.linkedin.com/jobs/view/easyapply-{i}"
        db.insert_job(company=f"EasyApply Corp {i}", role=f"Software Engineer {i}", url=url, jd_text="JD Text", jd_hash=f"hash_easyapply_{i}")

    for i in range(16, 19):
        url = f"https://www.linkedin.com/jobs/view/external-{i}"
        db.insert_job(company=f"External Corp {i}", role=f"External Engineer {i}", url=url, jd_text="JD Text", jd_hash=f"hash_external_{i}")

    pending = db.get_pending_jobs()
    print(f"Loaded {len(pending)} jobs into simulation database.", flush=True)

    async with async_playwright() as p:
        print("Launching Chromium...", flush=True)
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        print("Chromium launched successfully.", flush=True)
        context = await browser.new_context()
        page = await context.new_page()

        async def route_handler(route: Route):
            url = route.request.url
            if "easyapply-" in url:
                raw_id = url.split("easyapply-")[1].split("?")[0].split("#")[0]
                job_id = int(raw_id)
                html = generate_easy_apply_html(job_id)
                await route.fulfill(status=200, content_type="text/html", body=html)
            elif "external-" in url:
                raw_id = url.split("external-")[1].split("?")[0].split("#")[0]
                job_id = int(raw_id)
                html = generate_external_html(job_id)
                await route.fulfill(status=200, content_type="text/html", body=html)
            else:
                await route.continue_()

        await page.route("https://www.linkedin.com/jobs/view/*", route_handler)

        llm_pool = GroqPool(["dummy_key"])
        handler = LinkedInHandler(page, llm_pool, "Rahul Bhatt Resume Text", profile_data)

        results = []
        for idx, job in enumerate(pending, 1):
            print(f"Starting job {idx}/18: {job.url}", flush=True)
            try:
                res = await asyncio.wait_for(handler.apply(job.url), timeout=10.0)
            except Exception as e:
                res = {"status": "failed", "reason": f"Timeout: {e}"}
            status = res.get("status")
            reason = res.get("reason")
            db.update_job_status(job.id, status, reason)
            results.append((job.id, job.url, status, reason))
            print(f"--> Finished Job #{job.id} [{job.company}]: status='{status}', reason='{reason}'", flush=True)

        await browser.close()

    applied_jobs = [r for r in results if r[2] in ("applied", "success")]
    skipped_jobs = [r for r in results if r[2] in ("skipped_external", "skipped")]
    failed_jobs = [r for r in results if r[2] not in ("applied", "success", "skipped_external", "skipped")]

    print("\n=== Simulation Summary ===", flush=True)
    print(f"Total Jobs Processed: {len(results)}", flush=True)
    print(f"Successfully Applied: {len(applied_jobs)} / 15 target", flush=True)
    print(f"Skipped External:     {len(skipped_jobs)} / 3 target", flush=True)
    print(f"Failed / Unexpected:  {len(failed_jobs)}", flush=True)

    assert len(applied_jobs) == 15, f"Expected 15 applied jobs, got {len(applied_jobs)}"
    assert len(skipped_jobs) == 3, f"Expected 3 skipped external jobs, got {len(skipped_jobs)}"
    assert len(failed_jobs) == 0, f"Expected 0 failed jobs, got {len(failed_jobs)}"

    # Test attempt counting and pending filtering
    db_test = Database(db_file)
    pending_after_first_run = db_test.get_pending_jobs()
    print(f"Pending jobs after first run: {len(pending_after_first_run)}", flush=True)
    assert len(pending_after_first_run) == 0, f"Expected 0 pending jobs after first run, got {len(pending_after_first_run)}"

    print("\n✅ Simulation Passed Successfully! All 15 Easy Apply jobs applied and 3 external jobs skipped.", flush=True)


if __name__ == "__main__":
    asyncio.run(run_simulation())