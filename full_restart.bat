@echo off
echo Stopping ALL processes...
taskkill /F /IM node.exe
taskkill /F /IM python.exe
taskkill /F /IM py.exe

echo.
echo Starting Sourcing API (Python)...
cd job_sourcing
start "Sourcing API" cmd /k "py api_service.py"
cd ..

timeout /t 5 /nobreak >nul

echo.
echo Starting Backend...
cd backend
start "Nexus HR Backend" cmd /c "npm run dev"
cd ..

timeout /t 5 /nobreak >nul

echo.
echo Starting Frontend...
start "Nexus HR Frontend" cmd /c "npm run dev"

echo.
echo Done!
pause
