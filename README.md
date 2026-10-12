# SMARTBUS 360 — Intelligent College Bus Management, Live Tracking and Student Safety System

One server on the campus LAN runs a **Flask + Socket.IO** backend with a **SQLite** database and serves three
**React** dashboards. ESP32 units on each bus report GPS, seat occupancy, MQ-3 alcohol readings and
SOS presses through authenticated REST APIs; everything appears live on the dashboards.

| Address | Who |
|---|---|
| `http://bus.local/admin` | Transport office — fleet map, students, buses & devices, routes, pickups, emergencies, reports, audit log |
| `http://bus.local/student` | Students — live bus map, phone-GPS pickup requests, seats, safety alerts |
| `http://bus.local/bus` | Bus console — live pickups (accept / approaching / picked up / cancel), seats, alcohol monitor, driver duty (ID card), SOS, hardware |
| `http://bus.local/api/health` | Health check |

> Software only — the ESP32 firmware is separate. The API contract it must follow is in
> `docs/API_DOCUMENTATION.md` and `docs/HARDWARE_INTEGRATION.md`. No figure on any dashboard is invented:
> without hardware data the UI says *Waiting for hardware data* / *Sensor offline* / *Bus location not available*.

## Stack
Frontend: React 18, Vite 5, TypeScript (strict), Tailwind CSS, Lucide icons, Recharts, Leaflet 1.9.4 + React-Leaflet 4 (OpenStreetMap, no API key), socket.io-client.
Backend: Python 3.11+, Flask 3, Flask-SocketIO, Flask-CORS (restricted), SQLAlchemy 2, SQLite (WAL), Flask-Migrate/Alembic, pytest.

## Project structure
```
SMARTBUS360_SOFTWARE/
├── README.md  .env.example  .gitignore
├── backend/
│   ├── app/
│   │   ├── __init__.py          application factory, security headers, Socket.IO origin policy
│   │   ├── extensions.py        db, migrate, socketio
│   │   ├── models/              users.py fleet.py tracking.py system.py (19 tables)
│   │   ├── auth/core.py         password hashing, sessions, CSRF, rate limit, role & device auth
│   │   ├── routes/              auth admin student bus device notifications system spa
│   │   ├── services/            accounts pickups telemetry commands status analytics reports
│   │   │                        realtime notifications audit monitor mdns serializers tx
│   │   ├── sockets/             authenticated connect + role-aware rooms
│   │   └── utils/               validation errors time
│   ├── migrations/              Alembic (initial schema, student-RFID removal, driver ID card)
│   ├── tests/                   54 pytest tests
│   ├── config.py  run.py  init_db.py  seed_admin.py  generate_cert.py  requirements.txt
├── frontend/
│   ├── package.json  vite.config.ts  tailwind.config.js  index.html  public/favicon.svg
│   ├── dist/                    pre-built production dashboards (rebuilt by setup)
│   └── src/
│       ├── App.tsx main.tsx
│       ├── components/          ui kit, DataTable, Toast, NotificationCenter, StatusBadges, SeatGauge, Logo …
│       ├── dashboards/admin|student|bus/
│       ├── layouts/AppLayout.tsx  maps/  pages/  services/  hooks/  styles/
├── docs/   API_DOCUMENTATION  DATABASE_SCHEMA  NETWORK_SETUP  SECURITY  TESTING  TROUBLESHOOTING  HARDWARE_INTEGRATION
└── scripts/ setup_windows  create_admin  start_backend  start_frontend  start_all  build_frontend
             backup_database  restore_database  run_tests  generate_https_cert  configure_firewall  add_hosts_entry (.bat)
             db_backup.py
```

## Quick start (Windows 10/11)
Prerequisites: **Python 3.11+** (python.org, tick *Add python.exe to PATH*) and **Node.js 20 LTS+**.
Extract the ZIP to e.g. `C:\SMARTBUS360_SOFTWARE`, then:

```bat
scripts\setup_windows.bat          :: venv, requirements, .env with random SECRET_KEY, database, npm install, build
scripts\create_admin.bat           :: first administrator (interactive, password never stored in plain text)
scripts\start_all.bat              :: starts the server and opens http://localhost/login
```

### Same steps as exact PowerShell commands
```powershell
cd C:\SMARTBUS360_SOFTWARE
# 1-2. Create and activate the virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# 3. Backend requirements
pip install -r backend\requirements.txt
# configuration (then put a long random value in SECRET_KEY)
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"
# 4. Initialise the database (Alembic migrations)
python backend\init_db.py
# 5. First admin account
python backend\seed_admin.py
# 6. Frontend dependencies
cd frontend; npm ci; cd ..
# 13. Production build of the dashboards (served by Flask)
cd frontend; npm run build; cd ..
# 7. Start Flask (+ Socket.IO + dashboards) on PORT from .env (default 80)
python backend\run.py
# 8. (development only) React dev server with hot reload, in a second window
cd frontend; npm run dev               # http://<server-ip>:5173, proxies /api and /socket.io
# 11. Health check
Invoke-RestMethod http://localhost/api/health
# 12. Backend tests
cd backend; python -m pytest -v; cd ..
```

