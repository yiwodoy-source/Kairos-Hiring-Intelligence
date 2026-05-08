"""
Candidate Profile Scrapers for LinkedIn, Indeed, and Naukri
Sources: LinkedIn (via Serper/Google), Indeed Resumes, Naukri Profiles
Legal: Uses public search results and respects robots.txt
"""
import requests
import logging
import hashlib
import os
import re
from datetime import datetime
from dotenv import load_dotenv
from typing import List, Dict, Optional
import time
from duckduckgo_search import DDGS
from urllib.parse import urlparse

load_dotenv()
logger = logging.getLogger(__name__)


class SerperCandidateSearcher:
    """
    Uses Serper.dev (Google Search API) OR DuckDuckGo to find candidate profiles
    across LinkedIn, Indeed, and Naukri.
    """
    
    API_URL = "https://google.serper.dev/search"
    
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('SERPER_API_KEY')
        self.use_ddg = False
        
        if not self.api_key:
            logger.warning("Serper API key not found. Switching to DuckDuckGo (Free Mode) for authentic data.")
            self.use_ddg = True
        
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({
                'X-API-KEY': self.api_key,
                'Content-Type': 'application/json'
            })
    
    def _search_ddg(self, query: str, num_results: int) -> List[Dict]:
        """Helper to search using DuckDuckGo"""
        results = []
        try:
            with DDGS() as ddgs:
                # region='in-en' for India English, or 'wt-wt' for worldwide
                ddg_results = list(ddgs.text(query, region='in-en', max_results=num_results))
                
                for r in ddg_results:
                    results.append({
                        'title': r.get('title', ''),
                        'link': r.get('href', ''),
                        'snippet': r.get('body', '')
                    })
        except Exception as e:
            logger.error(f"DuckDuckGo search error: {e}")
        return results

    def search_linkedin_profiles(self, job_title: str, skills: str, location: str, num_results: int = 10) -> List[Dict]:
        """
        Search for LinkedIn profiles
        """
        candidates = []
        query = f'site:linkedin.com/in/ "{job_title}" {skills} {location}'
        
        try:
            raw_results = []
            
            if self.use_ddg:
                logger.info(f"Searching LinkedIn via DuckDuckGo: {query}")
                raw_results = self._search_ddg(query, num_results)
            else:
                # Serper (Google) Search
                payload = {
                    "q": query,
                    "num": num_results,
                    "gl": "in",
                    "hl": "en"
                }
                response = self.session.post(self.API_URL, json=payload, timeout=30)
                response.raise_for_status()
                data = response.json()
                raw_results = data.get('organic', [])
                logger.info(f"Serper Query: {query}")
                logger.info(f"Serper Raw Results: {len(raw_results)}")
                if len(raw_results) == 0:
                    logger.warning(f"Serper Response: {data}")
                    # Fallback to DuckDuckGo if Google returns no results
                    raw_results = self._search_ddg(query, num_results)
            
            for result in raw_results[:num_results]:
                candidate = self._parse_linkedin_result(result, job_title, skills, location)
                if candidate:
                    candidates.append(candidate)
            
            logger.info(f"Found {len(candidates)} LinkedIn profiles for {job_title}")
            
        except Exception as e:
            logger.error(f"Error searching LinkedIn: {e}")
            return []
        
        return candidates
    
    def search_indeed_profiles(self, job_title: str, skills: str, location: str, num_results: int = 10) -> List[Dict]:
        """
        Search for Indeed resume profiles
        """
        candidates = []
        query = f'site:indeed.com/r/ "{job_title}" {skills} {location} resume'
        
        try:
            raw_results = []
            
            if self.use_ddg:
                logger.info(f"Searching Indeed via DuckDuckGo: {query}")
                raw_results = self._search_ddg(query, num_results)
            else:
                payload = {
                    "q": query,
                    "num": num_results,
                    "gl": "in",
                    "hl": "en"
                }
                response = self.session.post(self.API_URL, json=payload, timeout=30)
                response.raise_for_status()
                data = response.json()
                raw_results = data.get('organic', [])
                if len(raw_results) == 0:
                    logger.warning(f"Serper Response: {data}")
                    raw_results = self._search_ddg(query, num_results)
            
            for result in raw_results[:num_results]:
                candidate = self._parse_indeed_result(result, job_title, skills, location)
                if candidate:
                    candidates.append(candidate)
            
            logger.info(f"Found {len(candidates)} Indeed profiles for {job_title}")
            
        except Exception as e:
            logger.error(f"Error searching Indeed: {e}")
            return []
        
        return candidates
    
    def search_naukri_profiles(self, job_title: str, skills: str, location: str, num_results: int = 10) -> List[Dict]:
        """
        Search for Naukri.com profiles
        """
        candidates = []
        query = f'site:naukri.com "{job_title}" {skills} {location} profile'
        
        try:
            raw_results = []
            
            if self.use_ddg:
                logger.info(f"Searching Naukri via DuckDuckGo: {query}")
                raw_results = self._search_ddg(query, num_results)
            else:
                payload = {
                    "q": query,
                    "num": num_results,
                    "gl": "in",
                    "hl": "en"
                }
                response = self.session.post(self.API_URL, json=payload, timeout=30)
                response.raise_for_status()
                data = response.json()
                raw_results = data.get('organic', [])
                if len(raw_results) == 0:
                    logger.warning(f"Serper Response: {data}")
                    raw_results = self._search_ddg(query, num_results)
            
            for result in raw_results[:num_results]:
                candidate = self._parse_naukri_result(result, job_title, skills, location)
                if candidate:
                    candidates.append(candidate)
            
            logger.info(f"Found {len(candidates)} Naukri profiles for {job_title}")
            
        except Exception as e:
            logger.error(f"Error searching Naukri: {e}")
            return []
        
        return candidates
    
    def search_all_platforms(self, job_title: str, skills: str, location: str) -> List[Dict]:
        """
        Search across all platforms and combine results
        """
        all_candidates = []
        
        # Search each platform
        linkedin_candidates = self.search_linkedin_profiles(job_title, skills, location, num_results=5)
        indeed_candidates = self.search_indeed_profiles(job_title, skills, location, num_results=3)
        naukri_candidates = self.search_naukri_profiles(job_title, skills, location, num_results=4)
        
        all_candidates.extend(linkedin_candidates)
        all_candidates.extend(indeed_candidates)
        all_candidates.extend(naukri_candidates)
        
        # Deduplicate by name
        seen_names = set()
        unique_candidates = []
        for candidate in all_candidates:
            name_key = candidate['name'].lower().strip()
            if name_key not in seen_names:
                seen_names.add(name_key)
                unique_candidates.append(candidate)
        
        logger.info(f"Total unique candidates found: {len(unique_candidates)}")
        return unique_candidates

    # --- Parsing helpers ---
    def _extract_name(self, title: str, link: str) -> Optional[str]:
        try:
            # Try from title
            name_match = re.search(r"([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)", title or "")
            if name_match:
                return name_match.group(1)
            # Fallback to link path segments
            path = link.split('/')
            for seg in path[::-1]:
                seg = seg.replace('-', ' ').strip()
                if re.match(r"^[a-zA-Z]+(\s+[a-zA-Z]+)+$", seg):
                    return seg.title()
        except Exception:
            pass
        return None

    def _is_valid_profile(self, link: str, source: str) -> bool:
        try:
            if not link:
                return False
            host = urlparse(link).netloc.lower()
            path = urlparse(link).path.lower()
            if source == "LinkedIn":
                return ("linkedin.com" in host) and ("/in/" in path)
            if source == "Indeed":
                return ("indeed.com" in host) and ("/r/" in path or "resume" in path)
            if source == "Naukri.com":
                return ("naukri.com" in host) and ("profile" in path)
            return False
        except Exception:
            return False

    def _format_candidate(self, name: str, job_title: str, skills: str, location: str, source: str, link: str, snippet: str) -> Dict:
        summary = snippet or f"Profile snippet for {job_title}"
        return {
            "name": name or "Unknown Candidate",
            "company": "",
            "location": location,
            "resumeText": f"Bio: {summary}",
            "sourcingSource": source,
            # do not fabricate a match score; leave it undefined
            "isSourced": True,
            "sourcingStage": "Discovered",
            "skills": [s.strip() for s in skills.split(',') if s.strip()],
            "experience": [],
            "email": "",
            "phone": "",
            "linkedinUrl": link if source == "LinkedIn" else "",
            "portfolioUrl": link if source not in ("LinkedIn", "Naukri.com", "Indeed") else "",
        }

    def _parse_generic_result(self, result: Dict, job_title: str, skills: str, location: str, source: str) -> Optional[Dict]:
        title = result.get('title', '')
        link = result.get('link', result.get('href', ''))
        snippet = result.get('snippet', result.get('body', ''))
        name = self._extract_name(title, link)
        # Only return authentic-looking results: valid host/path, parsed name, meaningful snippet
        if not name:
            return None
        if not self._is_valid_profile(link, source):
            return None
        if not snippet or len(snippet.strip()) < 20:
            return None
        return self._format_candidate(name, job_title, skills, location, source, link, snippet)

    def _parse_linkedin_result(self, result: Dict, job_title: str, skills: str, location: str) -> Optional[Dict]:
        return self._parse_generic_result(result, job_title, skills, location, "LinkedIn")

    def _parse_indeed_result(self, result: Dict, job_title: str, skills: str, location: str) -> Optional[Dict]:
        return self._parse_generic_result(result, job_title, skills, location, "Indeed")

    def _parse_naukri_result(self, result: Dict, job_title: str, skills: str, location: str) -> Optional[Dict]:
        return self._parse_generic_result(result, job_title, skills, location, "Naukri.com")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    searcher = SerperCandidateSearcher()
    
    # Search all platforms
    candidates = searcher.search_all_platforms(
        job_title="Senior React Developer",
        skills="React, TypeScript, Node.js, AWS",
        location="Bangalore"
    )
    
    print(f"\nFound {len(candidates)} total candidates:")
    for candidate in candidates:
        print(f"- {candidate['name']} ({candidate['sourcingSource']}) - {candidate['aiMatchScore']}% match")
