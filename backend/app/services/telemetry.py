"""Hardware data ingestion.

Each data type has a pure ``parse_*`` step (validation only, no DB writes) and
an ``apply_*`` step that persists the reading. The combined /telemetry
endpoint validates every section first so one bad section never corrupts the
others.
"""
from __future__ import annotations

import re
import uuid
from datetime import timedelta

from flask import current_app

from ..extensions import db
from ..models import (
    AlcoholReading,
    Bus,
    BusLocation,
    DriverRFIDEvent,
    DeviceHeartbeat,
    DeviceRegistry,
    OccupancyReading,
    SOSIncident,
)
from ..utils.errors import ApiError
from ..utils.time import iso, parse_timestamp, utcnow
from ..utils.validation import (
    EVENT_ID_RE,
    fail,
    normalize_uid,
    req_bool,
    req_choice,
    req_float,
    req_int,
    req_str,
    validate_coordinates,
)
from . import realtime
from .audit import log_audit
from .notifications import NotificationBatch, admin_user_ids, bus_student_user_ids, bus_user_ids
from .serializers import INCIDENT_LABELS, driver_event_dict, incident_dict, incident_public_dict
from .status import (
    alcohol_status,
    device_status,
    driver_duty_status,
    latest_alcohol,
    latest_duty_event,
    latest_location,
    occupancy_status,
)
from .tx import defer

COMPONENT_RE = re.compile(r"^[a-z_]{1,24}$")
COMPONENTS = ("gps", "occupancy_sensor", "alcohol_sensor", "rfid_reader", "lcd", "buzzer")
COMPONENT_COLUMNS = {
    "gps": "gps_status",
    "occupancy_sensor": "occupancy_sensor_status",
    "alcohol_sensor": "alcohol_sensor_status",
    "rfid_reader": "rfid_reader_status",
    "lcd": "lcd_status",
    "buzzer": "buzzer_status",
}


# ---------------------------------------------------------------- identity & time
def verify_identity(data: dict, device: DeviceRegistry, bus: Bus) -> None:
    """Every payload must name the bus it belongs to; it must match the device's assignment."""
    bus_number = data.get("bus_number")
    if not isinstance(bus_number, str) or not bus_number.strip():
        fail("bus_number", "is required and must match the bus this device is assigned to")
    if re.sub(r"\s+", " ", bus_number.strip()).upper() != bus.bus_number:
        raise ApiError(403, "DEVICE_BUS_MISMATCH",
                       "This device is not authorized to report data for that bus.", {"bus_number": "mismatch"})
    body_device = data.get("device_id")
    if body_device is not None and body_device != device.device_id:
        raise ApiError(403, "DEVICE_ID_MISMATCH", "device_id in body does not match the X-Device-ID header.")


def parse_device_timestamp(data: dict, key: str = "timestamp", lenient: bool = False):
    raw = data.get(key)
    cfg = current_app.config
    if raw is None:
        if lenient:
            return None
        fail(key, "is required (epoch seconds/ms or ISO-8601 UTC; sync the ESP32 clock with NTP or GPS)")
    try:
        ts = parse_timestamp(raw)
    except (ValueError, OverflowError, OSError):
        if lenient:
            return None
        fail(key, "is not a valid timestamp", code="INVALID_TIMESTAMP")
    now = utcnow()
    if ts > now + timedelta(seconds=cfg["DEVICE_MAX_FUTURE_SKEW_SECONDS"]):
        if lenient:
            return None
        fail(key, "is in the future — check the device clock", code="INVALID_TIMESTAMP")
    if ts < now - timedelta(hours=cfg["DEVICE_MAX_PAST_AGE_HOURS"]):
        if lenient:
            return None
        fail(key, "is too old — check the device clock", code="INVALID_TIMESTAMP")
    return ts


def _note_device_error(device: DeviceRegistry, message: str) -> None:
    device.last_error = message[:255]
    device.last_error_at = utcnow()


