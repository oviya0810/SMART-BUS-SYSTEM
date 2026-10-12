@echo off
REM Rebuild the production dashboards into frontend\dist (served by the backend).
cd /d "%~dp0..\frontend"
call npm run build
pause
