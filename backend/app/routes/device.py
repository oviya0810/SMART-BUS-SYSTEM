"""ESP32 hardware API.

Authentication on every request:
    X-Device-ID: <device id provisioned by the admin>
    Authorization: Bearer <device token shown once at provisioning>
Every data payload must include "bus_number" (must match the device's bus)
and "timestamp" (epoch seconds/ms or ISO-8601 UTC). See docs/API_DOCUMENTATION.md.
"""
from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify

from ..auth import device_required
from ..models import PickupRequest
from ..services import commands, telemetry
from ..services.audit import log_audit
from ..services.serializers import incident_dict
from ..services.tx import commit
from ..utils.errors import ApiError
from ..utils.time import iso, utcnow
from ..utils.validation import get_json, req_choice, req_int, req_str

bp = Blueprint("device", __name__, url_prefix="/api/device")


def _start(data: dict) -> None:
    telemetry.verify_identity(data, g.device, g.bus)
    telemetry.mark_device_seen(g.device)


def _reject(data_kind: str, err: ApiError):
    """Persist the rejection on the device record (visible in dashboards), then return the error."""
    telemetry._note_device_error(g.device, f"{data_kind} rejected: {err.message}"[:255])
    log_audit(f"device.{data_kind}_rejected", "device", g.device.id, {"code": err.code, "message": err.message})
    commit()
    raise err


def _config() -> dict:
    cfg = current_app.config
    bus = g.bus
    return {
        "bus_number": bus.bus_number,
        "capacity": bus.capacity,
        "alcohol_threshold": bus.alcohol_threshold,
        "heartbeat_interval_s": cfg["DEVICE_HEARTBEAT_INTERVAL_SECONDS"],
        "command_poll_interval_s": 5,
        "gps_interval_s": 5,
        "server_time": iso(utcnow()),
    }


@bp.post("/register")
@device_required()
def register():
    data = get_json()
    _start(data)
    fw = req_str(data, "firmware_version", max_len=40, required=False)
    device = g.device
    first = device.registered_at is None
    device.registered_at = utcnow()
    if fw:
        device.firmware_version = fw
    log_audit("device.registered", "device", device.id, {"firmware_version": fw, "first_registration": first})
    commit()
    return jsonify({"ok": True, "device_id": device.device_id, "config": _config()})


@bp.post("/heartbeat")
@device_required()
def heartbeat():
    data = get_json()
    _start(data)
    ts = telemetry.parse_device_timestamp(data)
    parsed = telemetry.parse_heartbeat(data)
    result = telemetry.apply_heartbeat(g.device, g.bus, parsed, ts)
    commit()
    return jsonify({"ok": True, **result, "config": _config()})


@bp.post("/gps")
@device_required()
def gps():
    data = get_json()
    _start(data)
    try:
        ts = telemetry.parse_device_timestamp(data)
        parsed = telemetry.parse_gps(data)
    except ApiError as err:
        _reject("gps", err)
    result = telemetry.apply_gps(g.device, g.bus, parsed, ts)
    commit()
    return jsonify({"ok": True, **result}), (201 if result["stored"] else 200)


@bp.post("/occupancy")
@device_required()
def occupancy():
    data = get_json()
    _start(data)
    try:
        ts = telemetry.parse_device_timestamp(data)
        parsed = telemetry.parse_occupancy(data, g.bus)
    except ApiError as err:
        _reject("occupancy", err)
    result = telemetry.apply_occupancy(g.device, g.bus, parsed, ts)
    commit()
    return jsonify({"ok": True, **result}), (201 if result["stored"] else 200)


@bp.post("/alcohol")
@device_required()
def alcohol():
    data = get_json()
    _start(data)
    try:
        ts = telemetry.parse_device_timestamp(data)
        parsed = telemetry.parse_alcohol(data)
    except ApiError as err:
        _reject("alcohol", err)
    result = telemetry.apply_alcohol(g.device, g.bus, parsed, ts)
    commit()
    return jsonify({"ok": True, **result}), 201


