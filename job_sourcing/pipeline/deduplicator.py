"""
Job Deduplication System
Detects and removes duplicate job listings
"""
import hashlib
import logging
from typing import List, Dict, Any
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

class JobDeduplicator:
    """Deduplicates job listings using multiple strategies"""
    
    def __init__(self, similarity_threshold=0.85):
        """
        Args:
            similarity_threshold (float): Threshold for fuzzy matching (0-1)
        """
        self.similarity_threshold = similarity_threshold
        self.seen_hashes = set()
        self.seen_jobs = []
    
    def deduplicate(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate jobs from list
        
        Args:
            jobs (list): List of job dictionaries
            
        Returns:
            list: Deduplicated jobs
        """
        unique_jobs = []
        
        for job in jobs:
            if not self.is_duplicate(job):
                unique_jobs.append(job)
                self.add_to_seen(job)
        
        logger.info(f"Deduplication: {len(jobs)} -> {len(unique_jobs)} jobs")
        return unique_jobs
    
    def is_duplicate(self, job: Dict[str, Any]) -> bool:
        """
        Check if job is a duplicate
        
        Args:
            job (dict): Job data
            
        Returns:
            bool: True if duplicate
        """
        # Strategy 1: Exact hash match
        job_hash = self._generate_hash(job)
        if job_hash in self.seen_hashes:
            logger.debug(f"Duplicate (hash): {job.get('title')} at {job.get('company')}")
            return True
        
        # Strategy 2: Fuzzy matching
        for seen_job in self.seen_jobs:
            if self._is_similar(job, seen_job):
                logger.debug(f"Duplicate (fuzzy): {job.get('title')} at {job.get('company')}")
                return True
        
        return False
    
    def add_to_seen(self, job: Dict[str, Any]):
        """Add job to seen set"""
        job_hash = self._generate_hash(job)
        self.seen_hashes.add(job_hash)
        self.seen_jobs.append(job)
    
    def _generate_hash(self, job: Dict[str, Any]) -> str:
        """Generate unique hash for job"""
        # Use title + company + location for hash
        unique_str = f"{job.get('title', '')}{job.get('company', '')}{job.get('location', '')}"
        unique_str = unique_str.lower().strip()
        return hashlib.md5(unique_str.encode()).hexdigest()
    
    def _is_similar(self, job1: Dict[str, Any], job2: Dict[str, Any]) -> bool:
        """
        Check if two jobs are similar using fuzzy matching
        
        Args:
            job1 (dict): First job
            job2 (dict): Second job
            
        Returns:
            bool: True if similar
        """
        # Compare titles
        title_similarity = self._string_similarity(
            job1.get('title', ''),
            job2.get('title', '')
        )
        
        # Compare companies
        company_similarity = self._string_similarity(
            job1.get('company', ''),
            job2.get('company', '')
        )
        
        # Compare locations
        location_similarity = self._string_similarity(
            job1.get('location', ''),
            job2.get('location', '')
        )
        
        # If title and company are very similar, and location matches, it's a duplicate
        if (title_similarity > self.similarity_threshold and
            company_similarity > self.similarity_threshold and
            location_similarity > 0.7):
            return True
        
        return False
    
    def _string_similarity(self, str1: str, str2: str) -> float:
        """
        Calculate similarity between two strings
        
        Args:
            str1 (str): First string
            str2 (str): Second string
            
        Returns:
            float: Similarity score (0-1)
        """
        str1 = str1.lower().strip()
        str2 = str2.lower().strip()
        
        if not str1 or not str2:
            return 0.0
        
        return SequenceMatcher(None, str1, str2).ratio()
    
    def reset(self):
        """Reset seen jobs (for new scraping session)"""
        self.seen_hashes.clear()
        self.seen_jobs.clear()
        logger.info("Deduplicator reset")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    deduplicator = JobDeduplicator()
    
    jobs = [
        {
            'title': 'Senior Python Developer',
            'company': 'TCS',
            'location': 'Bangalore',
            'description': 'Python job...'
        },
        {
            'title': 'Senior Python Developer',
            'company': 'TCS',
            'location': 'Bangalore',
            'description': 'Different description...'
        },
        {
            'title': 'Sr. Python Developer',  # Similar title
            'company': 'TCS',
            'location': 'Bangalore',
            'description': 'Another description...'
        },
        {
            'title': 'Java Developer',
            'company': 'Infosys',
            'location': 'Mumbai',
            'description': 'Java job...'
        }
    ]
    
    unique_jobs = deduplicator.deduplicate(jobs)
    print(f"Original: {len(jobs)} jobs")
    print(f"Unique: {len(unique_jobs)} jobs")
    
    for job in unique_jobs:
        print(f"- {job['title']} at {job['company']}")
