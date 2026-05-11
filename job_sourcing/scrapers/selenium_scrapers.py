"""
Selenium-based candidate scrapers for JavaScript-heavy job sites.
Scrapes publicly accessible profile/resume pages on Naukri, Wellfound (AngelList),
and falls back to DuckDuckGo HTML search when direct scraping is blocked.

Usage:
    scraper = SeleniumCandidateScraper(headless=True)
    candidates = scraper.search_all(role="Python Developer", location="Bangalore", limit=10)
    scraper.quit()

Requirements:
    pip install selenium webdriver-manager
"""

import logging
import re
import time
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional import — selenium is only required at runtime, not at import time.
# This lets the module load even if selenium is not installed, so the Flask
# app can still boot and return a helpful error on the relevant endpoint.
# ---------------------------------------------------------------------------
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        _WDM_AVAILABLE = True
    except ImportError:
        _WDM_AVAILABLE = False
    _SELENIUM_AVAILABLE = True
except ImportError:
    _SELENIUM_AVAILABLE = False
    _WDM_AVAILABLE = False


def _build_driver(headless: bool = True):
    if not _SELENIUM_AVAILABLE:
        raise RuntimeError(
            "selenium is not installed. Run: pip install selenium webdriver-manager"
        )
    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    if _WDM_AVAILABLE:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=opts)
    else:
        driver = webdriver.Chrome(options=opts)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
    )
    return driver


def _safe_text(driver, selector: str, by=None) -> str:
    by = by or By.CSS_SELECTOR
    try:
        el = driver.find_element(by, selector)
        return el.text.strip()
    except NoSuchElementException:
        return ""


def _extract_skills_from_text(text: str) -> List[str]:
    """Heuristic: pull capitalised tech words and known skill patterns from free text."""
    tech_pattern = re.compile(
        r"\b(Python|Java(?:Script|EE)?|TypeScript|React|Angular|Vue|Node\.?js|"
        r"Django|Flask|Spring|Laravel|PHP|Ruby|Rails|Go|Golang|Rust|Swift|Kotlin|"
        r"C\+\+|C#|\.NET|AWS|Azure|GCP|Docker|Kubernetes|SQL|PostgreSQL|MySQL|"
        r"MongoDB|Redis|Kafka|Spark|TensorFlow|PyTorch|Pandas|NumPy|Scikit[- ]?learn|"
        r"Machine Learning|Deep Learning|NLP|DevOps|CI/?CD|Git|Linux|Microservices)\b",
        re.IGNORECASE,
    )
    found = tech_pattern.findall(text)
    seen, unique = set(), []
    for s in found:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique[:15]


# ---------------------------------------------------------------------------
# DuckDuckGo HTML scraper (no JS needed, no API key needed)
# ---------------------------------------------------------------------------

class DDGProfileSearcher:
    """
    Searches DuckDuckGo HTML (lite.duckduckgo.com) for public profile pages.
    No API key, no Selenium — pure requests.  Returns raw search hits which
    the caller can parse into candidate dicts.
    """

    LITE_URL = "https://lite.duckduckgo.com/lite/"

    def __init__(self):
        import requests
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
            ),
            "Accept": "text/html",
        })

    def search(self, query: str, num: int = 10) -> List[Dict]:
        """Return list of {title, link, snippet} dicts."""
        results = []
        try:
            resp = self._session.post(
                self.LITE_URL,
                data={"q": query, "kl": "in-en"},
                timeout=15,
            )
            resp.raise_for_status()
            # Parse result rows from DDG Lite HTML
            rows = re.findall(
                r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]+)</a>.*?'
                r'<td[^>]*class="result-snippet"[^>]*>(.*?)</td>',
                resp.text,
                re.DOTALL,
            )
            for link, title, snippet in rows[:num]:
                clean_snippet = re.sub(r"<[^>]+>", " ", snippet).strip()
                results.append({"link": link, "title": title.strip(), "snippet": clean_snippet})
        except Exception as exc:
            logger.warning(f"[DDG] Search failed for '{query}': {exc}")
        return results


