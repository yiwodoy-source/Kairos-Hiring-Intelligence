"""
Main Scraper Runner
Orchestrates all scrapers and ETL pipeline
"""
import logging
import sys
from datetime import datetime
from typing import List, Dict, Any

# Scrapers
from scrapers.ncs_scraper import NCSPortalScraper
from scrapers.ats_scrapers import GreenhouseScraper, LeverScraper
from scrapers.api_scrapers import JoobleAPIScraper, AdzunaAPIScraper

# Pipeline
from pipeline.normalizer import JobNormalizer
from pipeline.deduplicator import JobDeduplicator

# Storage
from storage.db_models import SessionLocal, Job, ScraperRun, init_db

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scraper.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class JobScraperOrchestrator:
    """Orchestrates job scraping from multiple sources"""
    
    def __init__(self):
        self.normalizer = JobNormalizer()
        self.deduplicator = JobDeduplicator()
        self.db = SessionLocal()
    
    def run_all_scrapers(self):
        """Run all configured scrapers"""
        logger.info("=" * 80)
        logger.info("Starting job scraping session")
        logger.info("=" * 80)
        
        all_jobs = []
        
        # 1. NCS Portal
        logger.info("Running NCS Portal scraper...")
        try:
            ncs_scraper = NCSPortalScraper()
            ncs_jobs = ncs_scraper.scrape_jobs(location="Bangalore", skill="Python", max_pages=2)
            all_jobs.extend(ncs_jobs)
            logger.info(f"NCS: Scraped {len(ncs_jobs)} jobs")
        except Exception as e:
            logger.error(f"NCS scraper failed: {e}")
        
        # 2. Greenhouse (example companies)
        logger.info("Running Greenhouse scrapers...")
        greenhouse_companies = [
            "https://boards.greenhouse.io/airbnb",
            "https://boards.greenhouse.io/gitlab"
        ]
        for company_url in greenhouse_companies:
            try:
                gh_scraper = GreenhouseScraper(company_url)
                gh_jobs = gh_scraper.scrape_jobs()
                all_jobs.extend(gh_jobs)
                logger.info(f"Greenhouse ({company_url}): {len(gh_jobs)} jobs")
            except Exception as e:
                logger.error(f"Greenhouse scraper failed for {company_url}: {e}")
        
        # 3. Lever (example companies)
        logger.info("Running Lever scrapers...")
        lever_companies = ["netflix", "shopify"]
        for company in lever_companies:
            try:
                lever_scraper = LeverScraper(company)
                lever_jobs = lever_scraper.scrape_jobs()
                all_jobs.extend(lever_jobs)
                logger.info(f"Lever ({company}): {len(lever_jobs)} jobs")
            except Exception as e:
                logger.error(f"Lever scraper failed for {company}: {e}")
        
        # 4. Jooble API
        logger.info("Running Jooble API scraper...")
        try:
            jooble_scraper = JoobleAPIScraper()
            jooble_jobs = jooble_scraper.search_jobs("Software Engineer", "India")
            all_jobs.extend(jooble_jobs)
            logger.info(f"Jooble: {len(jooble_jobs)} jobs")
        except Exception as e:
            logger.error(f"Jooble scraper failed: {e}")
        
        # 5. Adzuna API
        logger.info("Running Adzuna API scraper...")
        try:
            adzuna_scraper = AdzunaAPIScraper()
            adzuna_jobs = adzuna_scraper.search_jobs("Python Developer", "Bangalore")
            all_jobs.extend(adzuna_jobs)
            logger.info(f"Adzuna: {len(adzuna_jobs)} jobs")
        except Exception as e:
            logger.error(f"Adzuna scraper failed: {e}")
        
        logger.info(f"Total jobs scraped: {len(all_jobs)}")
        
        # ETL Pipeline
        logger.info("Running ETL pipeline...")
        processed_jobs = self.process_jobs(all_jobs)
        
        # Store in database
        logger.info("Storing jobs in database...")
        stored_count = self.store_jobs(processed_jobs)
        
        logger.info("=" * 80)
        logger.info(f"Scraping session completed: {stored_count} jobs stored")
        logger.info("=" * 80)
        
        return stored_count
    
    def process_jobs(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process jobs through ETL pipeline"""
        # 1. Normalize
        logger.info("Normalizing jobs...")
        normalized_jobs = [self.normalizer.normalize(job) for job in jobs]
        
        # 2. Deduplicate
        logger.info("Deduplicating jobs...")
        unique_jobs = self.deduplicator.deduplicate(normalized_jobs)
        
        logger.info(f"ETL: {len(jobs)} -> {len(unique_jobs)} jobs")
        
        return unique_jobs
    
    def store_jobs(self, jobs: List[Dict[str, Any]]) -> int:
        """Store jobs in database"""
        stored_count = 0
        
        for job_data in jobs:
            try:
                # Check if job already exists
                existing = self.db.query(Job).filter(Job.job_id == job_data['job_id']).first()
                
                if existing:
                    # Update existing job
                    for key, value in job_data.items():
                        setattr(existing, key, value)
                    logger.debug(f"Updated job: {job_data['job_id']}")
                else:
                    # Create new job
                    job = Job(**job_data)
                    self.db.add(job)
                    logger.debug(f"Created job: {job_data['job_id']}")
                
                stored_count += 1
                
            except Exception as e:
                logger.error(f"Error storing job {job_data.get('job_id')}: {e}")
                continue
        
        # Commit all changes
        try:
            self.db.commit()
            logger.info(f"Successfully stored {stored_count} jobs")
        except Exception as e:
            logger.error(f"Database commit failed: {e}")
            self.db.rollback()
            stored_count = 0
        
        return stored_count
    
    def cleanup(self):
        """Cleanup resources"""
        self.db.close()


def main():
    """Main entry point"""
    # Initialize database
    init_db()
    
    # Run scrapers
    orchestrator = JobScraperOrchestrator()
    
    try:
        jobs_stored = orchestrator.run_all_scrapers()
        logger.info(f"SUCCESS: {jobs_stored} jobs stored")
        return 0
    except Exception as e:
        logger.error(f"FAILED: {e}")
        return 1
    finally:
        orchestrator.cleanup()


if __name__ == "__main__":
    sys.exit(main())
