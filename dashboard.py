"""
dashboard.py — FastAPI server for the local AutoApply dashboard.

Runs on http://localhost:8000
Serves:
  GET  /                 -> dashboard_ui/index.html
  GET  /api/jobs          -> JSON list of jobs from SQLite (id, company, role,
                              status, applied_at, ...)
  GET  /api/stats         -> JSON daily stats (applied/stuck/failed counts)
  POST /api/resume/{id}   -> triggers resume of a stuck job (barriers.human_handoff)
  POST /api/skip/{id}     -> marks a stuck job as skipped

Run with: uvicorn dashboard:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# TODO: from core import db

app = FastAPI(title="AutoApply Dashboard")


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve dashboard_ui/index.html."""
    pass


@app.get("/api/jobs")
async def get_jobs():
    """Return last N jobs with status, for the dashboard table."""
    # TODO: query core.db, return JSONResponse
    pass


@app.get("/api/stats")
async def get_stats():
    """Return today's applied/stuck/failed counts."""
    pass


@app.post("/api/resume/{job_id}")
async def resume_job(job_id: int):
    """Signal the agent to resume a stuck job (via barriers.human_handoff)."""
    pass


@app.post("/api/skip/{job_id}")
async def skip_job(job_id: int):
    """Mark a stuck job as 'skipped' and move on."""
    pass
