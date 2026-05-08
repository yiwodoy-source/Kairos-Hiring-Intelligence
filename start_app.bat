@echo off
echo ========================================
echo  Starting Nexus HR AI Application
echo ========================================
echo.

echo [1/2] Starting Backend Server...
cd backend
start "Nexus HR Backend" cmd /c "npm run dev"
cd ..

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Server...
start "Nexus HR Frontend" cmd /c "npm run dev"

echo.
echo ========================================
echo  Application Started Successfully!
echo ========================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3003
echo.
echo Login Credentials:
echo   Username: mayur
echo   Password: mayur
echo.
echo Press any key to close this window...
echo (Backend and Frontend will keep running)
pause >nul
