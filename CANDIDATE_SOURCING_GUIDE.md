# 🚀 Nexus HR AI - Candidate Sourcing Integration Guide

## Overview

I've created a **comprehensive candidate sourcing system** that integrates with your Nexus HR AI application to source candidates from **LinkedIn, Indeed, and Naukri.com**.

## 📁 What I've Built

### 1. **Python Candidate Scraper** (`job_sourcing/scrapers/candidate_scrapers.py`)
- Searches LinkedIn, Indeed, and Naukri using Serper API (Google Search)
- Extracts candidate profiles with:
  - Name, Company, Location
  - Skills, Experience
  - Contact information (email, phone)
  - LinkedIn/Portfolio URLs
  - AI Match Score
- **Mock mode** for testing without API keys
- Realistic Indian candidate data generation

### 2. **Flask API Service** (`job_sourcing/api_service.py`)
- REST API endpoints for candidate sourcing
- Endpoints:
  - `POST /api/source-candidates` - Search all platforms
  - `POST /api/source-linkedin` - LinkedIn only
  - `POST /api/source-indeed` - Indeed only
  - `POST /api/source-naukri` - Naukri only
  - `GET /health` - Health check

### 3. **Enhanced Backend Integration** (`backend/src/services/geminiService.ts`)
- Updated `sourceCandidates` function to call Python scraper service
- Falls back to AI-generated candidates if scraper unavailable
- Seamless integration with existing frontend

## 🔧 Setup Instructions

### Step 1: Install Python Dependencies

```bash
cd job_sourcing
pip install -r requirements.txt
```

### Step 2: Get Serper API Key (Optional but Recommended)

