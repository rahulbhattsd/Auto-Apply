"""core/scraper.py — Job board scraping (Naukri primary, LinkedIn/Indeed secondary)."""

import asyncio
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
    async with httpx.AsyncClient(headers=HEADERS, timeout=10, follow_redirects=True) as client:
        for i, role in enumerate(target_roles, 1):
            loc = target_locations[0] if target_locations else ""
            url = f"https://www.naukri.com/{role.replace(' ', '-').lower()}-jobs-in-{loc.replace(' ', '-').lower()}"
            print(f"[naukri] ({i}/{len(target_roles)}) trying '{role}'...")
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select("article.jobTuple, div.cust-job-tuple")
                print(f"[naukri]   -> HTTP {resp.status_code}, {len(cards)} cards")
                for card in cards:
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
                print(f"[naukri]   -> ERROR: {e}, agle keyword pe ja rahe")
                logger.warning(f"scrape_naukri failed for {role!r}: {e}")
    return jobs


async def scrape_linkedin(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    """
    Anonymous httpx scrape — no session, filter params ignored by LinkedIn.
    Kept as fallback; use scrape_linkedin_browser() for authenticated scraping.
    """
    jobs = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=10, follow_redirects=True) as client:
        for i, role in enumerate(target_roles, 1):
            loc = target_locations[0] if target_locations else ""
            # f_LF=f_AL is LinkedIn's correct Easy Apply filter param
            url = (
                f"https://www.linkedin.com/jobs/search/"
                f"?keywords={role.replace(' ', '%20')}"
                f"&location={loc.replace(' ', '%20')}"
                f"&f_LF=f_AL"
            )
            print(f"[linkedin-anon] ({i}/{len(target_roles)}) trying '{role}'...")
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select("div.base-card")
                print(f"[linkedin-anon]   -> HTTP {resp.status_code}, {len(cards)} cards")
                for card in cards:
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
                print(f"[linkedin-anon]   -> ERROR: {e}, agle keyword pe ja rahe")
                logger.warning(f"scrape_linkedin failed for {role!r}: {e}")
    return jobs


async def _trigger_easy_apply_filter(page) -> bool:
    """
    Finds and triggers the Easy Apply filter button on LinkedIn job search UI.
    Targets #searchFilter_applyWithLinkedin (structural ID, language-independent)
    and verifies active state via 'artdeco-pill--selected' class.
    """
    filter_selectors = [
        '#searchFilter_applyWithLinkedin',
        'button[id*="applyWithLinkedin"]',
        'button[id*="searchFilter_f_AL"]',
        'button[aria-label*="সহজে আবেদন করুন"]',
        'button[aria-label*="Easy Apply"]',
        'button.search-reusables__filter-pill-button:has-text("Easy Apply")',
        'button.search-reusables__filter-pill-button:has-text("সহজে আবেদন করুন")',
    ]
    for sel in filter_selectors:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                cls = await loc.get_attribute("class") or ""
                pressed = await loc.get_attribute("aria-pressed")
                checked = await loc.get_attribute("aria-checked")
                if "artdeco-pill--selected" in cls or pressed == "true" or checked == "true":
                    print(f"[scraper] Easy Apply filter already active ({sel})")
                    return True

                print(f"[scraper] Triggering Easy Apply filter button: {sel}")
                await loc.click()
                await asyncio.sleep(2.5)
                return True
        except Exception:
            continue
    return False


