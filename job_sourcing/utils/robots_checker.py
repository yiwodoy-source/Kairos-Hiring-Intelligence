"""
Robots.txt checker utility
Ensures compliance with website crawling policies
"""
import urllib.robotparser
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)

class RobotsChecker:
    def __init__(self, user_agent="NexusHR-JobBot/1.0"):
        self.user_agent = user_agent
        self.parsers = {}  # Cache robots.txt parsers
    
    def can_fetch(self, url):
        """
        Check if URL can be fetched according to robots.txt
        
        Args:
            url (str): URL to check
            
        Returns:
            bool: True if allowed, False otherwise
        """
        try:
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            robots_url = f"{base_url}/robots.txt"
            
            # Use cached parser if available
            if base_url not in self.parsers:
                rp = urllib.robotparser.RobotFileParser()
                rp.set_url(robots_url)
                try:
                    rp.read()
                    self.parsers[base_url] = rp
                except Exception as e:
                    logger.warning(f"Could not read robots.txt for {base_url}: {e}")
                    # If robots.txt is inaccessible, assume allowed
                    return True
            
            rp = self.parsers[base_url]
            allowed = rp.can_fetch(self.user_agent, url)
            
            if not allowed:
                logger.info(f"Blocked by robots.txt: {url}")
            
            return allowed
            
        except Exception as e:
            logger.error(f"Error checking robots.txt for {url}: {e}")
            # On error, be conservative and disallow
            return False
    
    def get_crawl_delay(self, url):
        """Get crawl delay from robots.txt"""
        try:
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            
            if base_url in self.parsers:
                rp = self.parsers[base_url]
                delay = rp.crawl_delay(self.user_agent)
                return delay if delay else 1.0  # Default 1 second
            return 1.0
        except:
            return 1.0

# Global instance
robots_checker = RobotsChecker()