1. Go to [https://serper.dev](https://serper.dev)
2. Sign up for a free account
3. Get your API key (2,500 free searches/month)
4. Add to `job_sourcing/.env`:

```env
SERPER_API_KEY=your_api_key_here
```

**Note:** The system works in mock mode without an API key, generating realistic test data.

### Step 3: Start the Scraper API Service

```bash
cd job_sourcing
python api_service.py
```

The API will start on `http://localhost:5000`

### Step 4: Configure Backend (Optional)

If running the scraper service on a different port/host, update `backend/.env`:

```env
SCRAPER_SERVICE_URL=http://localhost:5000
```

### Step 5: Start Your Nexus HR AI Application

```bash
# Start backend
cd backend
npm run dev

# Start frontend (in another terminal)
npm run dev
```

## 📊 How It Works

### Architecture Flow

```
User (Frontend)
    ↓
    clicks "Start Discovery"
    ↓
Backend (geminiService.ts)
    ↓
    tries Python Scraper Service
    ↓
Python API (api_service.py)
    ↓
Candidate Scraper (candidate_scrapers.py)
    ↓
Serper API → Google Search
    ↓
    searches LinkedIn/Indeed/Naukri
    ↓
Returns Candidates
    ↓
Frontend displays results
```

### Fallback Strategy

1. **Primary**: Python scraper with Serper API (real data)
2. **Fallback 1**: AI-generated candidates (Gemini)
3. **Fallback 2**: Mock candidates (no API keys)

## 🎯 Usage

### In Your Application

1. Navigate to **Sourcing** tab
2. Enter:
   - **Target Role**: e.g., "Senior React Developer"
   - **Key Skills**: e.g., "React, TypeScript, Node.js"
   - **Location**: e.g., "Bangalore"
3. Click **"Start Discovery"**
4. View candidates from LinkedIn, Indeed, and Naukri
5. Click **"Add to Pipeline"** to move candidates to your sourcing pipeline

### API Usage (Direct)

```bash
# Source candidates from all platforms
curl -X POST http://localhost:5000/api/source-candidates \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Senior React Developer",
    "skills": "React, TypeScript, Node.js, AWS",
    "location": "Bangalore"
  }'

# LinkedIn only
curl -X POST http://localhost:5000/api/source-linkedin \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Python Developer",
    "skills": "Python, Django, PostgreSQL",
    "location": "Mumbai",
    "num_results": 10
  }'
```

## 🔑 API Keys & Configuration

### Serper API (Recommended)
- **Free Tier**: 2,500 searches/month
- **Paid**: $50/month for 50,000 searches
- **Sign up**: https://serper.dev

### Alternative: Run in Mock Mode
- No API key needed
- Generates realistic test data
- Perfect for development/testing

## 📝 Environment Variables

### `job_sourcing/.env`
```env
# Serper API (for real candidate search)
SERPER_API_KEY=your_serper_api_key_here

# Flask API Configuration
PORT=5000
FLASK_ENV=development
```

### `backend/.env`
```env
# Scraper Service URL
SCRAPER_SERVICE_URL=http://localhost:5000

# Gemini API (for AI fallback)
GEMINI_API_KEY=your_gemini_api_key_here
```

## 🎨 Features

### ✅ What Works Now

- ✅ Search LinkedIn profiles via Google Search
- ✅ Search Indeed resumes
- ✅ Search Naukri.com profiles
- ✅ Extract candidate information
- ✅ AI match scoring
- ✅ Contact information (email, phone)
- ✅ LinkedIn/Portfolio URLs
- ✅ Mock mode for testing
- ✅ Realistic Indian candidate data
- ✅ Integration with Nexus HR AI frontend
- ✅ Fallback to AI-generated candidates

### 🔄 Current Limitations

- **Search Results**: Limited to public profiles visible in Google Search
- **Contact Info**: Generated/inferred (not always accurate without direct API access)
- **Rate Limits**: Serper free tier = 2,500 searches/month
- **Profile Access**: Cannot access full LinkedIn/Naukri profiles without authentication

### 🚀 Future Enhancements

1. **Direct API Integration**:
   - LinkedIn Recruiter API (requires license)
   - Indeed Publisher API
   - Naukri Recruiter API

2. **Advanced Scraping**:
   - Playwright-based browser automation
   - CAPTCHA solving
   - Proxy rotation

3. **Data Enrichment**:
   - Email verification
   - Phone number validation
   - Social media profile matching

## 🐛 Troubleshooting

### Scraper Service Not Starting

```bash
# Check if port 5000 is available
netstat -ano | findstr :5000

# Try different port
PORT=5001 python api_service.py
```

### No Candidates Found

1. Check if Serper API key is valid
2. Try broader search terms
3. Check API service logs
4. Verify internet connection

### Backend Can't Connect to Scraper

1. Ensure scraper service is running
2. Check `SCRAPER_SERVICE_URL` in backend/.env
3. Verify no firewall blocking localhost:5000

## 📚 Additional Resources

### API Documentation
- **Serper API**: https://serper.dev/docs
- **Flask**: https://flask.palletsprojects.com/

### Legal Considerations
- Respect `robots.txt`
- Follow platform Terms of Service
- Use official APIs when available
- Don't scrape personal data without consent

## 🎉 Summary

You now have a **fully functional candidate sourcing system** that:

1. **Searches** LinkedIn, Indeed, and Naukri
2. **Extracts** candidate profiles with contact info
3. **Scores** candidates using AI
4. **Integrates** seamlessly with your Nexus HR AI app
5. **Falls back** gracefully when services are unavailable

The system works in **mock mode** without any API keys, making it perfect for testing and development!

## 🤝 Next Steps

1. **Test the system** in mock mode (no API keys needed)
2. **Get Serper API key** for real candidate data
3. **Customize** search parameters for your needs
4. **Monitor** results and refine search queries
5. **Consider** upgrading to direct API integrations for production use

---

**Need help?** Check the logs in:
- Scraper API: Terminal running `api_service.py`
- Backend: Backend server logs
- Frontend: Browser console

Happy recruiting! 🎯
