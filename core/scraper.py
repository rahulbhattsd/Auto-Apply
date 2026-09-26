"""core/scraper.py — Job board scraping (Naukri primary, LinkedIn/Indeed secondary)."""

import re
import httpx
from bs4 import BeautifulSoup
from loguru import logger

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def clean_jd_text(raw_html: str, max_words: int = 400) -> str:
    soup = BeautifulSoup(raw_html or "", "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()
    return " ".join(text.split()[:max_words])


async def scrape_naukri(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    jobs = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        for role in target_roles:
            loc = target_locations[0] if target_locations else ""
            url = f"https://www.naukri.com/{role.replace(' ', '-').lower()}-jobs-in-{loc.replace(' ', '-').lower()}"
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                for card in soup.select("article.jobTuple, div.cust-job-tuple"):
                    title_el = card.select_one("a.title, a.ellipsis")
                    company_el = card.select_one("a.subTitle, .comp-name")
                    if not title_el:
                        continue
                    jobs.append({
                        "company": company_el.get_text(strip=True) if company_el else "Unknown",
                        "role": title_el.get_text(strip=True),
                        "url": title_el.get("href", ""),
                        "jd_text": clean_jd_text(card.get_text(separator=" ")),
                    })
            except Exception as e:
                logger.warning(f"scrape_naukri failed for {role!r}: {e}")
    return jobs


async def scrape_linkedin(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    jobs = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        for role in target_roles:
            loc = target_locations[0] if target_locations else ""
            url = f"https://www.linkedin.com/jobs/search/?keywords={role.replace(' ', '%20')}&location={loc.replace(' ', '%20')}&f_AL=true"
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                for card in soup.select("div.base-card"):
                    title_el = card.select_one("h3.base-search-card__title")
                    company_el = card.select_one("h4.base-search-card__subtitle")
                    link_el = card.select_one("a.base-card__full-link")
                    if not title_el or not link_el:
                        continue
                    jobs.append({
                        "company": company_el.get_text(strip=True) if company_el else "Unknown",
                        "role": title_el.get_text(strip=True),
                        "url": link_el.get("href", ""),
                        "jd_text": clean_jd_text(card.get_text(separator=" ")),
                    })
            except Exception as e:
                logger.warning(f"scrape_linkedin failed for {role!r}: {e}")
    return jobs


async def scrape_indeed(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    jobs = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        for role in target_roles:
            loc = target_locations[0] if target_locations else ""
            url = f"https://www.indeed.com/jobs?q={role.replace(' ', '+')}&l={loc.replace(' ', '+')}"
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                for card in soup.select("div.job_seen_beacon"):
                    title_el = card.select_one("h2.jobTitle span")
                    company_el = card.select_one("span.companyName")
                    link_el = card.select_one("a")
                    if not title_el or not link_el:
                        continue
                    jobs.append({
                        "company": company_el.get_text(strip=True) if company_el else "Unknown",
                        "role": title_el.get_text(strip=True),
                        "url": "https://www.indeed.com" + link_el.get("href", ""),
                        "jd_text": clean_jd_text(card.get_text(separator=" ")),
                    })
            except Exception as e:
                logger.warning(f"scrape_indeed failed for {role!r}: {e}")
    return jobs


async def scrape_jobs(profile: dict, target_count: int = 50) -> list[dict]:
    js = profile.get("job_search", {})
    roles = js.get("target_roles", [])
    locations = js.get("target_locations", [])

    seen_urls, results = set(), []
    for source_fn in (scrape_naukri, scrape_linkedin, scrape_indeed):
        if len(results) >= target_count:
            break
        for job in await source_fn(roles, locations):
            if job["url"] in seen_urls:
                continue
            seen_urls.add(job["url"])
            results.append(job)
            if len(results) >= target_count:
                break
    return results[:target_count]


scrape_all = scrape_jobs
