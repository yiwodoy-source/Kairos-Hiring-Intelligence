"""
Integration with NexusHR Backend
Syncs scraped jobs to main application database
"""
import requests
import logging
from typing import List, Dict, Any
from storage.db_models import SessionLocal, Job
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class NexusHRIntegration:
    """Integrates job sourcing with NexusHR backend"""
    
    def __init__(self, nexus_api_url="http://localhost:3001/api"):
        self.api_url = nexus_api_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })
    
    def sync_jobs_to_nexus(self, limit=100):
        """
        Sync recent jobs to NexusHR backend
        
        Args:
            limit (int): Number of recent jobs to sync
            
        Returns:
            int: Number of jobs synced
        """
        db = SessionLocal()
        synced_count = 0
        
        try:
            # Get recent jobs (last 7 days)
            cutoff_date = datetime.utcnow() - timedelta(days=7)
            recent_jobs = db.query(Job)\
                .filter(Job.scraped_at >= cutoff_date)\
                .order_by(Job.scraped_at.desc())\
                .limit(limit)\
                .all()
            
            logger.info(f"Syncing {len(recent_jobs)} jobs to NexusHR...")
            
            for job in recent_jobs:
                try:
                    # Convert to NexusHR format
                    nexus_job = self._convert_to_nexus_format(job)
                    
                    # Send to NexusHR API
                    response = self.session.post(
                        f"{self.api_url}/jobs/import",
                        json=nexus_job,
                        timeout=10
                    )
                    
                    if response.status_code in [200, 201]:
                        synced_count += 1
                        logger.debug(f"Synced job: {job.job_id}")
                    else:
                        logger.warning(f"Failed to sync job {job.job_id}: {response.status_code}")
                        
                except Exception as e:
                    logger.error(f"Error syncing job {job.job_id}: {e}")
                    continue
            
            logger.info(f"Successfully synced {synced_count}/{len(recent_jobs)} jobs")
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
        finally:
            db.close()
        
        return synced_count
    
    def _convert_to_nexus_format(self, job: Job) -> Dict[str, Any]:
        """Convert job to NexusHR format"""
        return {
            'externalId': job.job_id,
            'title': job.title,
            'company': job.company,
            'location': job.location,
            'description': job.description,
            'requirements': job.requirements or [],
            'skills': job.skills or [],
            'salaryRange': job.salary_range,
            'postedDate': job.posted_date.isoformat() if job.posted_date else None,
            'source': job.source,
            'sourceUrl': job.source_url,
            'status': 'Open',
            'type': job.contract_type or 'Full-time',
            'category': job.category or 'Technology'
        }
    
    def get_job_stats(self):
        """Get statistics from job database"""
        db = SessionLocal()
        
        try:
            total_jobs = db.query(Job).count()
            
            # Jobs by source
            from sqlalchemy import func
            by_source = db.query(
                Job.source,
                func.count(Job.job_id).label('count')
            ).group_by(Job.source).all()
            
            # Recent jobs (last 24 hours)
            cutoff = datetime.utcnow() - timedelta(hours=24)
            recent_count = db.query(Job).filter(Job.scraped_at >= cutoff).count()
            
            stats = {
                'total_jobs': total_jobs,
                'recent_24h': recent_count,
                'by_source': {source: count for source, count in by_source}
            }
            
            return stats
            
        finally:
            db.close()


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    integration = NexusHRIntegration()
    
    # Get stats
    stats = integration.get_job_stats()
    print("Job Database Stats:")
    print(f"Total jobs: {stats['total_jobs']}")
    print(f"Recent (24h): {stats['recent_24h']}")
    print(f"By source: {stats['by_source']}")
    
    # Sync to NexusHR
    synced = integration.sync_jobs_to_nexus(limit=50)
    print(f"\nSynced {synced} jobs to NexusHR")