def mark_device_seen(device: DeviceRegistry) -> None:
    """Called on every authenticated device request; emits when a device comes back online."""
    if not device.reported_online:
        device.reported_online = True
        bus_id = device.bus_id
        defer(lambda: realtime.emit_device_status(bus_id, {"bus_id": bus_id, **device_status(device.bus)})
              if device.bus else None)


# ---------------------------------------------------------------- GPS
def parse_gps(data: dict) -> dict:
    fix = req_bool(data, "fix", required=False, default=True)
    if not fix:
        return {"fix": False}
    lat, lng = validate_coordinates(data.get("latitude"), data.get("longitude"))
    return {
        "fix": True,
        "latitude": lat,
        "longitude": lng,
        "speed_kmh": req_float(data, "speed_kmh", min_value=0, max_value=250, required=False),
        "heading_deg": req_float(data, "heading_deg", min_value=0, max_value=360, required=False),
        "satellites": req_int(data, "satellites", min_value=0, max_value=64, required=False),
        "hdop": req_float(data, "hdop", min_value=0, max_value=99.9, required=False),
    }


def apply_gps(device: DeviceRegistry, bus: Bus, parsed: dict, ts) -> dict:
    now = utcnow()
    device.last_telemetry_at = now
    if not parsed["fix"]:
        device.gps_status = "no_fix"
        return {"stored": False, "reason": "no_fix"}
    device.gps_status = "fix"
    loc = BusLocation(bus_id=bus.id, device_pk=device.id, latitude=parsed["latitude"], longitude=parsed["longitude"],
                      speed_kmh=parsed["speed_kmh"], heading_deg=parsed["heading_deg"],
                      satellites=parsed["satellites"], hdop=parsed["hdop"], device_timestamp=ts, received_at=now)
    db.session.add(loc)
    db.session.flush()
    payload = {"bus_id": bus.id, "bus_number": bus.bus_number, "latitude": loc.latitude, "longitude": loc.longitude,
               "speed_kmh": loc.speed_kmh, "heading_deg": loc.heading_deg, "device_timestamp": iso(ts),
               "received_at": iso(now)}
    defer(lambda: realtime.emit_bus_location(bus.id, payload))
    return {"stored": True, "location_id": loc.id}


# ---------------------------------------------------------------- occupancy
def parse_occupancy(data: dict, bus: Bus) -> dict:
    sensor_status = req_choice(data, "sensor_status", {"ok", "degraded", "error"}, required=False, default="ok")
    occupied = req_int(data, "occupied", min_value=0, required=(sensor_status == "ok"))
    if occupied is not None and occupied > bus.capacity:
        raise ApiError(422, "OCCUPANCY_OUT_OF_RANGE",
                       f"occupied={occupied} exceeds configured capacity {bus.capacity}; reading rejected.",
                       {"occupied": f"must be <= {bus.capacity}"})
    return {"occupied": occupied, "sensor_status": sensor_status}


def apply_occupancy(device: DeviceRegistry, bus: Bus, parsed: dict, ts) -> dict:
    now = utcnow()
    device.last_telemetry_at = now
    device.occupancy_sensor_status = parsed["sensor_status"]
    if parsed["occupied"] is None:
        return {"stored": False, "reason": "sensor_not_ok"}
    reading = OccupancyReading(bus_id=bus.id, device_pk=device.id, occupied=parsed["occupied"], capacity=bus.capacity,
                               sensor_status=parsed["sensor_status"], device_timestamp=ts, received_at=now)
    db.session.add(reading)
    db.session.flush()
    bus_id = bus.id

    def _emit():
        b = db.session.get(Bus, bus_id)
        realtime.emit_occupancy(bus_id, {"bus_id": bus_id, "bus_number": b.bus_number, **occupancy_status(b)})

    defer(_emit)
    return {"stored": True, "reading_id": reading.id,
            "available_seats": bus.capacity - parsed["occupied"]}


