# SMARTBUS 360 — API Documentation

Base URL: the address the server is reached at, e.g. `http://bus.local` (or `https://bus.local`).
All request and response bodies are JSON (`Content-Type: application/json`). Times are UTC ISO-8601 with `Z`.

> RFID is used **only for the bus driver's ID card** (duty start / duty end). Students do not carry RFID cards;
> their pickups are marked *Picked Up* by the bus console.

## 1. Conventions

### Error format
Every error uses the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "latitude: must be <= 90.0", "details": { "latitude": "must be <= 90.0" } } }
```

| HTTP | Typical codes |
|---|---|
| 400 | `INVALID_JSON`, `INVALID_CURRENT_PASSWORD` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `DEVICE_UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `CSRF_FAILED`, `PASSWORD_CHANGE_REQUIRED`, `ACCOUNT_DISABLED`, `WRONG_PORTAL`, `DEVICE_DISABLED`, `DEVICE_NOT_ASSIGNED`, `DEVICE_BUS_MISMATCH`, `DEVICE_ID_MISMATCH` |
| 404 | `NOT_FOUND`, `COMMAND_NOT_FOUND`, `NO_DEVICE` |
| 409 | `DUPLICATE_REGISTER_NUMBER`, `DUPLICATE_USERNAME`, `DUPLICATE_BUS_NUMBER`, `DUPLICATE_DRIVER_RFID`, `DUPLICATE_REGISTRATION`, `DUPLICATE_DEVICE`, `DEVICE_ALREADY_ASSIGNED`, `ACTIVE_REQUEST_EXISTS`, `NO_ASSIGNED_BUS`, `INVALID_TRANSITION`, `INVALID_STATE`, `STOP_IN_USE`, `COMMAND_EXPIRED` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `INVALID_COORDINATES`, `INVALID_TIMESTAMP`, `OCCUPANCY_OUT_OF_RANGE`, `WEAK_PASSWORD` |
| 429 | `TOO_MANY_ATTEMPTS` |
| 500 / 503 | `INTERNAL_ERROR` (details never leaked) / health degraded |

### Dashboard authentication (admin, student, bus)
1. `POST /api/auth/login` sets an HttpOnly session cookie and returns a `csrf_token`.
2. Send the cookie on every request (browsers do this automatically) and the header
   `X-CSRF-Token: <csrf_token>` on every `POST/PUT/DELETE`.
3. A user with `must_change_password: true` can only call `/api/auth/*` until they change it.

### Device authentication (ESP32)
Every `/api/device/*` request carries:
```
X-Device-ID: ESP32-BUS07
Authorization: Bearer <device token shown once when the admin associated the device>
Content-Type: application/json
```
Every data payload (everything except `GET /commands`) must also contain:
* `"bus_number"` — must equal the bus the device is assigned to (else `403 DEVICE_BUS_MISMATCH`)
* `"timestamp"` — epoch seconds, epoch milliseconds or ISO-8601 UTC. Rejected if > 5 min in the future or
  > 72 h old (`422 INVALID_TIMESTAMP`). Sync the ESP32 clock with NTP (`configTime`) or GPS time.

Optional: `"device_id"` in the body; if present it must equal `X-Device-ID`.

---

## 2. System

### `GET /api/health` (public)
```json
{ "status": "ok", "service": "SMARTBUS 360", "version": "1.0.0", "database": "ok", "server_time": "2026-10-09T06:30:00Z" }
```
Returns `503` with `"status": "degraded"` if the database is unreachable.

---