async def scrape_linkedin_browser(
    target_roles: list[str],
    target_locations: list[str],
    page,  # authenticated Playwright Page object
    max_per_role: int = 25,
) -> list[dict]:
    """
    Authenticated scraper using the logged-in Playwright browser.
    Actively triggers the UI Easy Apply filter button (#searchFilter_applyWithLinkedin)
    and verifies that each job card has the Easy Apply badge before queueing.
    """
    jobs = []
    seen_urls: set[str] = set()

    for i, role in enumerate(target_roles, 1):
        loc = target_locations[0] if target_locations else "India"
        search_url = (
            f"https://www.linkedin.com/jobs/search/"
            f"?keywords={role.replace(' ', '%20')}"
            f"&location={loc.replace(' ', '%20')}"
            f"&f_AL=true"
        )
        print(f"[linkedin-browser] ({i}/{len(target_roles)}) searching '{role}' @ '{loc}'...")
        try:
            await page.goto(search_url, wait_until="commit", timeout=35000)
            try:
                await page.wait_for_selector("main, .scaffold-layout", timeout=30000)
            except Exception:
                pass
            await asyncio.sleep(2.0)

            # Actively trigger the Easy Apply filter button in the UI
            await _trigger_easy_apply_filter(page)
            await asyncio.sleep(2.0)

            # Collect job cards from the results container
            cards = page.locator(
                "ul.scaffold-layout__list-container li.scaffold-layout__list-item,"
                "div.job-card-container,"
                "ul.jobs-search__results-list li"
            )
            card_count = await cards.count()
            print(f"[linkedin-browser]   -> {card_count} job cards rendered")

            role_jobs = 0
            for idx in range(min(card_count, max_per_role)):
                card = cards.nth(idx)
                try:
                    card_text = await card.inner_text()
                    has_easy_apply = (
                        "সহজে আবেদন" in card_text
                        or "easy apply" in card_text.lower()
                        or "আবেদন" in card_text
                        or await card.locator(':has-text("Easy Apply"), :has-text("সহজে আবেদন")').count() > 0
                    )
                    if not has_easy_apply:
                        # Skip any sponsored or external jobs that bypass the filter
                        continue

                    # Extract Job Title
                    title_el = card.locator(
                        "a.job-card-list__title, a.job-card-container__link, span.sr-only"
                    ).first
                    title = (await title_el.inner_text()).strip() if await title_el.count() > 0 else ""

                    # Extract Company Name
                    company_el = card.locator(
                        ".job-card-container__company-name, .artdeco-entity-lockup__subtitle span"
                    ).first
                    company = (await company_el.inner_text()).strip() if await company_el.count() > 0 else "Unknown"

                    # Extract Job URL
                    link_el = card.locator(
                        "a.job-card-list__title, a.job-card-container__link, a[href*='/jobs/view/']"
                    ).first
                    href = await link_el.get_attribute("href") if await link_el.count() > 0 else ""
                    if href and not href.startswith("http"):
                        href = "https://www.linkedin.com" + href
                    if href and "/jobs/view/" in href:
                        href = href.split("?")[0]

                    if not href or href in seen_urls or "/jobs/view/" not in href:
                        continue

                    seen_urls.add(href)
                    jobs.append({
                        "company": company,
                        "role": title or role,
                        "url": href,
                        "jd_text": "",
                    })
                    role_jobs += 1
                except Exception:
                    continue

            print(f"[linkedin-browser]   -> {role_jobs} verified Easy Apply jobs queued for '{role}'")
        except Exception as e:
            print(f"[linkedin-browser]   -> ERROR for '{role}': {e}")
            logger.warning(f"scrape_linkedin_browser failed for {role!r}: {e}")

    return jobs



async def scrape_indeed(target_roles: list[str], target_locations: list[str]) -> list[dict]:
    jobs = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=10, follow_redirects=True) as client:
        for i, role in enumerate(target_roles, 1):
            loc = target_locations[0] if target_locations else ""
            url = f"https://www.indeed.com/jobs?q={role.replace(' ', '+')}&l={loc.replace(' ', '+')}"
            print(f"[indeed] ({i}/{len(target_roles)}) trying '{role}'...")
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select("div.job_seen_beacon")
                print(f"[indeed]   -> HTTP {resp.status_code}, {len(cards)} cards")
                for card in cards:
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
                print(f"[indeed]   -> ERROR: {e}, agle keyword pe ja rahe")
                logger.warning(f"scrape_indeed failed for {role!r}: {e}")
    return jobs


async def scrape_jobs(profile: dict, target_count: int = 50, page=None) -> list[dict]:
    js = profile.get("job_search", {})
    roles = js.get("target_roles", [])
    locations = js.get("target_locations", [])

    if not roles:
        print("[scraper] WARNING: profile.yaml me job_search.target_roles set nahi hai — kuch search hi nahi ho raha!")

    seen_urls, results = set(), []

    # Priority 1: Authenticated browser scraper with Easy Apply filter trigger
    if page:
        print("[scraper] Running authenticated LinkedIn Easy Apply scraper...")
        browser_jobs = await scrape_linkedin_browser(roles, locations, page, max_per_role=target_count)
        print(f"[scraper] scrape_linkedin_browser: {len(browser_jobs)} verified Easy Apply jobs found")
        for job in browser_jobs:
            if job["url"] not in seen_urls:
                seen_urls.add(job["url"])
                results.append(job)
                if len(results) >= target_count:
                    return results[:target_count]

    # Priority 2: Fallback sources if below target_count or if page is None
    for source_fn in (scrape_linkedin, scrape_naukri, scrape_indeed):
        if len(results) >= target_count:
            break
        source_jobs = await source_fn(roles, locations)
        print(f"[scraper] {source_fn.__name__}: {len(source_jobs)} raw listings mile")
        for job in source_jobs:
            if job["url"] in seen_urls:
                continue
            seen_urls.add(job["url"])
            results.append(job)
            if len(results) >= target_count:
                break
    return results[:target_count]


scrape_all = scrape_jobs

