"""
Database Models for Job Storage
SQLAlchemy models for PostgreSQL
"""
from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

class Job(Base):
    """Job listing model"""
    
    __tablename__ = 'jobs'
    
    # Primary key
    job_id = Column(String(64), primary_key=True, index=True)
    
    # Basic info
    title = Column(String(255), nullable=False, index=True)
    company = Column(String(255), nullable=False, index=True)
    location = Column(String(255), index=True)
    
    # Details
    description = Column(Text)
    requirements = Column(JSON)  # List of requirements
    skills = Column(JSON)  # List of skills
    salary_range = Column(String(100))
    
    # Metadata
    source = Column(String(50), index=True)
    source_url = Column(Text)
    posted_date = Column(DateTime, index=True)
    scraped_at = Column(DateTime, default=datetime.utcnow)
    normalized_at = Column(DateTime)
    
    # Additional fields
    contract_type = Column(String(50))  # Full-time, Contract, etc.
    category = Column(String(100))
    
    # Indexes for common queries
    __table_args__ = (
        Index('idx_title_company', 'title', 'company'),
        Index('idx_location_source', 'location', 'source'),
        Index('idx_posted_date', 'posted_date'),
    )
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'job_id': self.job_id,
            'title': self.title,
            'company': self.company,
            'location': self.location,
            'description': self.description,
            'requirements': self.requirements,
            'skills': self.skills,
            'salary_range': self.salary_range,
            'source': self.source,
            'source_url': self.source_url,
            'posted_date': self.posted_date.isoformat() if self.posted_date else None,
            'scraped_at': self.scraped_at.isoformat() if self.scraped_at else None,
            'contract_type': self.contract_type,
            'category': self.category
        }


class ScraperRun(Base):
    """Track scraper execution"""
    
    __tablename__ = 'scraper_runs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    scraper_name = Column(String(100), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    status = Column(String(20))  # running, completed, failed
    jobs_scraped = Column(Integer, default=0)
    jobs_stored = Column(Integer, default=0)
    error_message = Column(Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'scraper_name': self.scraper_name,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'status': self.status,
            'jobs_scraped': self.jobs_scraped,
            'jobs_stored': self.jobs_stored,
            'error_message': self.error_message
        }


# Database connection
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost:5432/jobs_db')

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Initialize database (create tables)"""
    Base.metadata.create_all(bind=engine)
    print("Database initialized")

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Example usage
if __name__ == "__main__":
    # Create tables
    init_db()
    
    # Test insert
    db = SessionLocal()
    
    test_job = Job(
        job_id='test123',
        title='Python Developer',
        company='Test Company',
        location='Bangalore',
        description='Test job description',
        requirements=['Python', 'Django'],
        skills=['Python', 'SQL'],
        source='Test',
        source_url='https://example.com',
        posted_date=datetime.utcnow()
    )
    
    db.add(test_job)
    db.commit()
    
    # Query
    jobs = db.query(Job).filter(Job.location == 'Bangalore').all()
    print(f"Found {len(jobs)} jobs in Bangalore")
    
    db.close()
