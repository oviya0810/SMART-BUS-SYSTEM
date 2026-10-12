# SMARTBUS 360 — Database Schema

Engine: **SQLite** (file `backend/instance/smartbus360.db` by default) via **SQLAlchemy 2** and **Flask-Migrate/Alembic**.
On every connection the server enables `PRAGMA foreign_keys=ON`, `journal_mode=WAL` and a 30 s busy timeout.
All timestamps are stored as UTC. Tables with `created_at/updated_at` maintain them automatically.

## Entity overview

```
users 1─1 students ──< student_bus_assignments >── buses 1─1 device_registry ──< device_heartbeats
  │          │                                       │  └─ routes ──< route_stops      └──< device_commands
  │          ├──< pickup_requests ──< pickup_status_history
  │          ├──< student_locations                  ├──< bus_locations
  │          │                                       ├──< occupancy_readings
  ├──< notifications                                 ├──< alcohol_readings
  └──< audit_logs                                    └──< sos_incidents
```

## Tables

| Table | Key columns | Constraints / indexes |
|---|---|---|
| `users` | id, username, password_hash (scrypt), role, display_name, is_active, must_change_password, session_version, last_login_at | `username` UNIQUE; CHECK role ∈ admin/student/bus |
| `students` | id, user_id → users, full_name, register_number, department, year, phone, boarding_stop_id → route_stops, destination_stop_id → route_stops | `user_id` UNIQUE, `register_number` UNIQUE; CHECK year 1–6; stop FKs `ON DELETE SET NULL` |
| `student_bus_assignments` | student_id, bus_id, is_active, assigned_at, ended_at, assigned_by_user_id | partial UNIQUE index: one active assignment per student; full history kept |
| `routes` | name, description, is_active | `name` UNIQUE |
| `route_stops` | route_id, name, sequence, latitude, longitude | UNIQUE(route_id, name); cascade delete with route |
| `buses` | bus_number, registration_number, route_id, driver_name, driver_phone, capacity, user_id, is_active, alcohol_threshold, driver_rfid_uid | `bus_number`, `registration_number`, `user_id`, `driver_rfid_uid` UNIQUE; CHECK 0 < capacity ≤ 150 |
| `driver_rfid_events` | bus_id, device_pk, device_event_id, card_uid, result, action (duty_start/duty_end), driver_name snapshot, device_timestamp, received_at | UNIQUE(device_pk, device_event_id) → duplicate-safe; CHECK result |
| `device_registry` | device_id, bus_id, token_hash (SHA-256), is_active, firmware_version, last_seen_at, component statuses, last_error | `device_id` UNIQUE, `bus_id` UNIQUE |
| `device_heartbeats` | device_pk, bus_id, received_at, device_timestamp, uptime_s, rssi_dbm, free_heap, statuses (JSON), error_message | index on received_at |
| `device_commands` | device_pk, bus_id, command_type, payload (JSON), status, pickup_request_id, expires_at, delivered_at, delivery_count, acked_at | CHECK status ∈ pending/delivered/acknowledged/failed/expired |
| `pickup_requests` | student_id, bus_id, latitude, longitude, location_source, accuracy, boarding_stop_id, boarding_stop_name, note, status, cancel_reason, accepted_at, picked_up_at, closed_at | CHECK status; index (bus_id, status) |
| `pickup_status_history` | pickup_request_id, from_status, to_status, changed_by_type, changed_by_user_id, reason, created_at | every transition recorded |
| `student_locations` | student_id, latitude, longitude, accuracy_m, recorded_at | |
| `bus_locations` | bus_id, device_pk, lat/lng, speed, heading, satellites, hdop, device_timestamp, received_at | index (bus_id, received_at) |
| `occupancy_readings` | bus_id, device_pk, occupied, capacity, sensor_status, device_timestamp, received_at | CHECK 0 ≤ occupied ≤ capacity |
| `alcohol_readings` | bus_id, device_pk, raw_adc, threshold, status, device_timestamp, received_at | CHECK status |
| `sos_incidents` | bus_id, device_pk, event_id, incident_type, source, description, lat/lng, location_source, status, ack/resolve user+time, resolution_notes | UNIQUE(bus_id, event_id) → duplicate-safe; CHECK type & status |
| `notifications` | user_id, category, severity, title, message, entity, is_read | |
| `audit_logs` | actor_type, actor_user_id, actor_label, action, entity_type, entity_id, details (JSON, secrets redacted), ip_address, created_at | append-only |

Hardware readings are never overwritten — every reading is a new row, and dashboards show the latest one with its age.

Migration `8c7964224a57_remove_rfid` drops the former `rfid_cards` / `rfid_events` tables and the
`device_registry.rfid_reader_status` column (students do not use RFID cards). Migration `4396db8271a7_driver_rfid_duty`
adds the driver ID-card feature: `buses.driver_rfid_uid`, `driver_rfid_events` and `device_registry.rfid_reader_status`.
`init_db.py` applies all migrations automatically.

## Account rules
| Account | Username | Initial password |
|---|---|---|
| Student | `firstname.lastname` from the full name (ASCII, lowercase, max 24 chars). Collision → numeric suffix: `arun.kumar`, `arun.kumar2`, … Admin may override. | `SB@` + register number in uppercase, e.g. `SB@21EC045` |
| Bus | `bus_` + bus number letters/digits in lowercase: `07` → `bus_07`, `TN38-1234` → `bus_tn381234`. Collision → suffix. | `Bus@` + bus number letters/digits uppercase + `#360`, e.g. `Bus@07#360` |
| Admin | chosen in `seed_admin.py` | chosen interactively (never hardcoded) |

* Passwords are hashed immediately (Werkzeug scrypt); plaintext is returned **once** in the creation response only.
* Every student/bus account has `must_change_password = true`; the API refuses everything except the password change until done.
* Admin resets generate a random 12-character temporary password and sign the user out everywhere (`session_version` bump).
* Duplicate register numbers, usernames, bus numbers, registration numbers and device IDs are rejected with `409`.

## Initialisation and migrations
```powershell
.\.venv\Scripts\python.exe backend\init_db.py     # creates/upgrades the DB (alembic upgrade head)
.\.venv\Scripts\python.exe backend\seed_admin.py  # first administrator
```
After changing models:
```powershell
cd backend
..\.venv\Scripts\flask.exe --app run db migrate -m "describe change"
..\.venv\Scripts\flask.exe --app run db upgrade
```
Migrations use Alembic *batch mode*, required for SQLite `ALTER TABLE`. Always back up before upgrading.

## Backup / restore
```powershell
scripts\backup_database.bat                                  # consistent online backup -> backups\
scripts\restore_database.bat backups\smartbus360_20261009_183000.db   # server must be stopped
```
Backups use SQLite's online backup API and are integrity-checked; a restore keeps a safety copy of the current DB.
