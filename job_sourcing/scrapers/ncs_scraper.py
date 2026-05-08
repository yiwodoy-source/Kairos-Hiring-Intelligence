"""
National Career Service (NCS) Portal Scraper
Source: https://www.ncs.gov.in/
Legal: Public government portal, allows crawling
"""
import requests
from bs4 import BeautifulSoup
import logging
from datetime import datetime
from urllib.parse import urljoin
import hashlib
import json

from utils.robots_checker import robots_checker
from utils.rate_limiter import rate_limiter, ExponentialBackoff

logger = logging.getLogger(__name__)

class NCSPortalScraper:
    """Scraper for National Career Service portal"""
    
    BASE_URL = "https://www.ncs.gov.in"
    JOBS_ENDPOINT = "/Pages/vmsSearch.aspx"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'NexusHR-JobBot/1.0 (+https://nexushr.com/bot)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        })
    
    def scrape_jobs(self, location="", skill="", max_pages=5):
        """
        Scrape jobs from NCS portal
        
        Args:
            location (str): Location filter
            skill (str): Skill filter
            max_pages (int): Maximum pages to scrape
            
        Returns:
            list: List of job dictionaries
        """
        jobs = []
        
        # Check robots.txt
        if not robots_checker.can_fetch(self.BASE_URL):
            logger.error("NCS portal blocked by robots.txt")
            return jobs
        
        for page in range(1, max_pages + 1):
            try:
                # Rate limiting
                rate_limiter.wait_if_needed("ncs.gov.in")
                
                # Build search URL
                params = {
                    'location': location,
                    'skill': skill,
                    'page': page
                }
                
                url = f"{self.BASE_URL}{self.JOBS_ENDPOINT}"
                
                # Fetch with retry logic
                response = self._fetch_with_retry(url, params)
                
                if not response:
                    logger.warning(f"Failed to fetch page {page}")
                    continue
                
                # Parse jobs
                page_jobs = self._parse_jobs_page(response.text, url)
                jobs.extend(page_jobs)
                
                logger.info(f"Scraped {len(page_jobs)} jobs from page {page}")
                
                # Check if last page
                if len(page_jobs) == 0:
                    break
                    
            except Exception as e:
                logger.error(f"Error scraping page {page}: {e}")
                continue
        
        return jobs
    
    def _fetch_with_retry(self, url, params=None, max_retries=3):
        """Fetch URL with exponential backoff retry"""
        for attempt in range(max_retries):
            try:
                response = self.session.get(
                    url,
                    params=params,
                    timeout=30
                )
                response.raise_for_status()
                return response
            except requests.RequestException as e:
                logger.warning(f"Request failed (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    ExponentialBackoff.wait(attempt)
                else:
                    logger.error(f"Max retries reached for {url}")
                    return None
    
    def _parse_jobs_page(self, html, source_url):
        """Parse jobs from HTML page"""
        jobs = []
        soup = BeautifulSoup(html, 'lxml')
        
        # Find job listings (adjust selectors based on actual HTML structure)
        job_cards = soup.find_all('div', class_='job-card')  # Example selector
        
        for card in job_cards:
            try:
                job = self._extract_job_data(card, source_url)
                if job:
                    jobs.append(job)
            except Exception as e:
                logger.error(f"Error parsing job card: {e}")
                continue
        
        return jobs
    
    def _extract_job_data(self, card, source_url):
        """Extract job data from card element"""
        try:
            # Extract fields (adjust selectors based on actual HTML)
            title = card.find('h3', class_='job-title')
            company = card.find('span', class_='company-name')
            location = card.find('span', class_='location')
            description = card.find('div', class_='description')
            posted_date = card.find('span', class_='posted-date')
            
            # Build job object
            job_data = {
                'title': title.text.strip() if title else '',
                'company': company.text.strip() if company else '',
                'location': location.text.strip() if location else '',
                'description': description.text.strip() if description else '',
                'posted_date': self._parse_date(posted_date.text if posted_date else ''),
                'source': 'NCS Portal',
                'source_url': source_url,
                'scraped_at': datetime.utcnow().isoformat()
            }
            
            # Generate unique job ID
            job_data['job_id'] = self._generate_job_id(job_data)
            
            return job_data
            
        except Exception as e:
            logger.error(f"Error extracting job data: {e}")
            return None
    
    def _generate_job_id(self, job_data):
        """Generate unique job ID from job data"""
        unique_string = f"{job_data['title']}{job_data['company']}{job_data['location']}"
        return hashlib.md5(unique_string.encode()).hexdigest()
    
    def _parse_date(self, date_str):
        """Parse date string to ISO format"""
        try:
            # Implement date parsing logic based on actual format
            # Example: "2 days ago" -> calculate date
            return datetime.utcnow().isoformat()
        except:
            return datetime.utcnow().isoformat()

# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    scraper = NCSPortalScraper()
    jobs = scraper.scrape_jobs(location="Bangalore", skill="Python", max_pages=2)
    
    print(f"Scraped {len(jobs)} jobs")
    print(json.dumps(jobs[:2], indent=2))  # Print first 2 jobs
