@echo off
REM Production-style start: builds the dashboards if needed, then starts the server
REM that serves dashboards + API + Socket.IO on one address (PORT in .env, default 80).
REM Add "dev" to also open the Vite dev server:  scripts\start_all.bat dev
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (echo Run scripts\setup_windows.bat first. & pause & exit /b 1)
if not exist "frontend\dist\index.html" (
  echo Building dashboards...
  pushd frontend & call npm run build & popd
)
start "SMARTBUS 360 server" cmd /k ".venv\Scripts\python.exe backend\run.py"
if /i "%1"=="dev" start "SMARTBUS 360 frontend (dev)" cmd /k "cd frontend && npm run dev"
timeout /t 4 >nul
start "" "http://localhost/login"
