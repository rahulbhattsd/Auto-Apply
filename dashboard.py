"""dashboard.py — FastAPI server. Run: uvicorn dashboard:app --port 8000"""

from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from core import db

app = FastAPI(title="AutoApply Dashboard")
INDEX_HTML = Path("dashboard_ui/index.html")


@app.get("/", response_class=HTMLResponse)
async def index():
    if not INDEX_HTML.exists():
        raise HTTPException(404, "dashboard_ui/index.html not found")
    return INDEX_HTML.read_text()


@app.get("/api/jobs")
async def get_jobs(limit: int = 50, status: str | None = None):
    return JSONResponse(db.get_jobs(limit=limit, status=status))


@app.get("/api/stats")
async def get_stats():
    return JSONResponse(db.get_today_stats())


# NOTE: uses sentinel statuses 'resume_requested' / 'skip_requested'.
# barriers.human_handoff.should_resume/should_skip must poll db.get_jobs()
# for these values on the given job_id.
@app.post("/api/resume/{job_id}")
async def resume_job(job_id: int):
    db.update_job_status(job_id, "resume_requested")
    return {"ok": True, "job_id": job_id, "action": "resume"}


@app.post("/api/skip/{job_id}")
async def skip_job(job_id: int):
    db.update_job_status(job_id, "skip_requested")
    return {"ok": True, "job_id": job_id, "action": "skip"}
