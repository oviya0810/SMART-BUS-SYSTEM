# SMARTBUS 360 — Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `'python' is not recognized` | Install Python 3.11+ from python.org with **"Add python.exe to PATH"**, reopen the terminal. |
| `npm` not found | Install Node.js 20 LTS (nodejs.org), reopen the terminal. |
| PowerShell: *running scripts is disabled* when activating venv | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or call `.venv\Scripts\python.exe` directly (the .bat scripts do). |
| `OSError: [WinError 10013]` / *address already in use* on port 80 | Another program uses port 80. Find it: `netstat -ano \| findstr :80` then `tasklist /fi "pid eq <PID>"`. Common: IIS / *World Wide Web Publishing Service* (stop it in services.msc), Skype, XAMPP. Or set `PORT=8080` in `.env`. |
| Browser shows "SMARTBUS 360 backend is running … dashboards have not been built" | Run `scripts\build_frontend.bat` (or `npm run build` in `frontend`). |
| Works on the server, not on phones | Same Wi-Fi? Firewall rule (run `configure_firewall.bat` as admin)? Network profile **Private**? Try `http://<server-ip>/api/health` first. Guest networks often block client-to-client traffic. |
| `bus.local` does not open but the IP works | Name resolution not configured — see NETWORK_SETUP §3 (router DNS, mDNS or hosts file). Android < 12 does not resolve `.local` via mDNS. |
| Header shows **Reconnecting** permanently | WebSocket blocked or origin rejected. Open the page through the same address the server is reached at, or add your origin to `CORS_ORIGINS`. Check `backend/logs/smartbus360.log` for *"not an accepted origin"*. Data still loads; only live push is affected. |
| Student "Get my location" says it needs HTTPS | Browsers allow GPS only on HTTPS or localhost. Enable HTTPS (NETWORK_SETUP §6) or choose a boarding stop. |
| "Location permission was denied" | Phone settings → Apps → browser → Permissions → Location → Allow; also the site permission (lock icon → Permissions → Location). Turn on device location/GPS. |
| Map is grey / no streets | Client has no internet, so OpenStreetMap tiles cannot load. Markers still work. |
| Seats show *Waiting for hardware data* | No occupancy reading has been received from the ESP32 for that bus. Check the device token, `bus_number` in the payload and `Hardware Status` page last error. |
| ESP32 gets `401 DEVICE_UNAUTHENTICATED` | Wrong `X-Device-ID` or token, or token was rotated/removed. Re-associate the device in Admin → Buses & devices and update firmware. |
| ESP32 gets `403 DEVICE_BUS_MISMATCH` | `bus_number` in the JSON does not match the bus the device is assigned to (compare is case-insensitive, spaces collapsed). |
| ESP32 gets `422 INVALID_TIMESTAMP` | Device clock not set. Call `configTime(19800, 0, "pool.ntp.org")` (IST) after Wi-Fi connect, or use GPS time, and send epoch seconds. |
| `422 OCCUPANCY_OUT_OF_RANGE` | Sensor reported more passengers than the configured capacity; fix the counter or capacity. Rejected readings are shown as the device's last error. |
| Device shows **Offline** although it posts GPS | Clock skew is not the issue — *online* = last authenticated request within `DEVICE_OFFLINE_SECONDS` (90 s). Ensure heartbeats every 30 s. |
| `PASSWORD_CHANGE_REQUIRED` | First login — the dashboard redirects to *Set a new password*. |
| `429 TOO_MANY_ATTEMPTS` | 5 wrong passwords in 15 min from that device/username. Wait, or an admin can reset the password. Restarting the server clears the limiter. |
| Forgot the admin password | Stop the server, run `scripts\create_admin.bat` to create another admin, sign in and reset the old account (or deactivate it). |
| `database is locked` | Another tool holds the DB (e.g. DB Browser with uncommitted changes). Close it. WAL mode + 30 s timeout handle normal concurrency. |
| Upgrading/changing models | Back up first, then `flask --app run db migrate` / `db upgrade` (see DATABASE_SCHEMA.md). |
| Tests fail with import errors | Run from `backend` with the venv: `..\.venv\Scripts\python.exe -m pytest`. |

Logs: `backend/logs/smartbus360.log` (rotating, 5 × 5 MB). The console window of `start_backend.bat` shows every request.
