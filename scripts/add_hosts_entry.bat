@echo off
REM Run as Administrator ON EACH WINDOWS CLIENT PC (not needed on phones - use router DNS or mDNS).
REM Usage: add_hosts_entry.bat 192.168.1.50
net session >nul 2>&1 || (echo Please right-click and "Run as administrator". & pause & exit /b 1)
if "%~1"=="" (echo Usage: add_hosts_entry.bat ^<server LAN IP^> & pause & exit /b 1)
findstr /i /c:" bus.local" %SystemRoot%\System32\drivers\etc\hosts >nul && (echo bus.local already present in hosts file - edit it manually if the IP changed. & pause & exit /b 0)
echo %~1 bus.local>> %SystemRoot%\System32\drivers\etc\hosts
ipconfig /flushdns >nul
echo Added: %~1 bus.local
pause
