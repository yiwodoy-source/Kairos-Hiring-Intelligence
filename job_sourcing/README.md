# Legal Job Sourcing Engine for India

## 🎯 Overview
Production-ready job sourcing pipeline using only legally compliant sources in India.

## ✅ Legal Sources

### 1. Government Portals (Public Data)
- **National Career Service (NCS)**: https://www.ncs.gov.in/
- **State Employment Exchanges**: Various state portals
- **Data.gov.in**: Open government datasets
- **PSC Portals**: Public Service Commission job listings

### 2. ATS Public APIs/Feeds
- **Greenhouse**: Public job board JSON feeds
- **Lever**: Public career pages with structured data
- **Workday**: Public job listings (JSON/XML feeds)
- **BambooHR**: Public career pages

### 3. Job Aggregator APIs (Licensed)
- **Jooble API**: https://jooble.org/api/about
- **Adzuna API**: https://developer.adzuna.com/
- **Indeed Publisher API**: https://www.indeed.com/publisher
- **Glassdoor API**: (Enterprise only)

### 4. Company Career Pages (robots.txt compliant)
- Public career pages that allow crawling
- RSS/Atom feeds
- Sitemap.xml parsing

## 🏗️ Architecture

```
┌─────────────────┐
│  Schedulers     │ (Cron/APScheduler)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Scrapers      │ (Scrapy/Playwright/Requests)
│  - NCS Portal   │
│  - ATS Feeds    │
│  - APIs         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ETL Pipeline   │
│  - Normalize    │
│  - Deduplicate  │
│  - Enrich       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Storage       │
│  - PostgreSQL   │
│  - MongoDB      │
│  - Redis Cache  │
└─────────────────┘
```

## 📋 Technical Specs

### Extraction Methods
1. **JSON APIs**: Direct HTTP requests
2. **HTML Scraping**: BeautifulSoup4 + Requests
3. **Dynamic Sites**: Playwright (headless browser)
4. **RSS/Atom**: feedparser
5. **Sitemaps**: XML parsing

### Rate Limiting
- Respect `robots.txt`
- Max 1 req/sec per domain
- Exponential backoff on errors
- User-Agent identification

### Data Schema
```json
{
  "job_id": "unique_hash",
  "title": "Software Engineer",
  "company": "TCS",
  "location": "Bangalore, India",
  "description": "...",
  "requirements": ["Python", "AWS"],
  "salary_range": "10-15 LPA",
  "posted_date": "2024-12-03",
  "source": "ncs.gov.in",
  "source_url": "https://...",
  "scraped_at": "2024-12-03T12:00:00Z"
}
```

## 🚀 Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run scrapers
python run_scrapers.py

# Start scheduler
python scheduler.py
```

## 📦 Project Structure

```
job_sourcing/
├── scrapers/
│   ├── ncs_scraper.py          # National Career Service
│   ├── ats_scrapers.py         # Greenhouse, Lever, Workday
│   ├── api_scrapers.py         # Jooble, Adzuna APIs
│   └── career_page_scraper.py  # Company websites
├── pipeline/
│   ├── normalizer.py           # Data normalization
│   ├── deduplicator.py         # Duplicate detection
│   └── enricher.py             # Data enrichment
├── storage/
│   ├── db_models.py            # SQLAlchemy models
│   └── mongo_client.py         # MongoDB client
├── utils/
│   ├── robots_checker.py       # robots.txt validator
│   ├── rate_limiter.py         # Rate limiting
│   └── logger.py               # Logging
├── scheduler.py                # Cron scheduler
├── run_scrapers.py             # Main runner
└── requirements.txt
```

## ⚖️ Legal Compliance

### ✅ Allowed
- Public government portals (NCS, PSC)
- Official ATS public feeds
- Licensed API usage (Jooble, Adzuna)
- Career pages that allow crawling (robots.txt)

### ❌ Not Allowed
- LinkedIn scraping (ToS violation)
- Naukri scraping (requires recruiter account)
- Indeed scraping (use Publisher API only)
- Any site with `Disallow: /` in robots.txt

## 🔒 Security & Ethics

1. **Respect robots.txt**: Check before every crawl
2. **Rate limiting**: Max 1 req/sec
3. **User-Agent**: Identify as "NexusHR-Bot/1.0"
4. **No personal data**: Only public job listings
5. **GDPR/DPDP compliance**: No candidate PII without consent
