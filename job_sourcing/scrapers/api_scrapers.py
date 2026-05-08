"""
Job Aggregator API Scrapers
Sources: Jooble, Adzuna (licensed APIs)
Legal: Official API usage with proper authentication
"""
import requests
import logging
from datetime import datetime
import hashlib
import os
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class JoobleAPIScraper:
    """
    Jooble API Scraper
    API Docs: https://jooble.org/api/about
    Requires: API key (free tier available)
    """
    
    API_URL = "https://jooble.org/api/{api_key}"
    
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('JOOBLE_API_KEY')
        if not self.api_key:
            raise ValueError("Jooble API key required")
        
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })
    
    def search_jobs(self, keywords, location="India", page=1):
        """
        Search jobs via Jooble API
        
        Args:
            keywords (str): Job keywords
            location (str): Location
            page (int): Page number
            
        Returns:
            list: Job listings
        """
        jobs = []
        
        try:
            url = self.API_URL.format(api_key=self.api_key)
            
            payload = {
                "keywords": keywords,
                "location": location,
                "page": str(page)
            }
            
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            for job in data.get('jobs', []):
                parsed_job = {
                    'job_id': hashlib.md5(job.get('link', '').encode()).hexdigest(),
                    'title': job.get('title', ''),
                    'company': job.get('company', ''),
                    'location': job.get('location', ''),
                    'description': job.get('snippet', ''),
                    'requirements': [],
                    'salary_range': job.get('salary', ''),
                    'posted_date': job.get('updated', datetime.utcnow().isoformat()),
                    'source': 'Jooble',
                    'source_url': job.get('link', ''),
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Fetched {len(jobs)} jobs from Jooble API")
            
        except requests.RequestException as e:
            logger.error(f"Jooble API error: {e}")
        except Exception as e:
            logger.error(f"Error parsing Jooble response: {e}")
        
        return jobs


class AdzunaAPIScraper:
    """
    Adzuna API Scraper
    API Docs: https://developer.adzuna.com/
    Requires: App ID and App Key (free tier available)
    """
    
    API_URL = "https://api.adzuna.com/v1/api/jobs/{country}/search/{page}"
    
    def __init__(self, app_id=None, app_key=None):
        self.app_id = app_id or os.getenv('ADZUNA_APP_ID')
        self.app_key = app_key or os.getenv('ADZUNA_APP_KEY')
        
        if not self.app_id or not self.app_key:
            raise ValueError("Adzuna App ID and Key required")
        
        self.session = requests.Session()
    
    def search_jobs(self, what="", where="India", country="in", page=1, results_per_page=50):
        """
        Search jobs via Adzuna API
        
        Args:
            what (str): Job title/keywords
            where (str): Location
            country (str): Country code (in=India)
            page (int): Page number
            results_per_page (int): Results per page (max 50)
            
        Returns:
            list: Job listings
        """
        jobs = []
        
        try:
            url = self.API_URL.format(country=country, page=page)
            
            params = {
                'app_id': self.app_id,
                'app_key': self.app_key,
                'what': what,
                'where': where,
                'results_per_page': results_per_page,
                'content-type': 'application/json'
            }
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            for job in data.get('results', []):
                # Extract salary info
                salary_min = job.get('salary_min')
                salary_max = job.get('salary_max')
                salary_range = ''
                if salary_min and salary_max:
                    salary_range = f"₹{salary_min:,.0f} - ₹{salary_max:,.0f}"
                
                parsed_job = {
                    'job_id': hashlib.md5(job.get('id', '').encode()).hexdigest(),
                    'title': job.get('title', ''),
                    'company': job.get('company', {}).get('display_name', ''),
                    'location': job.get('location', {}).get('display_name', ''),
                    'description': job.get('description', ''),
                    'requirements': [],
                    'salary_range': salary_range,
                    'posted_date': job.get('created', datetime.utcnow().isoformat()),
                    'source': 'Adzuna',
                    'source_url': job.get('redirect_url', ''),
                    'contract_type': job.get('contract_type', ''),
                    'category': job.get('category', {}).get('label', ''),
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Fetched {len(jobs)} jobs from Adzuna API")
            
        except requests.RequestException as e:
            logger.error(f"Adzuna API error: {e}")
        except Exception as e:
            logger.error(f"Error parsing Adzuna response: {e}")
        
        return jobs


class IndeedPublisherAPI:
    """
    Indeed Publisher API
    API Docs: https://www.indeed.com/publisher
    Requires: Publisher ID (requires approval)
    """
    
    API_URL = "http://api.indeed.com/ads/apisearch"
    
    def __init__(self, publisher_id=None):
        self.publisher_id = publisher_id or os.getenv('INDEED_PUBLISHER_ID')
        if not self.publisher_id:
            raise ValueError("Indeed Publisher ID required")
        
        self.session = requests.Session()
    
    def search_jobs(self, query="", location="India", start=0, limit=25):
        """
        Search jobs via Indeed Publisher API
        
        Args:
            query (str): Job query
            location (str): Location
            start (int): Start position
            limit (int): Number of results (max 25)
            
        Returns:
            list: Job listings
        """
        jobs = []
        
        try:
            params = {
                'publisher': self.publisher_id,
                'q': query,
                'l': location,
                'start': start,
                'limit': limit,
                'format': 'json',
                'v': '2',
                'userip': '1.2.3.4',  # Required by API
                'useragent': 'NexusHR-JobBot/1.0'
            }
            
            response = self.session.get(self.API_URL, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            for job in data.get('results', []):
                parsed_job = {
                    'job_id': hashlib.md5(job.get('jobkey', '').encode()).hexdigest(),
                    'title': job.get('jobtitle', ''),
                    'company': job.get('company', ''),
                    'location': f"{job.get('city', '')}, {job.get('state', '')}".strip(', '),
                    'description': job.get('snippet', ''),
                    'requirements': [],
                    'posted_date': job.get('date', datetime.utcnow().isoformat()),
                    'source': 'Indeed',
                    'source_url': job.get('url', ''),
                    'scraped_at': datetime.utcnow().isoformat()
                }
                jobs.append(parsed_job)
            
            logger.info(f"Fetched {len(jobs)} jobs from Indeed API")
            
        except requests.RequestException as e:
            logger.error(f"Indeed API error: {e}")
        except Exception as e:
            logger.error(f"Error parsing Indeed response: {e}")
        
        return jobs


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Jooble example (if API key available)
    try:
        jooble = JoobleAPIScraper()
        jobs = jooble.search_jobs("Python Developer", "Bangalore")
        print(f"Jooble: {len(jobs)} jobs")
    except ValueError as e:
        print(f"Jooble: {e}")
    
    # Adzuna example (if credentials available)
    try:
        adzuna = AdzunaAPIScraper()
        jobs = adzuna.search_jobs("Software Engineer", "Mumbai")
        print(f"Adzuna: {len(jobs)} jobs")
    except ValueError as e:
        print(f"Adzuna: {e}")
