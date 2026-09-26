"""core/router.py — Domain -> ATS handler dispatch.

This is the fix for the biggest reliability bug in the old flow: main.py
used to route *every* job through the LinkedIn handler regardless of URL
(`if "linkedin.com" in job_url or True:`), so Greenhouse/Lever/Workday/
generic career-page jobs were silently mishandled even though their
handlers already existed in ats/.

`get_handler(url)` returns ("self_nav", HandlerClass) for handlers that
navigate the page themselves and expose `apply(job_url)` (LinkedIn, Indeed
- both are multi-step modal flows), or ("ats", HandlerClass) for the
ATSHandler-family that expects `HandlerClass(page, job, profile, resume,
pool).apply()` and navigates internally from `job["url"]`.

Imports are done lazily inside the function to avoid import cycles with
main.py and with the individual handler modules.
"""


def get_handler(url: str):
    u = (url or "").lower()

    if "linkedin.com" in u:
        from handlers.linkedin_handler import LinkedInHandler
        return "self_nav", LinkedInHandler

    if "indeed.com" in u:
        from handlers.indeed_handler import IndeedHandler
        return "self_nav", IndeedHandler

    if "greenhouse.io" in u:
        from ats.greenhouse import GreenhouseHandler
        return "ats", GreenhouseHandler

    if "lever.co" in u:
        from ats.lever import LeverHandler
        return "ats", LeverHandler

    if "myworkdayjobs.com" in u or "workday.com" in u:
        from ats.workday import WorkdayHandler
        return "ats", WorkdayHandler

    if "ashbyhq.com" in u:
        from ats.ashby import AshbyHandler
        return "ats", AshbyHandler

    if "glassdoor.com" in u:
        from ats.glassdoor import GlassdoorHandler
        return "ats", GlassdoorHandler

    from ats.generic import GenericHandler
    return "ats", GenericHandler