## 3. Authentication

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{"username","password","role"?}` | `role` (admin/student/bus) is optional; mismatch → `403 WRONG_PORTAL` with `details.role`. 5 failures / 15 min per IP+username → `429`. |
| POST | `/api/auth/logout` | – | Clears the session. |
| GET | `/api/auth/me` | – | `{"user":{…},"csrf_token":"…"}` or `401`. |
| POST | `/api/auth/change-password` | `{"current_password","new_password"}` | ≥ 8 chars, letters + digits, not the username, not the current one. Rotates the session and CSRF token; other sessions are signed out. |

Login response:
```json
{
  "user": { "id": 2, "username": "arun.kumar", "role": "student", "display_name": "Arun Kumar",
            "is_active": true, "must_change_password": true, "last_login_at": null, "student_id": 1 },
  "csrf_token": "x3F…"
}
```

### `GET /api/notifications` (any signed-in user) / `POST /api/notifications/read` `{"ids":[1,2]}` (omit `ids` = all)

---

## 4. Admin API (`role = admin`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/overview` | KPIs + chart data (all from DB) |
| GET | `/api/admin/students?q=&bus_id=&active=true\|false` | List / search / filter |
| POST | `/api/admin/students` | Create student account (returns one-time credentials) |
| GET | `/api/admin/students/{id}` | Detail + bus assignment history + pickup history + last shared location |
| PUT | `/api/admin/students/{id}` | Partial update (any field below, plus `is_active`) |
| POST | `/api/admin/students/{id}/reset-password` | Random temporary password (shown once) |
| GET | `/api/admin/buses` | Buses with live status |
| POST | `/api/admin/buses` | Create bus account (+ optional `device_id`) |
| GET | `/api/admin/buses/{id}` | Detail: live status, occupancy & alcohol history, SOS history, students |
| PUT | `/api/admin/buses/{id}` | Partial update (route, capacity, threshold, active…) |
| POST | `/api/admin/buses/{id}/reset-password` | Random temporary password |
| POST | `/api/admin/buses/{id}/device` | Associate ESP32 `{"device_id"}` → one-time token |
| POST | `/api/admin/buses/{id}/device/rotate-token` | New token; old one stops working |
| DELETE | `/api/admin/buses/{id}/device` | Detach and disable device |
| POST | `/api/admin/buses/{id}/lcd-message` | `{"line1","line2"?,"duration_s"?}` queue LCD text |
| GET/POST | `/api/admin/routes` | List / create `{"name","description"?}` |
| PUT | `/api/admin/routes/{id}` | Rename / describe / activate |
| POST | `/api/admin/routes/{id}/stops` | `{"name","sequence"?,"latitude"?,"longitude"?}` |
| PUT / DELETE | `/api/admin/stops/{id}` | Edit / delete (409 if students use it) |
| GET | `/api/admin/fleet` | Every bus with live status + route + active pickups (map) |
| GET | `/api/admin/pickup-requests?status=active\|pending…&bus_id=` | All pickup requests |
| GET | `/api/admin/incidents?status=open\|active\|acknowledged\|resolved&type=&bus_id=` | Incidents |
| POST | `/api/admin/incidents/{id}/acknowledge` | `{"note"?}` |
| POST | `/api/admin/incidents/{id}/resolve` | `{"resolution_notes"}` (required, ≥3 chars) |
| GET | `/api/admin/reports?type=…&from=YYYY-MM-DD&to=…&bus_id=&route_id=&incident_type=&format=csv` | Reports |
| GET | `/api/admin/audit-logs?action=prefix` | Latest 300 audit entries |

Report `type`: `students`, `buses`, `driver_duty`, `pickups`, `occupancy`, `device_status`, `sos`, `alcohol`.
Without `format=csv` the response is `{"type","columns","rows","count"}`.

### Create student
```http
POST /api/admin/students
X-CSRF-Token: …
{ "full_name": "Arun Kumar", "register_number": "21EC045", "department": "ECE", "year": 3,
  "phone": "9123456780", "bus_id": 1, "boarding_stop_id": 2, "destination_stop_id": 5,
  "username": "optional-override" }
```
`201`:
```json
{ "student": { "id": 1, "full_name": "Arun Kumar", "register_number": "21EC045", "username": "arun.kumar",
               "bus": {"id":1,"bus_number":"07","route_id":1,"route_name":"Route 1"}, "...": "..." },
  "credentials": { "username": "arun.kumar", "initial_password": "SB@21EC045",
                   "notice": "Shown once. The student must change this password at first login." } }
```
Rules: see `DATABASE_SCHEMA.md → Account rules`. Duplicates → `409`.
Stops must belong to the assigned bus's route (`422`).

