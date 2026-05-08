"""
Data Normalization Pipeline
Standardizes job data from different sources
"""
import re
import logging
from datetime import datetime
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class JobNormalizer:
    """Normalizes job data from various sources"""
    
    # Standard location mappings
    LOCATION_MAPPINGS = {
        'bengaluru': 'Bangalore',
        'mumbai': 'Mumbai',
        'delhi': 'New Delhi',
        'chennai': 'Chennai',
        'hyderabad': 'Hyderabad',
        'pune': 'Pune',
        'kolkata': 'Kolkata',
        'ahmedabad': 'Ahmedabad'
    }
    
    # Skill extraction patterns
    SKILL_PATTERNS = [
        r'\b(Python|Java|JavaScript|TypeScript|Go|Rust|C\+\+|C#|Ruby|PHP)\b',
        r'\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|\.NET)\b',
        r'\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|CI/CD)\b',
        r'\b(SQL|PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch)\b',
        r'\b(Machine Learning|AI|Data Science|Deep Learning|NLP)\b'
    ]
    
    def normalize(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize job data
        
        Args:
            job (dict): Raw job data
            
        Returns:
            dict: Normalized job data
        """
        try:
            normalized = {
                'job_id': job.get('job_id', ''),
                'title': self._normalize_title(job.get('title', '')),
                'company': self._normalize_company(job.get('company', '')),
                'location': self._normalize_location(job.get('location', '')),
                'description': self._clean_html(job.get('description', '')),
                'requirements': self._extract_requirements(job.get('description', '')),
                'skills': self._extract_skills(job.get('description', '')),
                'salary_range': self._normalize_salary(job.get('salary_range', '')),
                'posted_date': self._normalize_date(job.get('posted_date', '')),
                'source': job.get('source', ''),
                'source_url': job.get('source_url', ''),
                'scraped_at': job.get('scraped_at', datetime.utcnow().isoformat()),
                'normalized_at': datetime.utcnow().isoformat()
            }
            
            return normalized
            
        except Exception as e:
            logger.error(f"Error normalizing job: {e}")
            return job
    
    def _normalize_title(self, title: str) -> str:
        """Normalize job title"""
        # Remove extra whitespace
        title = ' '.join(title.split())
        # Title case
        title = title.title()
        return title
    
    def _normalize_company(self, company: str) -> str:
        """Normalize company name"""
        # Remove common suffixes
        company = re.sub(r'\s+(Pvt\.?|Ltd\.?|Limited|Inc\.?|Corp\.?)$', '', company, flags=re.IGNORECASE)
        company = ' '.join(company.split())
        return company.strip()
    
    def _normalize_location(self, location: str) -> str:
        """Normalize location"""
        location = location.lower().strip()
        
        # Check mappings
        for key, value in self.LOCATION_MAPPINGS.items():
            if key in location:
                return value
        
        # Title case if no mapping
        return location.title()
    
    def _clean_html(self, text: str) -> str:
        """Remove HTML tags and clean text"""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        # Remove extra whitespace
        text = ' '.join(text.split())
        # Decode HTML entities
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        return text.strip()
    
    def _extract_requirements(self, description: str) -> List[str]:
        """Extract job requirements from description"""
        requirements = []
        
        # Look for requirements section
        req_section = re.search(
            r'(?:requirements?|qualifications?|must have)[:\s]+(.*?)(?:responsibilities|benefits|$)',
            description,
            re.IGNORECASE | re.DOTALL
        )
        
        if req_section:
            text = req_section.group(1)
            # Split by bullets or newlines
            items = re.split(r'[•\n\r]+', text)
            requirements = [item.strip() for item in items if item.strip() and len(item.strip()) > 10]
        
        return requirements[:10]  # Limit to 10
    
    def _extract_skills(self, description: str) -> List[str]:
        """Extract technical skills from description"""
        skills = set()
        
        for pattern in self.SKILL_PATTERNS:
            matches = re.findall(pattern, description, re.IGNORECASE)
            skills.update(matches)
        
        return sorted(list(skills))
    
    def _normalize_salary(self, salary: str) -> str:
        """Normalize salary range"""
        if not salary:
            return ''
        
        # Extract numbers
        numbers = re.findall(r'[\d,]+', salary)
        if len(numbers) >= 2:
            return f"₹{numbers[0]} - ₹{numbers[1]}"
        elif len(numbers) == 1:
            return f"₹{numbers[0]}"
        
        return salary
    
    def _normalize_date(self, date_str: str) -> str:
        """Normalize date to ISO format"""
        if not date_str:
            return datetime.utcnow().isoformat()
        
        try:
            # Try parsing ISO format
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            return dt.isoformat()
        except:
            # Return as-is if can't parse
            return date_str


# Example usage
if __name__ == "__main__":
    normalizer = JobNormalizer()
    
    sample_job = {
        'job_id': 'abc123',
        'title': '  senior   PYTHON developer  ',
        'company': 'Tech Company Pvt. Ltd.',
        'location': 'bengaluru',
        'description': '<p>Looking for Python developer with <b>AWS</b> and Docker experience. Requirements: 5+ years Python, Django, PostgreSQL.</p>',
        'salary_range': '15,00,000 - 20,00,000',
        'posted_date': '2024-12-01T10:00:00Z',
        'source': 'Test',
        'source_url': 'https://example.com'
    }
    
    normalized = normalizer.normalize(sample_job)
    
    import json
    print(json.dumps(normalized, indent=2))
