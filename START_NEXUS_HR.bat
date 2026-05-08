@echo off
setlocal enabledelayedexpansion

:: ============================================================================
::  NEXUS HR AI - ALL-IN-ONE STARTUP SCRIPT
:: ============================================================================

title Nexus HR AI - Manager
color 0B

echo.
echo  ================================================================
echo.
echo     _   _                      _   _  ____      _     ___ 
echo    ^| \ ^| ^| _____  ___   _ ___ ^| ^| ^| ^|  _ \    / \   ^|_ _^|
echo    ^|  \^| ^|/ _ \ \/ / ^| ^| / __^| ^|_^| ^| ^|_) ^|  / _ \   ^| ^| 
echo    ^| ^|\  ^|  __/^>  ^<^| ^|_^| \__ \  _  ^|  _ ^<  / ___ \  ^| ^| 
echo    ^|_^| \_^|\___/_/\_\\__,_^|___/_^| ^|_^|_^| \_\/_/   \_\^|___^|
echo.
echo  ================================================================
echo.
echo  [1/3] Starting Candidate Sourcing API (Python)...
cd job_sourcing
start "Nexus HR - Sourcing API" cmd /k "python api_service.py"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo  [2/3] Starting Backend Server (Node.js)...
cd backend
start "Nexus HR - Backend" cmd /k "npm run dev"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo  [3/3] Starting Frontend Dashboard (Vite)...
start "Nexus HR - Frontend" cmd /k "npm run dev"

cls
echo.
echo  ================================================================
echo                   NEXUS HR AI IS NOW LIVE!
echo  ================================================================
echo.
echo  The application has been started in 3 separate windows:
echo.
echo  1.  Sourcing API:  http://localhost:5000 (Python/Flask)
echo  2.  Backend API:   http://localhost:3001 (Node/Express)
echo  3.  Frontend App:  http://localhost:3003 (React/Vite)
echo.
echo  ----------------------------------------------------------------
echo  LOGIN CREDENTIALS:
echo  ----------------------------------------------------------------
echo    Username: mayur
echo    Password: mayur
echo.
echo  ----------------------------------------------------------------
echo  IMPORTANT NOTES:
echo  ----------------------------------------------------------------
echo   - Keep all terminal windows open while using the app.
echo   - To stop the application, close the individual windows.
echo   - You can run 'full_restart.bat' if you need to reset all processes.
echo.
echo  ================================================================
echo.
echo  Opening the Frontend in your browser...
timeout /t 2 /nobreak >nul
start http://localhost:3003

echo.
echo  Ready! (Press any key to exit this manager window)
pause >nul
exit
