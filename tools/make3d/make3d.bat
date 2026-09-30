@echo off
rem Turns a picture into a game-ready 3D model. Drag a picture onto this file,
rem or run:  make3d.bat mypicture.png [options]    (make3d.bat --help for all)
setlocal
set "PY=%LOCALAPPDATA%\make3d\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo make3d is not installed yet. Run setup.bat first.
  pause
  exit /b 1
)
rem Everything is on this PC after setup: never go online.
set HF_HUB_OFFLINE=1
set HF_HUB_DISABLE_TELEMETRY=1
"%PY%" "%~dp0make3d.py" %*
set RC=%ERRORLEVEL%
rem Keep the window open when started by double-click or drag-and-drop.
echo %CMDCMDLINE% | find /i "%~0" >nul && pause
exit /b %RC%
