@echo off
echo Stopping Node.js processes...
taskkill /F /IM node.exe
echo.
echo Restarting Backend...
cd backend
start "Nexus HR Backend" cmd /c "npm run dev"
cd ..
echo.
echo Restarting Frontend...
start "Nexus HR Frontend" cmd /c "npm run dev"
echo.
echo Done! Please refresh your browser.
pause
