"""
ATS (Applicant Tracking System) Public Feed Scrapers
Sources: Greenhouse, Lever, Workday public job boards
Legal: Public JSON/XML feeds, explicitly allowed
"""
import requests
import logging
from datetime import datetime
import hashlib
import json
from urllib.parse import urljoin

from utils.robots_checker import robots_checker
from utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

class GreenhouseScraper:
    """
    Scraper for Greenhouse public job boards
    Example: https://boards.greenhouse.io/company_name
    """
    
    def __init__(self, company_board_url):
        """
        Args:
            company_board_url (str): Company's Greenhouse board URL
        """
        self.board_url = company_board_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'NexusHR-JobBot/1.0',
            'Accept': 'application/json'
        })
    
    def scrape_jobs(self):
        """Scrape jobs from Greenhouse board"""
        jobs = []
        
        # Greenhouse provides JSON endpoint
        api_url = f"{self.board_url}.json"
        
        if not robots_checker.can_fetch(api_url):
            logger.error(f"Blocked by robots.txt: {api_url}")
            return jobs
        
        try:
            rate_limiter.wait_if_needed("greenhouse.io")
            
            response = self.session.get(api_url, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Parse jobs from response
            for job in data.get('jobs', []):
                parsed_job = {
                    'job_id': hashlib.md5(str(job.get('id')).encode()).hexdigest(),
                    'title': job.get('title', ''),
                    'company': self._extract_company_name(self.board_url),
                    'location': job.get('location', {}).get('name', ''),
                    'description': job.get('content', ''),
                    'requirements': [],  # Parse from description if needed
                    'posted_date': job.get('updated_at', datetime.utcnow().isoformat()),
                    'source': 'Greenhouse',
                    'source_url': job.get('absolute_url', ''),
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Scraped {len(jobs)} jobs from Greenhouse")
            
        except Exception as e:
            logger.error(f"Error scraping Greenhouse: {e}")
        
        return jobs
    
    def _extract_company_name(self, url):
        """Extract company name from board URL"""
        # Example: https://boards.greenhouse.io/company -> company
        return url.rstrip('/').split('/')[-1].replace('-', ' ').title()


class LeverScraper:
    """
    Scraper for Lever public job boards
    Example: https://jobs.lever.co/company_name
    """
    
    def __init__(self, company_name):
        self.company_name = company_name
        self.api_url = f"https://api.lever.co/v0/postings/{company_name}"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'NexusHR-JobBot/1.0',
            'Accept': 'application/json'
        })
    
    def scrape_jobs(self):
        """Scrape jobs from Lever API"""
        jobs = []
        
        if not robots_checker.can_fetch(self.api_url):
            logger.error(f"Blocked by robots.txt: {self.api_url}")
            return jobs
        
        try:
            rate_limiter.wait_if_needed("lever.co")
            
            response = self.session.get(self.api_url, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            for job in data:
                parsed_job = {
                    'job_id': hashlib.md5(job.get('id', '').encode()).hexdigest(),
                    'title': job.get('text', ''),
                    'company': self.company_name.replace('-', ' ').title(),
                    'location': job.get('categories', {}).get('location', ''),
                    'description': job.get('description', ''),
                    'requirements': job.get('lists', []),
                    'posted_date': job.get('createdAt', datetime.utcnow().isoformat()),
                    'source': 'Lever',
                    'source_url': job.get('hostedUrl', ''),
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Scraped {len(jobs)} jobs from Lever")
            
        except Exception as e:
            logger.error(f"Error scraping Lever: {e}")
        
        return jobs


class WorkdayScraper:
    """
    Scraper for Workday public job boards
    Example: https://company.wd1.myworkdayjobs.com/en-US/Careers
    """
    
    def __init__(self, workday_url):
        self.workday_url = workday_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'NexusHR-JobBot/1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })
    
    def scrape_jobs(self, limit=100):
        """
        Scrape jobs from Workday
        Note: Workday uses GraphQL API
        """
        jobs = []
        
        # Workday GraphQL endpoint
        api_endpoint = f"{self.workday_url}/fs/graphql"
        
        if not robots_checker.can_fetch(api_endpoint):
            logger.error(f"Blocked by robots.txt: {api_endpoint}")
            return jobs
        
        try:
            rate_limiter.wait_if_needed("myworkdayjobs.com")
            
            # GraphQL query for jobs
            query = {
                "operationName": "searchJobs",
                "variables": {
                    "limit": limit,
                    "offset": 0
                },
                "query": """
                query searchJobs($limit: Int, $offset: Int) {
                  jobPostings(limit: $limit, offset: $offset) {
                    title
                    externalPath
                    postedOn
                    location {
                      city
                      country
                    }
                    jobRequisition {
                      jobDescription
                    }
                  }
                }
                """
            }
            
            response = self.session.post(api_endpoint, json=query, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            for job in data.get('data', {}).get('jobPostings', []):
                location = job.get('location', {})
                location_str = f"{location.get('city', '')}, {location.get('country', '')}"
                
                parsed_job = {
                    'job_id': hashlib.md5(job.get('externalPath', '').encode()).hexdigest(),
                    'title': job.get('title', ''),
                    'company': self._extract_company_name(self.workday_url),
                    'location': location_str.strip(', '),
                    'description': job.get('jobRequisition', {}).get('jobDescription', ''),
                    'requirements': [],
                    'posted_date': job.get('postedOn', datetime.utcnow().isoformat()),
                    'source': 'Workday',
                    'source_url': f"{self.workday_url}{job.get('externalPath', '')}",
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Scraped {len(jobs)} jobs from Workday")
            
        except Exception as e:
            logger.error(f"Error scraping Workday: {e}")
        
        return jobs
    
    def _extract_company_name(self, url):
        """Extract company name from Workday URL"""
        # Example: https://company.wd1.myworkdayjobs.com -> company
        return url.split('//')[1].split('.')[0].title()


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Greenhouse example
    gh_scraper = GreenhouseScraper("https://boards.greenhouse.io/airbnb")
    gh_jobs = gh_scraper.scrape_jobs()
    print(f"Greenhouse: {len(gh_jobs)} jobs")
    
    # Lever example
    lever_scraper = LeverScraper("netflix")
    lever_jobs = lever_scraper.scrape_jobs()
    print(f"Lever: {len(lever_jobs)} jobs")
    
    # Print sample
    if gh_jobs:
        print(json.dumps(gh_jobs[0], indent=2))