### Create bus
```json
{ "bus_number": "07", "registration_number": "TN 38 AB 1207", "driver_name": "Ravi Kumar",
  "driver_phone": "9876543210", "capacity": 40, "route_id": 1, "alcohol_threshold": 2000, "device_id": "ESP32-BUS07",
  "driver_rfid_uid": "D1:A2:B3:C4" }
```
`driver_rfid_uid` (optional, also editable with `PUT`) is the driver's ID-card UID, normalised to uppercase hex and unique across buses (`409 DUPLICATE_DRIVER_RFID`).

`201` → `bus`, `credentials` (`bus_07` / `Bus@07#360`), and `device` `{ "device_id", "device_token", "notice" }` when `device_id` was given.

---

## 5. Student API (`role = student`)
The student is always taken from the session; IDs in the body are never trusted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/student/profile` | Profile, bus, route with stops |
| POST | `/api/student/location` | `{"latitude","longitude","accuracy_m"?}` share phone GPS |
| GET | `/api/student/pickup-requests` | Own requests with status history |
| POST | `/api/student/pickup-requests` | Create (see below) |
| POST | `/api/student/pickup-requests/{id}/cancel` | `{"reason"?}` own request only |
| GET | `/api/student/bus-status` | Assigned bus location, occupancy, freshness, route |
| GET | `/api/student/alerts` | Incidents on own bus, last 30 days (public view) |

### Create pickup request
GPS (with optional stop):
```json
{ "latitude": 11.0085, "longitude": 76.9772, "accuracy_m": 14, "boarding_stop_id": 2, "note": "Near the bakery" }
```
Stop only (coordinates come from the configured stop): `{ "boarding_stop_id": 2 }`

`201`:
```json
{ "pickup_request": { "id": 12, "student_name": "Arun Kumar", "bus_number": "07", "latitude": 11.0085, "longitude": 76.9772,
  "location_source": "phone_gps", "boarding_stop_name": "Lakshmi Mills", "status": "pending", "status_label": "Pending",
  "created_at": "2026-10-09T06:40:16Z", "history": [{ "from_status": null, "to_status": "pending", "changed_by": "student", "at": "…" }] },
  "message": "Pickup request saved and sent to your bus." }
```
Each request is its own row; a student may have one active (pending/accepted/approaching) request at a time (`409 ACTIVE_REQUEST_EXISTS`).
The request is immediately visible to the assigned bus, admins, and the ESP32 command queue.

### Bus status (no hardware data yet)
```json
{ "assigned": true, "bus": {"id":1,"bus_number":"07", "...": "..."},
  "location": { "available": false, "state": "no_data", "message": "Bus location not available yet." },
  "occupancy": { "available": false, "state": "no_data", "capacity": 40, "occupied": null, "available_seats": null,
                 "message": "Waiting for hardware data" } }
```
`location.state` ∈ `live | stale | no_data`; `occupancy.state` ∈ `live | stale | sensor_error | no_data`.

---

## 6. Bus API (`role = bus`) — only the bus linked to the signed-in account

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bus/overview` | Bus, route, live summary, active pickups, open incidents |
| GET | `/api/bus/location` | GPS + device + route |
| GET | `/api/bus/pickup-requests?scope=active\|all` | Own bus requests only |
| POST | `/api/bus/pickup-requests/{id}/status` | `{"status":"accepted\|approaching\|picked_up\|cancelled","reason"?}` |
| GET | `/api/bus/occupancy` | Current + last 120 readings |
| GET | `/api/bus/alcohol-status` | Current, history, warnings (with disclaimer) |
| GET | `/api/bus/alerts` | Incidents of this bus |
| POST | `/api/bus/incidents` | `{"incident_type":"sos\|breakdown\|medical\|other","description"?}` |
| GET | `/api/bus/driver-duty` | Driver duty status + latest 200 driver card taps |
| GET | `/api/bus/device` | Device + component status |
| POST | `/api/bus/lcd-message` | `{"line1","line2"?,"duration_s"?}` |

Pickup transitions: `pending → accepted | cancelled`, `accepted → approaching | picked_up | cancelled`,
`approaching → picked_up | cancelled`. Anything else → `409 INVALID_TRANSITION`. A bus must give a `reason` to cancel.
A request on another bus returns `404` (existence is not revealed).

---

## 7. Device (ESP32) API

