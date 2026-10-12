@echo off
REM Consistent online backup of the SQLite database into the backups\ folder.
cd /d "%~dp0.."
".venv\Scripts\python.exe" scripts\db_backup.py backup
pause
