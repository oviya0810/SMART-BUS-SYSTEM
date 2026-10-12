@echo off
REM Starts the Flask + Socket.IO server. It also serves the built dashboards,
REM so http://bus.local/admin, /student, /bus and /api all share one address.
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (echo Run scripts\setup_windows.bat first. & pause & exit /b 1)
title SMARTBUS 360 server
".venv\Scripts\python.exe" backend\run.py
pause
