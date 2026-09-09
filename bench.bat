@echo off
REM  The Ember Watch - Tuning Bench
REM  Everything runs on THIS PC. No internet, no account, no tokens.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, or is not on your PATH.
  echo Get it from https://nodejs.org - the LTS build is fine - then run this again.
  echo.
  pause
  exit /b 1
)

echo Starting the tuning bench...
start "Ember Watch Tuning Bench" cmd /k node "%~dp0tools\bench.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8770"

echo.
echo The bench is open in your browser at http://localhost:8770
echo A separate window is running the server - leave it open while you tune.
echo.
pause
