@echo off
rem Installs make3d. Double-click it, or run it from a Command Prompt.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
echo.
pause