def _parse_profile_hit(hit: Dict, role: str, location: str, source_label: str) -> Optional[Dict]:
    """Convert a raw search hit into a structured candidate dict."""
    link = hit.get("link", "")
    title = hit.get("title", "")
    snippet = hit.get("snippet", "")

    name = _extract_name_from_title(title) or _extract_name_from_url(link)
    if not name:
        return None
    if len(snippet.strip()) < 15:
        return None

    skills = _extract_skills_from_text(f"{title} {snippet}")
    return {
        "name": name,
        "email": "",
        "headline": title[:200],
        "location": location,
        "skills": skills,
        "profile_url": link,
        "about": snippet[:1000],
        "job_role": role,
        "source": source_label,
    }


def _extract_name_from_title(title: str) -> Optional[str]:
    m = re.search(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})", title)
    return m.group(1) if m else None


def _extract_name_from_url(url: str) -> Optional[str]:
    parts = url.rstrip("/").split("/")
    for seg in reversed(parts):
        seg = re.sub(r"[^a-zA-Z\-]", "", seg)
        words = [w.capitalize() for w in seg.split("-") if len(w) > 1]
        if 2 <= len(words) <= 4:
            return " ".join(words)
    return None


# ---------------------------------------------------------------------------
# Naukri public profile scraper (Selenium)
# ---------------------------------------------------------------------------

class NaukriSeleniumScraper:
    """Scrapes publicly listed Naukri profile search pages."""

    BASE = "https://www.naukri.com"

    def __init__(self, driver):
        self._driver = driver
        self._wait = WebDriverWait(driver, 10)

    def search(self, role: str, location: str, limit: int = 5) -> List[Dict]:
        candidates = []
        try:
            slug_role = re.sub(r"[^a-z0-9]+", "-", role.lower()).strip("-")
            slug_loc = re.sub(r"[^a-z0-9]+", "-", location.lower()).strip("-")
            url = f"{self.BASE}/{slug_role}-jobs-in-{slug_loc}"
            logger.info(f"[Naukri] Opening: {url}")
            self._driver.get(url)
            time.sleep(2)

            job_cards = self._driver.find_elements(By.CSS_SELECTOR, "article.jobTuple")
            if not job_cards:
                job_cards = self._driver.find_elements(By.CSS_SELECTOR, ".srp-jobtuple-wrapper")

            for card in job_cards[:limit]:
                try:
                    name_el = card.find_element(By.CSS_SELECTOR, ".title a, .jobTitle a")
                    headline = name_el.text.strip()
                    profile_url = name_el.get_attribute("href") or ""
                    loc_text = _safe_text(self._driver, ".location span") or location
                    skills_text = ""
                    try:
                        skills_text = card.find_element(By.CSS_SELECTOR, ".tags li, .skill-tag").text
                    except NoSuchElementException:
                        pass
                    skills = _extract_skills_from_text(f"{headline} {skills_text}")
                    fake_name = _extract_name_from_url(profile_url) or f"Naukri Candidate {len(candidates)+1}"
                    candidates.append({
                        "name": fake_name,
                        "email": "",
                        "headline": headline[:200],
                        "location": loc_text[:100],
                        "skills": skills,
                        "profile_url": profile_url[:500],
                        "about": f"Listed on Naukri.com for {role} roles in {location}. Skills: {skills_text}".strip()[:2000],
                        "job_role": role,
                        "source": "Naukri",
                    })
                except Exception as ex:
                    logger.debug(f"[Naukri] Card parse error: {ex}")
        except Exception as ex:
            logger.warning(f"[Naukri] Scrape failed: {ex}")
        return candidates


# ---------------------------------------------------------------------------
# Wellfound (formerly AngelList) public scraper (Selenium)
# ---------------------------------------------------------------------------