# ---------------------------------------------------------------- alcohol
def parse_alcohol(data: dict) -> dict:
    sensor_state = req_choice(data, "sensor_state", {"warming_up", "ok", "error"}, required=False, default="ok")
    raw = req_int(data, "raw_adc", min_value=0, max_value=current_app.config["ALCOHOL_ADC_MAX"],
                  required=(sensor_state == "ok"))
    return {"sensor_state": sensor_state, "raw_adc": raw}


def apply_alcohol(device: DeviceRegistry, bus: Bus, parsed: dict, ts) -> dict:
    now = utcnow()
    previous = latest_alcohol(bus.id)
    threshold = bus.alcohol_threshold
    if parsed["sensor_state"] == "warming_up":
        status = "warming_up"
    elif parsed["sensor_state"] == "error":
        status = "sensor_error"
    else:
        status = "warning" if parsed["raw_adc"] >= threshold else "normal"
    device.last_telemetry_at = now
    device.alcohol_sensor_status = {"warming_up": "warming_up", "sensor_error": "error"}.get(status, "ok")
    reading = AlcoholReading(bus_id=bus.id, device_pk=device.id, raw_adc=parsed["raw_adc"], threshold=threshold,
                             status=status, device_timestamp=ts, received_at=now)
    db.session.add(reading)
    db.session.flush()

    new_warning = status == "warning" and (previous is None or previous.status != "warning")
    if new_warning:
        log_audit("alcohol.warning", "bus", bus.id, {"raw_adc": parsed["raw_adc"], "threshold": threshold})
        batch = NotificationBatch()
        msg = (f"Bus {bus.bus_number}: MQ-3 raw reading {parsed['raw_adc']} ≥ threshold {threshold}. "
               "Indicative only — verify in person.")
        batch.add(admin_user_ids() + bus_user_ids(bus.id), category="alcohol", severity="warning",
                  title="Alcohol sensor warning", message=msg, entity_type="bus", entity_id=bus.id)
        defer(batch.push)
    bus_id = bus.id

    def _emit():
        b = db.session.get(Bus, bus_id)
        realtime.emit_alcohol(bus_id, {"bus_id": bus_id, "bus_number": b.bus_number, **alcohol_status(b)},
                              warning=new_warning)

    defer(_emit)
    return {"stored": True, "reading_id": reading.id, "status": status, "threshold": threshold}


# ---------------------------------------------------------------- heartbeat
def parse_heartbeat(data: dict) -> dict:
    components = data.get("components") or {}
    if not isinstance(components, dict):
        fail("components", "must be an object")
    clean = {}
    for key, value in components.items():
        if key not in COMPONENTS:
            continue
        if not isinstance(value, str) or not COMPONENT_RE.match(value):
            fail(f"components.{key}", "must be a short lowercase status word (e.g. ok, error, no_fix)")
        clean[key] = value
    error = data.get("error")
    if error is not None and not isinstance(error, str):
        fail("error", "must be a string")
    return {
        "uptime_s": req_int(data, "uptime_s", min_value=0, required=False),
        "rssi_dbm": req_int(data, "rssi_dbm", min_value=-130, max_value=0, required=False),
        "free_heap": req_int(data, "free_heap", min_value=0, required=False),
        "firmware_version": req_str(data, "firmware_version", max_len=40, required=False),
        "components": clean,
        "error": (error or "").strip()[:255] or None,
    }


def apply_heartbeat(device: DeviceRegistry, bus: Bus, parsed: dict, ts) -> dict:
    hb = DeviceHeartbeat(device_pk=device.id, bus_id=bus.id, device_timestamp=ts, uptime_s=parsed["uptime_s"],
                         rssi_dbm=parsed["rssi_dbm"], free_heap=parsed["free_heap"],
                         firmware_version=parsed["firmware_version"], statuses=parsed["components"],
                         error_message=parsed["error"])
    db.session.add(hb)
    if parsed["firmware_version"]:
        device.firmware_version = parsed["firmware_version"]
    changed = False
    for key, value in parsed["components"].items():
        col = COMPONENT_COLUMNS[key]
        if getattr(device, col) != value:
            setattr(device, col, value)
            changed = True
    if parsed["error"]:
        _note_device_error(device, parsed["error"])
        changed = True
    db.session.flush()
    if changed:
        bus_id = bus.id
        defer(lambda: realtime.emit_device_status(bus_id, {"bus_id": bus_id,
                                                           **device_status(db.session.get(Bus, bus_id))}))
    return {"stored": True, "heartbeat_id": hb.id}


