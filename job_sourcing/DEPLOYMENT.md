# Deployment Guide

## 🚀 Production Deployment

### Prerequisites
- Python 3.9+
- PostgreSQL 13+
- Redis (optional, for caching)
- MongoDB (optional, for raw data storage)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and dependencies
sudo apt install python3.9 python3-pip python3-venv postgresql postgresql-contrib -y

# Install Playwright dependencies (for dynamic scraping)
sudo apt install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2
```

### 2. Application Setup

```bash
# Clone/copy project
cd /opt
sudo mkdir job_sourcing
sudo chown $USER:$USER job_sourcing
cd job_sourcing

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

### 3. Database Setup

```bash
# Create PostgreSQL database
sudo -u postgres psql
CREATE DATABASE jobs_db;
CREATE USER jobs_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE jobs_db TO jobs_user;
\q

# Initialize database
python -c "from storage.db_models import init_db; init_db()"
```

### 4. Configuration

```bash
# Copy environment file
cp .env.example .env

# Edit configuration
nano .env
```

Update `.env`:
```bash
DATABASE_URL=postgresql://jobs_user:secure_password@localhost:5432/jobs_db
JOOBLE_API_KEY=your_actual_key
ADZUNA_APP_ID=your_actual_id
ADZUNA_APP_KEY=your_actual_key
LOG_LEVEL=INFO
```

### 5. Create Systemd Service

Create `/etc/systemd/system/job-scraper.service`:

```ini
[Unit]
Description=Job Scraper Scheduler
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/job_sourcing
Environment="PATH=/opt/job_sourcing/venv/bin"
ExecStart=/opt/job_sourcing/venv/bin/python scheduler.py
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable job-scraper
sudo systemctl start job-scraper
sudo systemctl status job-scraper
```

### 6. Monitoring

```bash
# View logs
sudo journalctl -u job-scraper -f

# Or check log file
tail -f logs/scheduler.log
```

### 7. Cron Alternative (if not using systemd)

```bash
# Edit crontab
crontab -e

# Add entry (run every 6 hours)
0 */6 * * * cd /opt/job_sourcing && /opt/job_sourcing/venv/bin/python run_scrapers.py >> logs/cron.log 2>&1
```

## 🐳 Docker Deployment

### Build and Run

```bash
# Build image
docker build -t job-scraper:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f scraper
```

### Docker Compose

See `docker-compose.yml` for full configuration.

## 📊 Monitoring & Maintenance

### Database Queries

```sql
-- Check recent scraper runs
SELECT * FROM scraper_runs ORDER BY started_at DESC LIMIT 10;

-- Count jobs by source
SELECT source, COUNT(*) FROM jobs GROUP BY source;

-- Recent jobs
SELECT title, company, location, posted_date 
FROM jobs 
ORDER BY scraped_at DESC 
LIMIT 20;
```

### Cleanup Old Jobs

```sql
-- Delete jobs older than 90 days
DELETE FROM jobs WHERE posted_date < NOW() - INTERVAL '90 days';
```

### Performance Tuning

```bash
# PostgreSQL tuning
sudo nano /etc/postgresql/13/main/postgresql.conf

# Increase shared_buffers, work_mem, etc.
shared_buffers = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB
```

## 🔒 Security

1. **Firewall**: Only allow necessary ports
```bash
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 5432/tcp  # PostgreSQL (if remote)
sudo ufw enable
```

2. **SSL for Database**: Use SSL connections in production

3. **API Keys**: Store in environment variables, never commit

4. **Rate Limiting**: Respect robots.txt and implement delays

## 🚨 Troubleshooting

### Common Issues

**1. Database Connection Error**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U jobs_user -d jobs_db -h localhost
```

**2. API Rate Limiting**
- Increase delays in `rate_limiter.py`
- Check API quotas

**3. Memory Issues**
- Reduce `results_per_page` in scrapers
- Process in smaller batches

**4. Playwright Errors**
```bash
# Reinstall browsers
playwright install --force chromium
```

## 📈 Scaling

### Horizontal Scaling

Use Celery for distributed scraping:

```bash
pip install celery redis

# Start worker
celery -A tasks worker --loglevel=info

# Start beat (scheduler)
celery -A tasks beat --loglevel=info
```

### Database Scaling

- Use read replicas for queries
- Partition jobs table by date
- Archive old jobs to separate table

## 📝 Maintenance Schedule

- **Daily**: Monitor logs and error rates
- **Weekly**: Check database size and performance
- **Monthly**: Review and update scraper selectors
- **Quarterly**: Update dependencies and security patches