class WellfoundSeleniumScraper:
    """Scrapes publicly accessible Wellfound job/candidate listings."""

    BASE = "https://wellfound.com"

    def __init__(self, driver):
        self._driver = driver
        self._wait = WebDriverWait(driver, 10)

    def search(self, role: str, location: str, limit: int = 5) -> List[Dict]:
        candidates = []
        try:
            slug_role = re.sub(r"[^a-z0-9]+", "-", role.lower()).strip("-")
            url = f"{self.BASE}/role/{slug_role}"
            logger.info(f"[Wellfound] Opening: {url}")
            self._driver.get(url)
            time.sleep(3)

            cards = self._driver.find_elements(By.CSS_SELECTOR, "[data-test='JobListing'], .styles_component__Ey28k")
            for card in cards[:limit]:
                try:
                    headline = _safe_text(self._driver, "h2, .styles_title__xpQDw") or role
                    profile_link = ""
                    try:
                        a = card.find_element(By.TAG_NAME, "a")
                        profile_link = a.get_attribute("href") or ""
                    except NoSuchElementException:
                        pass
                    loc_text = _safe_text(self._driver, ".location, [data-test='location']") or location
                    about = card.text.strip()[:500]
                    skills = _extract_skills_from_text(about)
                    name = _extract_name_from_url(profile_link) or f"Wellfound Candidate {len(candidates)+1}"
                    candidates.append({
                        "name": name,
                        "email": "",
                        "headline": headline[:200],
                        "location": loc_text[:100],
                        "skills": skills,
                        "profile_url": profile_link[:500] if profile_link else url,
                        "about": about[:2000],
                        "job_role": role,
                        "source": "Wellfound",
                    })
                except Exception as ex:
                    logger.debug(f"[Wellfound] Card parse error: {ex}")
        except Exception as ex:
            logger.warning(f"[Wellfound] Scrape failed: {ex}")
        return candidates


# ---------------------------------------------------------------------------
# Main facade
# ---------------------------------------------------------------------------

class SeleniumCandidateScraper:
    """
    Unified Selenium + DDG scraper.

    Strategy:
      1. Try Naukri Selenium scraper (good for India roles)
      2. Try Wellfound Selenium scraper (tech / startup roles)
      3. Fall back to DDG search for both sites (no Selenium needed)

    Always returns the DDG results as a safety net so the endpoint never
    returns an empty list due to Selenium/ChromeDriver issues.
    """

    def __init__(self, headless: bool = True):
        self._driver = None
        self._headless = headless
        self._ddg = DDGProfileSearcher()
        if _SELENIUM_AVAILABLE:
            try:
                self._driver = _build_driver(headless)
                logger.info("[SeleniumScraper] ChromeDriver ready")
            except Exception as ex:
                logger.warning(f"[SeleniumScraper] ChromeDriver unavailable, DDG-only mode: {ex}")

    def quit(self):
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None

    def _ddg_search(self, role: str, location: str, site: str, source_label: str, limit: int) -> List[Dict]:
        query = f'site:{site} "{role}" {location} profile resume'
        hits = self._ddg.search(query, num=limit * 2)
        candidates = []
        for h in hits:
            c = _parse_profile_hit(h, role, location, source_label)
            if c:
                candidates.append(c)
            if len(candidates) >= limit:
                break
        return candidates

    def search_naukri(self, role: str, location: str, limit: int = 5) -> List[Dict]:
        if self._driver:
            try:
                scraper = NaukriSeleniumScraper(self._driver)
                results = scraper.search(role, location, limit)
                if results:
                    return results
            except Exception as ex:
                logger.warning(f"[Naukri] Selenium failed, falling back to DDG: {ex}")
        return self._ddg_search(role, location, "naukri.com", "Naukri", limit)

    def search_wellfound(self, role: str, location: str, limit: int = 5) -> List[Dict]:
        if self._driver:
            try:
                scraper = WellfoundSeleniumScraper(self._driver)
                results = scraper.search(role, location, limit)
                if results:
                    return results
            except Exception as ex:
                logger.warning(f"[Wellfound] Selenium failed, falling back to DDG: {ex}")
        return self._ddg_search(role, location, "wellfound.com", "Wellfound", limit)

    def search_all(self, role: str, location: str = "India", limit: int = 10) -> List[Dict]:
        """Search Naukri + Wellfound and deduplicate by profile URL."""
        half = max(limit // 2, 3)
        naukri_results = self.search_naukri(role, location, half)
        wellfound_results = self.search_wellfound(role, location, half)

        seen_urls: set = set()
        combined: List[Dict] = []
        for c in naukri_results + wellfound_results:
            url = c.get("profile_url", "")
            if url and url in seen_urls:
                continue
            seen_urls.add(url)
            combined.append(c)
            if len(combined) >= limit:
                break

        logger.info(f"[SeleniumScraper] {role} @ {location}: {len(combined)} candidates total")
        return combined