### `POST /api/device/register`
Call once after boot/Wi-Fi connect.
```json
{ "bus_number": "07", "timestamp": 1791527400, "firmware_version": "1.0.3" }
```
`200`:
```json
{ "ok": true, "device_id": "ESP32-BUS07",
  "config": { "bus_number": "07", "capacity": 40, "alcohol_threshold": 2000, "heartbeat_interval_s": 30,
              "command_poll_interval_s": 5, "gps_interval_s": 5, "server_time": "2026-10-09T06:30:00Z" } }
```

### `POST /api/device/heartbeat` (every 30 s)
```json
{ "bus_number": "07", "timestamp": 1791527400, "uptime_s": 3600, "rssi_dbm": -61, "free_heap": 182000,
  "firmware_version": "1.0.3",
  "components": { "gps": "fix", "occupancy_sensor": "ok", "alcohol_sensor": "warming_up", "rfid_reader": "ok", "lcd": "ok", "buzzer": "ok" },
  "error": null }
```
Component values are short lowercase words (`ok`, `error`, `fix`, `no_fix`, `warming_up`, `degraded`…). The dashboard shows
`unknown` for any component the firmware never reports — LCD/buzzer are never assumed to work.
`200 {"ok": true, "stored": true, "heartbeat_id": 81, "config": {…}}`. A device is **online** while its last
authenticated request is younger than `DEVICE_OFFLINE_SECONDS` (default 90 s).

### `POST /api/device/gps`
```json
{ "bus_number": "07", "timestamp": 1791527405, "fix": true, "latitude": 11.018312, "longitude": 76.972501,
  "speed_kmh": 32.5, "heading_deg": 87.0, "satellites": 9, "hdop": 0.9 }
```
`201 {"ok":true,"stored":true,"location_id":512}`. Without satellite lock send `{"fix": false}` → `200 {"stored": false, "reason":"no_fix"}`.
`0,0`, out-of-range or non-numeric coordinates → `422`.

