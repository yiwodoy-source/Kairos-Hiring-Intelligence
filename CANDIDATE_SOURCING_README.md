# 🎯 Nexus HR AI - Candidate Sourcing System

## Quick Start

```bash
# Start the candidate sourcing API
start_sourcing_api.bat

# Start your Nexus HR AI application
start_app.bat

# Open browser and go to Sourcing tab
# Enter job requirements and click "Start Discovery"
```

## What This Does

Sources candidates from **LinkedIn, Indeed, and Naukri.com** directly in your Nexus HR AI application.

## Features

- ✅ Multi-platform search (LinkedIn + Indeed + Naukri)
- ✅ Structured candidate profiles
- ✅ Contact information (email, phone, LinkedIn)
- ✅ AI-powered match scoring
- ✅ Works without API keys (mock mode)
- ✅ Seamless integration with your app

## Documentation

- **📖 Complete Setup Guide**: `CANDIDATE_SOURCING_GUIDE.md`
- **📊 System Summary**: `SUMMARY.md`
- **🔧 N8N Analysis**: `N8N_WORKFLOW_ANALYSIS.md`

## Architecture

![Candidate Sourcing Architecture](candidate_sourcing_architecture.png)

```
User (Nexus HR AI)
    ↓
Backend API (Node.js)
    ↓
Python API Service (Flask)
    ↓
Candidate Scraper
    ↓
Serper API (Google Search)
    ↓
LinkedIn / Indeed / Naukri
    ↓
Returns Candidates
```

## API Endpoints

- `POST /api/source-candidates` - Search all platforms
- `POST /api/source-linkedin` - LinkedIn only
- `POST /api/source-indeed` - Indeed only
- `POST /api/source-naukri` - Naukri only
- `GET /health` - Health check

## Configuration

### Optional: Serper API Key

For real candidate data (2,500 free searches/month):

1. Sign up at https://serper.dev
2. Get API key
3. Add to `job_sourcing/.env`:

```env
SERPER_API_KEY=your_api_key_here
```

**Note**: Works in mock mode without API key!

## Files

### New Files Created
- `job_sourcing/scrapers/candidate_scrapers.py` - Main scraper
- `job_sourcing/api_service.py` - Flask API
- `start_sourcing_api.bat` - Quick start script
- `CANDIDATE_SOURCING_GUIDE.md` - Full documentation
- `N8N_WORKFLOW_ANALYSIS.md` - N8N comparison
- `SUMMARY.md` - Executive summary

### Modified Files
- `backend/src/services/geminiService.ts` - Enhanced sourcing
- `job_sourcing/requirements.txt` - Added Flask dependencies

## Troubleshooting

### Python not found
Install Python 3.8+ from https://www.python.org/downloads/

### Port 5000 in use
```bash
PORT=5001 python job_sourcing/api_service.py
```

### No candidates found
- System works in mock mode - you'll get test data
- For real data, add Serper API key
- Try broader search terms

## Support

Check the logs:
- **API Service**: Terminal running `api_service.py`
- **Backend**: Backend server logs
- **Frontend**: Browser console (F12)

## Next Steps

1. ✅ Test in mock mode (no setup needed)
2. 🔑 Get Serper API key for real data
3. 🎯 Customize for your job requirements
4. 🚀 Consider upgrading to direct API integrations

---

**Ready to source candidates? Run `start_sourcing_api.bat` and start recruiting!** 🎯
