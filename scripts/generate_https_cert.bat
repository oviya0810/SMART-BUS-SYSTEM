@echo off
REM Creates a self-signed certificate for https://bus.local (needed for phone GPS in browsers).
cd /d "%~dp0.."
".venv\Scripts\python.exe" backend\generate_cert.py %*
echo Copy the printed lines into .env and restart the server.
pause
