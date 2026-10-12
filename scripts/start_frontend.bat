@echo off
REM DEVELOPMENT ONLY: Vite dev server with hot reload on http://localhost:5173
REM It proxies /api and /socket.io to the backend (VITE_DEV_BACKEND in frontend\.env).
REM Start the backend first (scripts\start_backend.bat).
cd /d "%~dp0..\frontend"
title SMARTBUS 360 frontend (dev)
call npm run dev
pause
