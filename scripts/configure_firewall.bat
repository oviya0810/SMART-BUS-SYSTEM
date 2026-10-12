@echo off
REM Run as Administrator: allows phones/laptops on the LAN to reach the server.
net session >nul 2>&1 || (echo Please right-click and "Run as administrator". & pause & exit /b 1)
netsh advfirewall firewall add rule name="SMARTBUS 360 HTTP" dir=in action=allow protocol=TCP localport=80 profile=private
netsh advfirewall firewall add rule name="SMARTBUS 360 HTTPS" dir=in action=allow protocol=TCP localport=443 profile=private
netsh advfirewall firewall add rule name="SMARTBUS 360 mDNS" dir=in action=allow protocol=UDP localport=5353 profile=private
echo Firewall rules added (Private network profile). Make sure your Wi-Fi is set to "Private".
pause
