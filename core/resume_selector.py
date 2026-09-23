"""core/resume_selector.py — Pick the best resume PDF based on job title."""

from pathlib import Path

RESUME_MAP = {
    "ai": "resumes/resume_ai.pdf",
    "ml": "resumes/resume_ai.pdf",
    "machine learning": "resumes/resume_ai.pdf",
    "applied ai": "resumes/resume_ai.pdf",
    "llm": "resumes/resume_ai.pdf",
    "nlp": "resumes/resume_ai.pdf",
    "full stack": "resumes/resume_sde.pdf",
    "fullstack": "resumes/resume_sde.pdf",
    "mern": "resumes/resume_sde.pdf",
    "frontend": "resumes/resume_frontend.pdf",
    "front end": "resumes/resume_frontend.pdf",
    "react": "resumes/resume_frontend.pdf",
    "backend": "resumes/resume_sde.pdf",
    "back end": "resumes/resume_sde.pdf",
    "software engineer": "resumes/resume_sde.pdf",
    "sde": "resumes/resume_sde.pdf",
    "associate": "resumes/resume_sde.pdf",
    "assistant system": "resumes/resume_sde.pdf",
}
DEFAULT = "resumes/resume_sde.pdf"

def pick_resume(job_title: str) -> str:
    t = (job_title or "").lower()
    for keyword, path in RESUME_MAP.items():
        if keyword in t:
            if Path(path).exists():
                return path
    return DEFAULT if Path(DEFAULT).exists() else "resume.pdf"