### `POST /api/device/occupancy`
```json
{ "bus_number": "07", "timestamp": 1791527410, "occupied": 23, "sensor_status": "ok" }
```
`201 {"ok":true,"stored":true,"reading_id":40,"available_seats":17}`.
`occupied > capacity` → `422 OCCUPANCY_OUT_OF_RANGE` (never stored; recorded as the device's last error).
`sensor_status` ∈ `ok | degraded | error`; with `error`, `occupied` may be omitted (status only).

### `POST /api/device/alcohol`
```json
{ "bus_number": "07", "timestamp": 1791527412, "sensor_state": "ok", "raw_adc": 1180 }
```
`sensor_state` ∈ `warming_up | ok | error`; `raw_adc` 0–4095 required when `ok`.
Server status: `warming_up`, `sensor_error`, `warning` (raw ≥ bus threshold) or `normal`. Response:
`201 {"ok":true,"stored":true,"reading_id":9,"status":"normal","threshold":2000}`.
Raw MQ-3 values are indicative only and are **not** blood-alcohol measurements.

### `POST /api/device/rfid` — driver ID card
Sent when a card is tapped on the bus RFID reader. Only the card registered as this bus's driver card is accepted.
```json
{ "bus_number": "07", "timestamp": 1791527420, "card_uid": "D1:A2:B3:C4", "event_id": "drv-000123", "event_type": "tap" }
```
`event_type`: `tap` (default — toggles duty start/end), or explicit `duty_start` / `duty_end`.
`201`:
```json
{ "ok": true, "duplicate": false, "driver_event_id": 12, "authorized": true, "result": "authorized",
  "action": "duty_start", "driver_name": "Ravi Kumar", "lcd_line1": "DUTY STARTED", "lcd_line2": "Ravi Kumar", "buzzer": "ok" }
```
`result` ∈ `authorized | unknown_card | other_bus_driver`. Rejected cards get `"buzzer": "deny"`, `"lcd_line1": "CARD REJECTED"`,
are stored for audit and notify admins + the bus console. Same `event_id` again → `200 "duplicate": true`.

### `POST /api/device/sos`
```json
{ "bus_number": "07", "timestamp": 1791527430, "event_id": "sos-000045", "sos_type": "sos",
  "latitude": 11.0183, "longitude": 76.9725, "message": "Button pressed" }
```
`sos_type` ∈ `sos | breakdown | medical | other` (default `sos`). `201` with `incident_id`, `incident`, and LCD lines.
Same `event_id` again → `200 "duplicate": true` (retry-safe). An SOS is **never rejected** because of bad GPS or clock:
invalid coordinates are dropped (the last known bus GPS ≤ 5 min old is attached instead, marked `last_known_gps`)
and an invalid timestamp is stored as `null`.

### `POST /api/device/telemetry` (combined)
```json
{ "bus_number": "07", "timestamp": 1791527440,
  "gps": { "latitude": 11.02, "longitude": 76.97, "speed_kmh": 30 },
  "occupancy": { "occupied": 24 },
  "alcohol": { "raw_adc": 900 },
  "heartbeat": { "uptime_s": 3700, "components": { "gps": "fix" } } }
```
Each section is validated independently. `201` all stored; `207` some rejected; `422` none stored.
```json
{ "ok": false, "results": { "gps": {"stored": true, "location_id": 513} }, "errors": { "occupancy": {"code":"OCCUPANCY_OUT_OF_RANGE","message":"…"} } }
```

### `GET /api/device/commands` (poll every ~5 s)
```json
{ "bus_number": "07", "server_time": "2026-10-09T06:31:00Z",
  "commands": [
    { "command_id": 31, "type": "pickup_request", "status": "delivered", "delivery_count": 1,
      "payload": { "pickup_id": 12, "status": "pending", "student_name": "Arun Kumar", "boarding_stop": "Lakshmi Mills",
                   "latitude": 11.0085, "longitude": 76.9772, "lcd_line1": "PICKUP PENDING", "lcd_line2": "Arun Kum@Lakshmi" } },
    { "command_id": 32, "type": "lcd_message", "payload": { "line1": "Delay 10 min", "line2": "Traffic", "duration_s": 15 } } ],
  "active_pickups": [ { "pickup_id": 12, "status": "pending", "student_name": "Arun Kumar", "boarding_stop": "Lakshmi Mills", "...": "..." } ] }
```
Command types: `pickup_request` (new), `pickup_update` (status change), `lcd_message`.
Commands are redelivered on every poll until acknowledged; they expire after `COMMAND_EXPIRY_MINUTES` (30).
`active_pickups` is always the full current list, so the device can rebuild its display after a reboot.

### `POST /api/device/command-ack`
```json
{ "bus_number": "07", "timestamp": 1791527465, "command_id": 31, "result": "ok", "message": "shown on LCD" }
```
`result` ∈ `ok | failed`. Idempotent. Another device's command → `404`.

---

## 8. Real-time events (Socket.IO, path `/socket.io`)
Browsers connect with the session cookie; unauthenticated connections are refused. The server assigns rooms —
clients cannot join rooms themselves.

| Event | Admin | Bus account (own bus) | Students of that bus | Requesting student |
|---|---|---|---|---|
| `bus_location_updated` | ✓ | ✓ | ✓ | |
| `occupancy_updated` | ✓ | ✓ | ✓ | |
| `pickup_request_created` / `pickup_request_updated` | ✓ (with register no.) | ✓ | | ✓ (own only) |
| `student_location_updated` | ✓ | | | |
| `alcohol_updated` / `alcohol_warning` | ✓ | ✓ | | |
| `sos_created` / `sos_acknowledged` / `sos_updated` | ✓ | ✓ | ✓ (public view) | |
| `device_status_updated` | ✓ | ✓ | | |
| `driver_rfid_event` | ✓ | ✓ | | |
| `notification` | own | own | own | own |

Events are emitted only after the database commit. Dashboards reload persisted data on each event and after every
reconnect, so realtime updates never create duplicate records.

## 9. cURL quick test
```bash
curl http://bus.local/api/health
curl -X POST http://bus.local/api/device/heartbeat \
  -H "X-Device-ID: ESP32-BUS07" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d "{\"bus_number\":\"07\",\"timestamp\":$(date +%s),\"components\":{\"gps\":\"fix\"}}"
```
(Windows PowerShell: use `Invoke-RestMethod`, see `HARDWARE_INTEGRATION.md`.)