# ---------------------------------------------------------------- Driver ID card (RFID)
def parse_driver_rfid(data: dict) -> dict:
    uid = normalize_uid(req_str(data, "card_uid", max_len=40), "card_uid")
    if uid is None:
        fail("card_uid", "is required")
    return {
        "card_uid": uid,
        "event_id": req_str(data, "event_id", max_len=64, pattern=EVENT_ID_RE,
                            pattern_msg="letters, digits, '-', '_', ':', '.' only"),
        # "tap" toggles duty; firmware with two buttons may send duty_start / duty_end explicitly
        "event_type": req_choice(data, "event_type", {"tap", "duty_start", "duty_end"}, required=False, default="tap"),
    }


def apply_driver_rfid(device: DeviceRegistry, bus: Bus, parsed: dict, ts) -> tuple[dict, bool]:
    existing = DriverRFIDEvent.query.filter_by(device_pk=device.id, device_event_id=parsed["event_id"]).first()
    if existing:
        return _driver_response(existing, bus), True

    uid = parsed["card_uid"]
    action = None
    if bus.driver_rfid_uid and uid == bus.driver_rfid_uid:
        result = "authorized"
        if parsed["event_type"] == "tap":
            last = latest_duty_event(bus.id)
            action = "duty_end" if (last and last.action == "duty_start") else "duty_start"
        else:
            action = parsed["event_type"]
    elif Bus.query.filter(Bus.driver_rfid_uid == uid, Bus.id != bus.id).first():
        result = "other_bus_driver"
    else:
        result = "unknown_card"

    now = utcnow()
    device.rfid_reader_status = "ok"
    device.last_telemetry_at = now
    event = DriverRFIDEvent(bus_id=bus.id, device_pk=device.id, device_event_id=parsed["event_id"], card_uid=uid,
                            result=result, action=action, driver_name=bus.driver_name if result == "authorized" else None,
                            device_timestamp=ts, received_at=now)
    db.session.add(event)
    db.session.flush()

    batch = NotificationBatch()
    if result == "authorized":
        log_audit(f"driver.{action}", "bus", bus.id, {"driver": bus.driver_name, "event_id": parsed["event_id"]})
    else:
        log_audit("driver.card_rejected", "bus", bus.id, {"uid": uid, "result": result})
        batch.add(admin_user_ids() + bus_user_ids(bus.id), category="device", severity="warning",
                  title="Unauthorized driver card",
                  message=f"Bus {bus.bus_number}: card {uid} was tapped but is not this bus's driver card.",
                  entity_type="bus", entity_id=bus.id)
    defer(batch.push)
    event_id, bus_id = event.id, bus.id

    def _emit():
        e = db.session.get(DriverRFIDEvent, event_id)
        realtime.emit_driver_rfid(bus_id, {**driver_event_dict(e),
                                           "duty": driver_duty_status(db.session.get(Bus, bus_id))})

    defer(_emit)
    return _driver_response(event, bus), False


def _driver_response(e: DriverRFIDEvent, bus: Bus) -> dict:
    ok = e.result == "authorized"
    line1 = {"duty_start": "DUTY STARTED", "duty_end": "DUTY ENDED"}.get(e.action or "", "CARD REJECTED")
    return {
        "driver_event_id": e.id,
        "authorized": ok,
        "result": e.result,
        "action": e.action,
        "driver_name": e.driver_name,
        "lcd_line1": line1[:16],
        "lcd_line2": ((e.driver_name or bus.driver_name) if ok else e.card_uid)[:16],
        "buzzer": "ok" if ok else "deny",
    }


