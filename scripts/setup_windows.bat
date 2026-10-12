@echo off
REM ==========================================================================
REM  SMARTBUS 360 - one-time setup for Windows 10/11
REM  Requires: Python 3.11+ (python.org, "Add to PATH" ticked) and Node.js 20 LTS+
REM ==========================================================================
setlocal
cd /d "%~dp0.."
echo.
echo === SMARTBUS 360 setup ===

where python >nul 2>nul || (echo [ERROR] Python not found. Install Python 3.11+ from python.org and tick "Add python.exe to PATH". & goto :fail)
where npm >nul 2>nul || (echo [ERROR] Node.js/npm not found. Install Node.js 20 LTS from nodejs.org. & goto :fail)

if not exist ".venv\Scripts\python.exe" (
  echo [1/6] Creating Python virtual environment .venv
  python -m venv .venv || goto :fail
) else (
  echo [1/6] Virtual environment already exists
)

echo [2/6] Installing backend requirements
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt || goto :fail

if not exist ".env" (
  echo [3/6] Creating .env with a random SECRET_KEY
  copy /y ".env.example" ".env" >nul
  ".venv\Scripts\python.exe" -c "import secrets,re,io;p='.env';s=io.open(p,encoding='utf-8').read();s=re.sub(r'^SECRET_KEY=.*$','SECRET_KEY='+secrets.token_hex(32),s,flags=re.M);io.open(p,'w',encoding='utf-8').write(s)" || goto :fail
) else (
  echo [3/6] .env already exists - keeping it
)

echo [4/6] Initialising the SQLite database
".venv\Scripts\python.exe" backend\init_db.py || goto :fail

echo [5/6] Installing frontend dependencies
pushd frontend
call npm ci || call npm install || (popd & goto :fail)
echo [6/6] Building the dashboards
call npm run build || (popd & goto :fail)
popd

echo.
echo Setup complete.
echo Next steps:
echo   1. Create the first administrator:   scripts\create_admin.bat
echo   2. Start the server:                 scripts\start_all.bat
echo   3. Open http://localhost/login (see docs\NETWORK_SETUP.md for bus.local)
exit /b 0

:fail
echo.
echo Setup FAILED - see the messages above and docs\TROUBLESHOOTING.md
exit /b 1
