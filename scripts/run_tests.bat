@echo off
REM Runs the backend test suite against a temporary test database (never the real one).
cd /d "%~dp0..\backend"
"..\.venv\Scripts\python.exe" -m pytest -v
pause
