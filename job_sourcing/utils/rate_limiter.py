"""
Rate limiter with exponential backoff
Prevents overwhelming target servers
"""
import time
import logging
from collections import defaultdict
from threading import Lock

logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self, max_requests_per_second=1):
        self.max_requests_per_second = max_requests_per_second
        self.min_interval = 1.0 / max_requests_per_second
        self.last_request_time = defaultdict(float)
        self.lock = Lock()
    
    def wait_if_needed(self, domain):
        """
        Wait if necessary to respect rate limit for domain
        
        Args:
            domain (str): Domain name
        """
        with self.lock:
            now = time.time()
            last_time = self.last_request_time[domain]
            time_since_last = now - last_time
            
            if time_since_last < self.min_interval:
                sleep_time = self.min_interval - time_since_last
                logger.debug(f"Rate limiting {domain}: sleeping {sleep_time:.2f}s")
                time.sleep(sleep_time)
            
            self.last_request_time[domain] = time.time()

class ExponentialBackoff:
    """Exponential backoff for retries"""
    
    @staticmethod
    def wait(attempt, base_delay=1, max_delay=60):
        """
        Calculate wait time with exponential backoff
        
        Args:
            attempt (int): Retry attempt number (0-indexed)
            base_delay (float): Base delay in seconds
            max_delay (float): Maximum delay in seconds
            
        Returns:
            float: Wait time in seconds
        """
        delay = min(base_delay * (2 ** attempt), max_delay)
        logger.info(f"Retry attempt {attempt + 1}: waiting {delay}s")
        time.sleep(delay)
        return delay

# Global rate limiter
rate_limiter = RateLimiter(max_requests_per_second=1)
