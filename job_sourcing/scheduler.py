"""
Cron-based Scheduler for Job Scrapers
Runs scrapers at specified intervals with retry logic
"""
import logging
import sys
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import os
from dotenv import load_dotenv

from run_scrapers import JobScraperOrchestrator
from storage.db_models import SessionLocal, ScraperRun, init_db

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scheduler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class ScraperScheduler:
    """Scheduler for running scrapers at intervals"""
    
    def __init__(self):
        self.scheduler = BlockingScheduler()
        self.db = SessionLocal()
    
    def scheduled_scrape_job(self):
        """Job function to run scrapers"""
        run_id = None
        
        try:
            # Create scraper run record
            run = ScraperRun(
                scraper_name='all_scrapers',
                started_at=datetime.utcnow(),
                status='running'
            )
            self.db.add(run)
            self.db.commit()
            run_id = run.id
            
            logger.info(f"Starting scheduled scrape (run_id: {run_id})")
            
            # Run scrapers
            orchestrator = JobScraperOrchestrator()
            jobs_stored = orchestrator.run_all_scrapers()
            orchestrator.cleanup()
            
            # Update run record
            run.completed_at = datetime.utcnow()
            run.status = 'completed'
            run.jobs_stored = jobs_stored
            self.db.commit()
            
            logger.info(f"Scheduled scrape completed (run_id: {run_id}): {jobs_stored} jobs stored")
            
        except Exception as e:
            logger.error(f"Scheduled scrape failed (run_id: {run_id}): {e}")
            
            # Update run record with error
            if run_id:
                run = self.db.query(ScraperRun).filter(ScraperRun.id == run_id).first()
                if run:
                    run.completed_at = datetime.utcnow()
                    run.status = 'failed'
                    run.error_message = str(e)
                    self.db.commit()
    
    def start(self):
        """Start the scheduler"""
        # Get schedule from environment (default: every 6 hours)
        schedule_hours = int(os.getenv('SCRAPER_SCHEDULE_HOURS', 6))
        
        logger.info("=" * 80)
        logger.info("Job Scraper Scheduler Starting")
        logger.info(f"Schedule: Every {schedule_hours} hours")
        logger.info("=" * 80)
        
        # Add job with interval trigger
        self.scheduler.add_job(
            self.scheduled_scrape_job,
            trigger=IntervalTrigger(hours=schedule_hours),
            id='scraper_job',
            name='Run All Job Scrapers',
            replace_existing=True,
            max_instances=1  # Prevent overlapping runs
        )
        
        # Alternative: Cron-based schedule (uncomment to use)
        # Run every day at 2 AM and 2 PM
        # self.scheduler.add_job(
        #     self.scheduled_scrape_job,
        #     trigger=CronTrigger(hour='2,14', minute=0),
        #     id='scraper_job',
        #     name='Run All Job Scrapers',
        #     replace_existing=True
        # )
        
        # Run immediately on start (optional)
        logger.info("Running initial scrape...")
        self.scheduled_scrape_job()
        
        # Start scheduler
        try:
            logger.info("Scheduler started. Press Ctrl+C to exit.")
            self.scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Scheduler stopped by user")
            self.scheduler.shutdown()
            self.db.close()


def main():
    """Main entry point"""
    # Initialize database
    init_db()
    
    # Start scheduler
    scheduler = ScraperScheduler()
    scheduler.start()


if __name__ == "__main__":
    main()
