@echo off
REM Restore a backup. STOP THE SERVER FIRST.  Usage: restore_database.bat backups\smartbus360_YYYYmmdd_HHMMSS.db
cd /d "%~dp0.."
if "%~1"=="" (
  echo Available backups:
  ".venv\Scripts\python.exe" scripts\db_backup.py list
  echo.
  echo Usage: scripts\restore_database.bat ^<backup file^>
  pause
  exit /b 1
)
echo This will REPLACE the current database with %~1 (a safety copy is kept).
set /p OK=Type YES to continue: 
if /i not "%OK%"=="YES" (echo Cancelled. & exit /b 1)
".venv\Scripts\python.exe" scripts\db_backup.py restore "%~1"
pause
