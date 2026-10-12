# SMARTBUS 360 — ESP32 Hardware Integration Guide

This package is **software only**. This guide is the contract the separate ESP32 firmware must implement.
Full request/response details: `API_DOCUMENTATION.md §7`.

The bus RFID reader is used **only for the driver's ID card** (duty start / duty end). Students do not carry RFID cards.

## 1. Provision the device (once per bus)
1. Admin → **Buses & devices** → open the bus → *Associate ESP32 device ID* (e.g. `ESP32-BUS07`).
2. Copy the **device token** shown once (it is stored hashed and cannot be displayed again).
3. Put into the firmware configuration: server base URL (use the **IP address**, e.g. `http://192.168.1.50`),
   `DEVICE_ID`, `DEVICE_TOKEN`, `BUS_NUMBER` (exactly as registered, e.g. `07`).
4. Lost or replaced device → *Rotate token* or *Remove device* (old token stops working immediately).

## 2. Every HTTP request
```
X-Device-ID: ESP32-BUS07
Authorization: Bearer <DEVICE_TOKEN>
Content-Type: application/json
```
JSON body always contains `"bus_number"` and `"timestamp"` (epoch seconds, UTC). Set the clock with NTP right
after Wi-Fi connects (`configTime(0, 0, "pool.ntp.org")`), or from the GPS module's UTC time.

## 3. Recommended firmware loop
| When | Call | Notes |
|---|---|---|
| Boot / Wi-Fi (re)connect | `POST /api/device/register` | Read `config.capacity`, `alcohol_threshold`, intervals. |
| Every 30 s | `POST /api/device/heartbeat` | Report each component honestly: `gps` (`fix`/`no_fix`/`error`), `occupancy_sensor`, `alcohol_sensor` (`warming_up`/`ok`/`error`), `rfid_reader`, `lcd`, `buzzer`. Unreported components show **unknown** in dashboards. |
| Every 5 s while moving | `POST /api/device/gps` | Send `{"fix": false}` without satellite lock. Never send 0,0. |
| On count change (and ≥ every 60 s) | `POST /api/device/occupancy` | `occupied` must be 0…capacity. |
| Every 10–30 s | `POST /api/device/alcohol` | Send `sensor_state: "warming_up"` for the MQ-3 warm-up period (typically several minutes); raw 12-bit ADC (0–4095). |
| Driver card tap | `POST /api/device/rfid` | Unique `event_id` per tap. `event_type: "tap"` toggles duty. Show `lcd_line1/2`, beep per `buzzer` (`ok`/`deny`). Register the card UID in Admin → Buses (Driver RFID ID-card UID). |
| SOS button | `POST /api/device/sos` | Unique `event_id` per press. **Retry until 2xx** — duplicates are safely ignored. Include GPS if available. |
| Every ~5 s | `GET /api/device/commands` | Show `pickup_request` / `pickup_update` / `lcd_message` payloads; then ack each. `active_pickups` = full current list. |
| After handling a command | `POST /api/device/command-ack` | `{"command_id", "result": "ok"|"failed"}` — unacked commands are redelivered until they expire (30 min). |

Alternatively batch GPS + occupancy + alcohol + heartbeat in one `POST /api/device/telemetry`.

## 4. Offline buffering
If Wi-Fi drops, buffer SOS and driver-card events (with their original `timestamp` and `event_id`) and replay them in order
when connectivity returns; the server deduplicates by `event_id`. Readings older than 72 h are rejected.
GPS/occupancy readings can be dropped while offline — dashboards show them as *stale* automatically.

## 5. Response handling
* `2xx` success. `200` with `"duplicate": true` = already stored → do not retry.
* `401` → wrong/rotated token: stop and show `AUTH ERROR` on the LCD.
* `403 DEVICE_BUS_MISMATCH` → wrong `BUS_NUMBER` constant.
* `422` → the payload is invalid (do not retry the same payload); see `error.details`.
* `5xx` / network error → retry with backoff (1 s, 2 s, 4 s … max 30 s).

## 6. Bench test without firmware (PowerShell)
```powershell
$h = @{ "X-Device-ID"="ESP32-BUS07"; "Authorization"="Bearer <TOKEN>" }
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Invoke-RestMethod -Method Post -Uri http://bus.local/api/device/heartbeat -Headers $h -ContentType "application/json" `
  -Body (@{bus_number="07"; timestamp=$ts; components=@{gps="fix"; lcd="ok"}} | ConvertTo-Json)
Invoke-RestMethod -Method Get -Uri http://bus.local/api/device/commands -Headers $h
```
> These calls write **real** records for the bus (they are indistinguishable from hardware data). Use a test bus,
> or delete the database / restore a backup after bench testing. The software has no simulation mode.

## 7. What requires physical validation
GPS accuracy & fix behaviour, occupancy-sensor counting accuracy, MQ-3 calibration and threshold choice, RFID reader range and the
driver card UID format (4/7-byte), LCD/buzzer behaviour, SOS button debounce, Wi-Fi coverage along routes,
clock synchronisation, and power-loss behaviour — see README "Known limitations".