**9. Shared server URL.** Recommended: leave `VITE_API_BASE_URL` empty — the dashboards then call the API on the
same address they were loaded from, so `http://bus.local`, `http://192.168.1.50` or `https://bus.local` all work from
laptops and phones with no rebuild. Set `VITE_API_BASE_URL` (in `frontend\.env`, then rebuild) only if the API is on
a different host. Backend address/port: `HOST`, `PORT`, `PUBLIC_BASE_URL` in `.env`.

**10. bus.local.** Fixed server IP + firewall + one of router DNS / mDNS (`MDNS_ENABLED=true`) / hosts file —
step-by-step in **`docs/NETWORK_SETUP.md`**. The IP address always works as a fallback.

## Admin account initialisation
`scripts\create_admin.bat` (or `python backend\seed_admin.py`) asks for username, display name and password
(≥ 8 chars, letters + digits). Non-interactive: `python backend\seed_admin.py --username admin --name "Transport Office" --password-stdin < pw.txt`.
There are no default credentials. Create more admins the same way.

## First-day workflow
1. **Routes & Stops** → create a route, add stops (click the map to fill coordinates).
2. **Buses & Devices** → add buses (route, capacity, alcohol threshold, driver ID-card UID, ESP32 device ID). Save the one-time
   credentials: bus login `bus_<number>` / `Bus@<NUMBER>#360`, and the **device token** for the firmware.
3. **Students** → add students (bus, boarding/destination stop). Login `firstname.lastname` / `SB@<REGISTER NO>`.
4. Everyone changes their initial password at first sign-in.

## Hardware API integration (separate ESP32 firmware)
Headers `X-Device-ID` + `Authorization: Bearer <token>`; JSON with `bus_number` + `timestamp`. Endpoints:
`register, heartbeat, gps, occupancy, alcohol, rfid (driver card), sos, telemetry, commands (GET), command-ack` under `/api/device/`.
Pickup requests and LCD messages reach the bus through `GET /api/device/commands`. See `docs/HARDWARE_INTEGRATION.md`.

> **RFID = driver ID card only.** Each bus's driver taps an ID card on the bus RFID reader to start/end duty
> (Bus console → *Driver Duty*; card UID set in Admin → Buses). Students do not carry RFID cards, so there is no
> student RFID field or attendance module.
> "Students onboard" on the admin overview is the passenger count reported by each bus's occupancy sensor.

## Features at a glance
* Live Leaflet maps (admin fleet, student, bus) with route lines, stops, legend, fit/refresh, GPS freshness and staleness warnings.
* Pickup lifecycle Pending → Accepted → Approaching → Picked Up / Cancelled with full history, notifications and the ESP32 command queue
  (the bus crew marks *Picked Up*).
* Hardware-only seat occupancy (rejects counts above capacity), MQ-3 monitoring with configurable threshold and
  explicit non-BAC disclaimer, SOS with duplicate-safe event IDs and never-rejected SOS delivery.
* Device online/offline monitor, component status exactly as reported (LCD/buzzer never assumed).
* Role-aware Socket.IO rooms, reload-on-reconnect, offline banner, toasts, notification center.
* Reports (CSV) for students, buses, driver duty, pickups, occupancy, device uptime, SOS, alcohol warnings; audit log.
* Light/dark mode, responsive (phone bottom navigation for students and bus crew), accessible forms and dialogs.

## Testing
54 backend tests pass; TypeScript and production build succeed; a headless-browser end-to-end run verified live
updates across the three dashboards. Details and the actual output: **`docs/TESTING.md`**.

## Known limitations (need physical validation)
* **ESP32 firmware is not included**; every hardware path was tested by calling the device API directly, not with real sensors.
* GPS accuracy/fix behaviour, occupancy-sensor counting accuracy, RFID reader range / driver card UID format, LCD and buzzer
  behaviour, SOS button debounce and power-loss behaviour must be validated on the bus.
* MQ-3 readings need calibration on the actual sensor (warm-up time, temperature/humidity drift) before choosing the
  threshold; they are indicative only, never proof of intoxication.
* Wi-Fi/4G coverage along the routes and the network path from moving buses to the server (VPN recommended) must be designed per campus.
* Device clocks must be NTP/GPS-synchronised; readings > 5 min in the future or > 72 h old are rejected (SOS excepted).
* Phone GPS in browsers requires HTTPS (or `localhost`); on plain HTTP students can still request pickups by stop.
* Map tiles come from OpenStreetMap and need internet on the viewing device; heavy use should use a self-hosted tile server.
* The built-in server suits a campus LAN; use a reverse proxy + service wrapper for larger deployments (see SECURITY.md).
* `.bat` scripts were written for Windows 10/11 but were not executed in the build environment (Linux); the underlying commands were.
"# SMARTBUS-360-IoT-Based-Intelligent-Bus-Tracking-and-Passenger-Safety" 
"# SMARTBUS-360-Intelligent-College-Bus-Management-Live-Tracking-and-Student-Safety-System" 
