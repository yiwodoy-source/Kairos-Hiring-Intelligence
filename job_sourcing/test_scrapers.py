"""
Test Suite for Job Sourcing Engine
Run with: python test_scrapers.py
"""
import sys
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_robots_checker():
    """Test robots.txt checker"""
    logger.info("Testing robots.txt checker...")
    from utils.robots_checker import RobotsChecker
    
    checker = RobotsChecker()
    
    # Test allowed URL
    allowed = checker.can_fetch("https://www.ncs.gov.in/")
    logger.info(f"NCS Portal allowed: {allowed}")
    
    # Test blocked URL (example)
    blocked = checker.can_fetch("https://www.linkedin.com/jobs/")
    logger.info(f"LinkedIn allowed: {blocked}")
    
    return True

def test_rate_limiter():
    """Test rate limiter"""
    logger.info("Testing rate limiter...")
    from utils.rate_limiter import RateLimiter
    import time
    
    limiter = RateLimiter(max_requests_per_second=2)
    
    start = time.time()
    for i in range(3):
        limiter.wait_if_needed("test.com")
        logger.info(f"Request {i+1}")
    elapsed = time.time() - start
    
    logger.info(f"3 requests took {elapsed:.2f}s (expected ~1.0s)")
    return elapsed >= 1.0

def test_normalizer():
    """Test job normalizer"""
    logger.info("Testing normalizer...")
    from pipeline.normalizer import JobNormalizer
    
    normalizer = JobNormalizer()
    
    test_job = {
        'job_id': 'test123',
        'title': '  senior   PYTHON developer  ',
        'company': 'Tech Company Pvt. Ltd.',
        'location': 'bengaluru',
        'description': '<p>Python developer with <b>AWS</b> experience. Requirements: Python, Django.</p>',
        'salary_range': '15,00,000 - 20,00,000',
        'posted_date': '2024-12-01T10:00:00Z',
        'source': 'Test'
    }
    
    normalized = normalizer.normalize(test_job)
    
    assert normalized['title'] == 'Senior Python Developer', f"Title normalization failed: {normalized['title']}"
    assert normalized['location'] == 'Bangalore', f"Location normalization failed: {normalized['location']}"
    assert 'AWS' in normalized['skills'], f"Skills extraction failed: {normalized['skills']}"
    
    logger.info("✓ Normalizer working correctly")
    return True

def test_deduplicator():
    """Test deduplicator"""
    logger.info("Testing deduplicator...")
    from pipeline.deduplicator import JobDeduplicator
    
    deduplicator = JobDeduplicator()
    
    jobs = [
        {
            'title': 'Python Developer',
            'company': 'TCS',
            'location': 'Bangalore'
        },
        {
            'title': 'Python Developer',
            'company': 'TCS',
            'location': 'Bangalore'
        },
        {
            'title': 'Java Developer',
            'company': 'Infosys',
            'location': 'Mumbai'
        }
    ]
    
    unique = deduplicator.deduplicate(jobs)
    
    assert len(unique) == 2, f"Deduplication failed: expected 2, got {len(unique)}"
    
    logger.info("✓ Deduplicator working correctly")
    return True

def test_greenhouse_scraper():
    """Test Greenhouse scraper"""
    logger.info("Testing Greenhouse scraper...")
    from scrapers.ats_scrapers import GreenhouseScraper
    
    try:
        scraper = GreenhouseScraper("https://boards.greenhouse.io/gitlab")
        jobs = scraper.scrape_jobs()
        
        if jobs:
            logger.info(f"✓ Greenhouse: Scraped {len(jobs)} jobs")
            logger.info(f"  Sample: {jobs[0]['title']} at {jobs[0]['company']}")
            return True
        else:
            logger.warning("⚠ Greenhouse: No jobs found (might be blocked or empty)")
            return False
    except Exception as e:
        logger.error(f"✗ Greenhouse scraper failed: {e}")
        return False

def test_lever_scraper():
    """Test Lever scraper"""
    logger.info("Testing Lever scraper...")
    from scrapers.ats_scrapers import LeverScraper
    
    try:
        scraper = LeverScraper("netflix")
        jobs = scraper.scrape_jobs()
        
        if jobs:
            logger.info(f"✓ Lever: Scraped {len(jobs)} jobs")
            logger.info(f"  Sample: {jobs[0]['title']} at {jobs[0]['company']}")
            return True
        else:
            logger.warning("⚠ Lever: No jobs found")
            return False
    except Exception as e:
        logger.error(f"✗ Lever scraper failed: {e}")
        return False

def test_database():
    """Test database connection and models"""
    logger.info("Testing database...")
    from storage.db_models import init_db, SessionLocal, Job
    
    try:
        # Initialize database
        init_db()
        logger.info("✓ Database initialized")
        
        # Test insert
        db = SessionLocal()
        test_job = Job(
            job_id=f'test_{datetime.now().timestamp()}',
            title='Test Job',
            company='Test Company',
            location='Test Location',
            description='Test description',
            source='Test',
            posted_date=datetime.utcnow()
        )
        db.add(test_job)
        db.commit()
        
        # Test query
        count = db.query(Job).count()
        logger.info(f"✓ Database working: {count} jobs in database")
        
        db.close()
        return True
        
    except Exception as e:
        logger.error(f"✗ Database test failed: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    logger.info("=" * 80)
    logger.info("Job Sourcing Engine - Test Suite")
    logger.info("=" * 80)
    
    tests = [
        ("Robots Checker", test_robots_checker),
        ("Rate Limiter", test_rate_limiter),
        ("Normalizer", test_normalizer),
        ("Deduplicator", test_deduplicator),
        ("Greenhouse Scraper", test_greenhouse_scraper),
        ("Lever Scraper", test_lever_scraper),
        ("Database", test_database)
    ]
    
    results = []
    
    for name, test_func in tests:
        logger.info(f"\n--- Testing: {name} ---")
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            logger.error(f"Test {name} crashed: {e}")
            results.append((name, False))
    
    # Summary
    logger.info("\n" + "=" * 80)
    logger.info("Test Results Summary")
    logger.info("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"{status}: {name}")
    
    logger.info("=" * 80)
    logger.info(f"Total: {passed}/{total} tests passed")
    logger.info("=" * 80)
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