@bp.post("/rfid")
@device_required()
def driver_rfid():
    """Driver ID-card tap on the bus RFID reader (duty start / duty end)."""
    data = get_json()
    _start(data)
    try:
        ts = telemetry.parse_device_timestamp(data)
        parsed = telemetry.parse_driver_rfid(data)
    except ApiError as err:
        _reject("rfid", err)
    result, duplicate = telemetry.apply_driver_rfid(g.device, g.bus, parsed, ts)
    commit()
    return jsonify({"ok": True, "duplicate": duplicate, **result}), (200 if duplicate else 201)


@bp.post("/sos")
@device_required()
def sos():
    data = get_json()
    _start(data)
    incident, duplicate = telemetry.ingest_sos(g.device, g.bus, data)
    commit()
    return jsonify({"ok": True, "duplicate": duplicate, "incident_id": incident.id, "status": incident.status,
                    "incident": incident_dict(incident),
                    "lcd_line1": "SOS SENT" if not duplicate else "SOS RECEIVED", "lcd_line2": f"ID {incident.id}"}), \
        (200 if duplicate else 201)


@bp.post("/telemetry")
@device_required()
def combined_telemetry():
    """Combined upload: any of "gps", "occupancy", "alcohol", "heartbeat" sections.
    Each section is validated independently; valid sections are stored even if another is rejected."""
    data = get_json()
    _start(data)
    ts = telemetry.parse_device_timestamp(data)
    parsers = {
        "gps": lambda d: telemetry.parse_gps(d),
        "occupancy": lambda d: telemetry.parse_occupancy(d, g.bus),
        "alcohol": lambda d: telemetry.parse_alcohol(d),
        "heartbeat": lambda d: telemetry.parse_heartbeat(d),
    }
    appliers = {"gps": telemetry.apply_gps, "occupancy": telemetry.apply_occupancy,
                "alcohol": telemetry.apply_alcohol, "heartbeat": telemetry.apply_heartbeat}
    present = [k for k in parsers if isinstance(data.get(k), dict)]
    if not present:
        raise ApiError(422, "VALIDATION_ERROR", "Include at least one of: gps, occupancy, alcohol, heartbeat",
                       {"sections": "missing"})
    parsed, errors = {}, {}
    for key in present:
        try:
            parsed[key] = parsers[key](data[key])
        except ApiError as err:
            errors[key] = {"code": err.code, "message": err.message}
    results = {key: appliers[key](g.device, g.bus, value, ts) for key, value in parsed.items()}
    if errors:
        telemetry._note_device_error(g.device, "telemetry rejected: " + "; ".join(
            f"{k}: {v['message']}" for k, v in errors.items()))
        log_audit("device.telemetry_partial_reject", "device", g.device.id, errors)
    commit()
    status = 201 if results and not errors else (207 if results else 422)
    return jsonify({"ok": not errors, "results": results, "errors": errors}), status


@bp.get("/commands")
@device_required()
def get_commands():
    telemetry.mark_device_seen(g.device)
    cmds = commands.fetch_for_device(g.device)
    active = (PickupRequest.query.filter(PickupRequest.bus_id == g.bus.id,
                                         PickupRequest.status.in_(("pending", "accepted", "approaching")))
              .order_by(PickupRequest.created_at).limit(20).all())
    commit()
    return jsonify({
        "bus_number": g.bus.bus_number,
        "server_time": iso(utcnow()),
        "commands": cmds,
        "active_pickups": [commands.pickup_command_payload(p) for p in active],
    })


@bp.post("/command-ack")
@device_required()
def command_ack():
    data = get_json()
    _start(data)
    cmd = commands.acknowledge(g.device, req_int(data, "command_id", min_value=1),
                               req_choice(data, "result", {"ok", "failed"}, required=False, default="ok"),
                               req_str(data, "message", max_len=255, required=False))
    commit()
    return jsonify({"ok": True, "command": commands.command_dict(cmd)})
