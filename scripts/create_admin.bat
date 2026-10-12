@echo off
REM Create the first (or another) administrator account interactively.
cd /d "%~dp0.."
".venv\Scripts\python.exe" backend\seed_admin.py
pause
