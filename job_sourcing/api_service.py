"""
Flask API Service for Candidate Sourcing
Provides REST API endpoints for the candidate scraper
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.candidate_scrapers import SerperCandidateSearcher
from scrapers.selenium_scrapers import SeleniumCandidateScraper

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize scraper
try:
    api_key = os.getenv('SERPER_API_KEY')
    if api_key:
        logger.info(f"✅ API Key found: {api_key[:5]}...")
    else:
        logger.warning("❌ API Key NOT found in environment!")

    scraper = SerperCandidateSearcher()
    logger.info("✅ Candidate scraper initialized successfully")
except Exception as e:
    logger.warning(f"⚠️  Scraper initialization warning: {e}")
    scraper = SerperCandidateSearcher()  # Will run in mock mode


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'candidate-sourcing-api',
        'version': '1.0.0'
    })


@app.route('/api/source-candidates', methods=['POST'])
def source_candidates():
    """
    Source candidates from LinkedIn, Indeed, and Naukri
    
    Request Body:
    {
        "role": "Senior React Developer",
        "skills": "React, TypeScript, Node.js",
        "location": "Bangalore"
    }
    
    Response:
    {
        "candidates": [...]
    }
    """
    try:
        data = request.get_json()
        
        # Validate request
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        role = data.get('role', '')
        skills = data.get('skills', '')
        location = data.get('location', 'India')
        
        if not role:
            return jsonify({'error': 'role is required'}), 400
        
        logger.info(f"📋 Sourcing candidates for: {role} | Skills: {skills} | Location: {location}")
        
        # Search all platforms
        candidates = scraper.search_all_platforms(role, skills, location)
        
        logger.info(f"✅ Found {len(candidates)} candidates")
        
        return jsonify({
            'success': True,
            'candidates': candidates,
            'count': len(candidates),
            'query': {
                'role': role,
                'skills': skills,
                'location': location
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Error sourcing candidates: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/source-linkedin', methods=['POST'])
def source_linkedin():
    """Source candidates specifically from LinkedIn"""
    try:
        data = request.get_json()
        role = data.get('role', '')
        skills = data.get('skills', '')
        location = data.get('location', 'India')
        num_results = data.get('num_results', 10)
        
        if not role:
            return jsonify({'error': 'role is required'}), 400
        
        candidates = scraper.search_linkedin_profiles(role, skills, location, num_results)
        
        return jsonify({
            'success': True,
            'candidates': candidates,
            'count': len(candidates),
            'source': 'LinkedIn'
        })
        
    except Exception as e:
        logger.error(f"Error sourcing from LinkedIn: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/source-indeed', methods=['POST'])
def source_indeed():
    """Source candidates specifically from Indeed"""
    try:
        data = request.get_json()
        role = data.get('role', '')
        skills = data.get('skills', '')
        location = data.get('location', 'India')
        num_results = data.get('num_results', 10)
        
        if not role:
            return jsonify({'error': 'role is required'}), 400
        
        candidates = scraper.search_indeed_profiles(role, skills, location, num_results)
        
        return jsonify({
            'success': True,
            'candidates': candidates,
            'count': len(candidates),
            'source': 'Indeed'
        })
        
    except Exception as e:
        logger.error(f"Error sourcing from Indeed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/source-naukri', methods=['POST'])
def source_naukri():
    """Source candidates specifically from Naukri"""
    try:
        data = request.get_json()
        role = data.get('role', '')
        skills = data.get('skills', '')
        location = data.get('location', 'India')
        num_results = data.get('num_results', 10)
        
        if not role:
            return jsonify({'error': 'role is required'}), 400
        
        candidates = scraper.search_naukri_profiles(role, skills, location, num_results)
        
        return jsonify({
            'success': True,
            'candidates': candidates,
            'count': len(candidates),
            'source': 'Naukri.com'
        })
        
    except Exception as e:
        logger.error(f"Error sourcing from Naukri: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/source-selenium', methods=['POST'])
def source_selenium():
    """
    Source candidates via Selenium scrapers (Naukri + Wellfound).
    Falls back to DuckDuckGo HTML search if ChromeDriver is unavailable.

    Request body: { "role": "...", "location": "...", "limit": 10 }
    """
    try:
        data = request.get_json() or {}
        role = data.get('role', '')
        location = data.get('location', 'India')
        limit = int(data.get('limit', 10))

        if not role:
            return jsonify({'error': 'role is required'}), 400

        scraper_sel = SeleniumCandidateScraper(headless=True)
        try:
            candidates = scraper_sel.search_all(role, location, limit)
        finally:
            scraper_sel.quit()

        return jsonify({
            'success': True,
            'candidates': candidates,
            'count': len(candidates),
            'source': 'Selenium (Naukri + Wellfound)',
        })
    except Exception as e:
        logger.error(f"Error in source-selenium: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/source-free', methods=['POST'])
def source_free():
    """
    Combined free sourcing: SerperCandidateSearcher (DDG fallback) + Selenium scrapers.
    No paid API keys required.

    Request body: { "roles": [{"title": "...", "limit": 5}], "location": "India" }
    """
    try:
        data = request.get_json() or {}
        roles = data.get('roles', [])
        location = data.get('location', 'India')

        if not roles:
            return jsonify({'error': 'roles array is required'}), 400

        # Initialise Selenium scraper once (shared driver)
        sel_scraper = SeleniumCandidateScraper(headless=True)
        results = []
        try:
            for role_obj in roles:
                title = role_obj.get('title', '')
                limit = int(role_obj.get('limit', 5))
                if not title:
                    continue

                role_candidates = []

                # 1. Serper / DDG search
                skills_guess = title  # use role title as skills hint
                serper_candidates = scraper.search_all_platforms(title, skills_guess, location)
                role_candidates.extend(serper_candidates[:limit])

                # 2. Selenium / DDG fallback
                selenium_candidates = sel_scraper.search_all(title, location, limit)
                role_candidates.extend(selenium_candidates)

                # Deduplicate by name
                seen_names: set = set()
                unique: list = []
                for c in role_candidates:
                    key = c.get('name', '').lower().strip()
                    if key and key not in seen_names:
                        seen_names.add(key)
                        unique.append(c)

                results.append({
                    'role': title,
                    'candidates': unique[:limit],
                    'count': len(unique[:limit]),
                })
        finally:
            sel_scraper.quit()

        total = sum(r['count'] for r in results)
        return jsonify({
            'success': True,
            'results': results,
            'total': total,
            'location': location,
        })
    except Exception as e:
        logger.error(f"Error in source-free: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"🚀 Starting Candidate Sourcing API on port {port}")
    logger.info(f"📍 API Endpoints:")
    logger.info(f"   - POST /api/source-candidates (All platforms)")
    logger.info(f"   - POST /api/source-linkedin (LinkedIn only)")
    logger.info(f"   - POST /api/source-indeed (Indeed only)")
    logger.info(f"   - POST /api/source-naukri (Naukri only)")
    logger.info(f"   - GET  /health (Health check)")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
