@echo off
echo ========================================
echo  Nexus HR AI - Candidate Sourcing Setup
echo ========================================
echo.

echo [1/3] Checking Python installation...
py --version
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo.
echo [2/3] Installing Python dependencies...
cd job_sourcing
py -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [3/3] Starting Candidate Sourcing API...
echo.
echo ========================================
echo  API Service Starting on Port 5000
echo ========================================
echo.
echo Endpoints:
echo   - POST /api/source-candidates
echo   - POST /api/source-linkedin
echo   - POST /api/source-indeed
echo   - POST /api/source-naukri
echo   - GET  /health
echo.
echo Press Ctrl+C to stop the service
echo ========================================
echo.

python api_service.py