# ---------------------------------------------------------------- SOS
def ingest_sos(device: DeviceRegistry, bus: Bus, data: dict) -> tuple[SOSIncident, bool]:
    """An SOS must never be rejected because of bad GPS or a bad clock: those fields are dropped instead."""
    event_id = req_str(data, "event_id", max_len=64, pattern=EVENT_ID_RE,
                       pattern_msg="letters, digits, '-', '_', ':', '.' only")
    incident_type = req_choice(data, "sos_type", {"sos", "breakdown", "medical", "other"}, required=False,
                               default="sos")
    existing = SOSIncident.query.filter_by(bus_id=bus.id, event_id=event_id).first()
    if existing:
        return existing, True
    ts = parse_device_timestamp(data, lenient=True)
    lat = lng = None
    location_source = None
    if data.get("latitude") is not None and data.get("longitude") is not None:
        try:
            lat, lng = validate_coordinates(data.get("latitude"), data.get("longitude"))
            location_source = "device_payload"
        except ApiError:
            lat = lng = None
    if lat is None:
        loc = latest_location(bus.id)
        if loc and (utcnow() - loc.received_at).total_seconds() <= current_app.config["SOS_LAST_KNOWN_GPS_MAX_AGE_SECONDS"]:
            lat, lng, location_source = loc.latitude, loc.longitude, "last_known_gps"
    message = data.get("message")
    incident = SOSIncident(bus_id=bus.id, device_pk=device.id, event_id=event_id, incident_type=incident_type,
                           source="device", description=(message[:500] if isinstance(message, str) else None),
                           latitude=lat, longitude=lng, location_source=location_source, status="active",
                           device_timestamp=ts)
    db.session.add(incident)
    db.session.flush()
    _after_incident_created(incident, bus)
    return incident, False


def create_dashboard_incident(bus: Bus, *, incident_type: str, description: str | None, source: str,
                              latitude=None, longitude=None) -> SOSIncident:
    location_source = "reported" if latitude is not None else None
    if latitude is None:
        loc = latest_location(bus.id)
        if loc and (utcnow() - loc.received_at).total_seconds() <= current_app.config["SOS_LAST_KNOWN_GPS_MAX_AGE_SECONDS"]:
            latitude, longitude, location_source = loc.latitude, loc.longitude, "last_known_gps"
    incident = SOSIncident(bus_id=bus.id, event_id=f"web-{uuid.uuid4().hex[:20]}", incident_type=incident_type,
                           source=source, description=description, latitude=latitude, longitude=longitude,
                           location_source=location_source, status="active")
    db.session.add(incident)
    db.session.flush()
    _after_incident_created(incident, bus)
    return incident


def _after_incident_created(incident: SOSIncident, bus: Bus) -> None:
    label = INCIDENT_LABELS.get(incident.incident_type, incident.incident_type)
    log_audit("incident.created", "sos_incident", incident.id,
              {"type": incident.incident_type, "source": incident.source, "event_id": incident.event_id})
    batch = NotificationBatch()
    batch.add(admin_user_ids() + bus_user_ids(bus.id), category="sos", severity="critical",
              title=f"{label} — Bus {bus.bus_number}",
              message=f"{label} reported on bus {bus.bus_number}. Respond immediately.",
              entity_type="sos_incident", entity_id=incident.id)
    batch.add(bus_student_user_ids(bus.id), category="sos", severity="critical",
              title=f"{label} on your bus", message=f"An emergency was reported on bus {bus.bus_number}. "
                                                    "The transport office has been alerted.",
              entity_type="sos_incident", entity_id=incident.id)
    defer(batch.push)
    incident_id, bus_id = incident.id, bus.id

    def _emit():
        i = db.session.get(SOSIncident, incident_id)
        realtime.emit_sos("sos_created", bus_id, incident_dict(i), incident_public_dict(i))

    defer(_emit)
