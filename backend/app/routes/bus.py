"""Bus account API. The bus is always the one linked to the signed-in account."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..auth import current_user, login_required
from ..extensions import db
from ..models import AlcoholReading, DriverRFIDEvent, OccupancyReading, PickupRequest, SOSIncident
from ..services import commands
from ..services.audit import log_audit
from ..services.pickups import transition
from ..services.serializers import bus_dict, driver_event_dict, incident_dict, pickup_dict, route_dict
from ..services.status import (
    alcohol_status,
    bus_live_summary,
    device_status,
    driver_duty_status,
    location_status,
    occupancy_status,
)
from ..services.telemetry import create_dashboard_incident
from ..services.tx import commit
from ..utils.errors import ApiError
from ..utils.time import iso
from ..utils.validation import get_json, req_choice, req_int, req_str

bp = Blueprint("bus", __name__, url_prefix="/api/bus")


@bp.before_request
@login_required("bus")
def _require_bus():
    return None


def _my_bus():
    return current_user().bus


def _active_pickups(bus_id):
    return (PickupRequest.query.filter(PickupRequest.bus_id == bus_id,
                                       PickupRequest.status.in_(("pending", "accepted", "approaching")))
            .order_by(PickupRequest.created_at).all())


@bp.get("/overview")
def overview():
    bus = _my_bus()
    incidents = (SOSIncident.query.filter(SOSIncident.bus_id == bus.id, SOSIncident.status != "resolved")
                 .order_by(SOSIncident.created_at.desc()).all())
    return jsonify({
        "bus": bus_dict(bus),
        "route": route_dict(bus.route),
        "live": bus_live_summary(bus),
        "pending_pickups": PickupRequest.query.filter_by(bus_id=bus.id, status="pending").count(),
        "active_pickups": [pickup_dict(p) for p in _active_pickups(bus.id)],
        "active_incidents": [incident_dict(i) for i in incidents],
        "assigned_students": sum(1 for a in bus.assignments if a.is_active),
    })


@bp.get("/location")
def location():
    bus = _my_bus()
    return jsonify({"location": location_status(bus), "device": device_status(bus), "route": route_dict(bus.route)})


@bp.get("/pickup-requests")
def pickups():
    bus = _my_bus()
    scope = request.args.get("scope", "active")
    if scope == "all":
        items = (PickupRequest.query.filter_by(bus_id=bus.id).order_by(PickupRequest.created_at.desc())
                 .limit(200).all())
    else:
        items = _active_pickups(bus.id)
    return jsonify({"items": [pickup_dict(p, include_history=True) for p in items]})


@bp.post("/pickup-requests/<int:request_id>/status")
def update_pickup(request_id):
    bus = _my_bus()
    p = db.session.get(PickupRequest, request_id)
    if p is None or p.bus_id != bus.id:  # never reveal other buses' requests
        raise ApiError(404, "NOT_FOUND", "Pickup request not found.")
    data = get_json()
    status = req_choice(data, "status", {"accepted", "approaching", "picked_up", "cancelled"})
    reason = req_str(data, "reason", max_len=255, required=False)
    if status == "cancelled" and not reason:
        raise ApiError(422, "VALIDATION_ERROR", "reason: is required when cancelling", {"reason": "is required"})
    transition(p, status, actor_type="bus", actor_user_id=current_user().id, reason=reason)
    commit()
    return jsonify({"pickup_request": pickup_dict(p, include_history=True)})


@bp.get("/occupancy")
def occupancy():
    bus = _my_bus()
    history = (OccupancyReading.query.filter_by(bus_id=bus.id).order_by(OccupancyReading.received_at.desc())
               .limit(120).all())
    return jsonify({"occupancy": occupancy_status(bus),
                    "history": [{"occupied": r.occupied, "capacity": r.capacity, "sensor_status": r.sensor_status,
                                 "received_at": iso(r.received_at)} for r in reversed(history)]})


@bp.get("/alcohol-status")
def alcohol():
    bus = _my_bus()
    history = (AlcoholReading.query.filter_by(bus_id=bus.id).order_by(AlcoholReading.received_at.desc())
               .limit(120).all())
    warnings = (AlcoholReading.query.filter(AlcoholReading.bus_id == bus.id,
                                            AlcoholReading.status.in_(("warning", "sensor_error")))
                .order_by(AlcoholReading.received_at.desc()).limit(50).all())
    return jsonify({
        "alcohol": alcohol_status(bus),
        "history": [{"raw_adc": r.raw_adc, "threshold": r.threshold, "status": r.status,
                     "received_at": iso(r.received_at)} for r in reversed(history)],
        "warnings": [{"raw_adc": r.raw_adc, "threshold": r.threshold, "status": r.status,
                      "received_at": iso(r.received_at), "device_timestamp": iso(r.device_timestamp)} for r in warnings],
    })


@bp.get("/alerts")
def alerts():
    bus = _my_bus()
    items = SOSIncident.query.filter_by(bus_id=bus.id).order_by(SOSIncident.created_at.desc()).limit(100).all()
    return jsonify({"items": [incident_dict(i) for i in items]})


@bp.post("/incidents")
def report_incident():
    bus = _my_bus()
    data = get_json()
    incident = create_dashboard_incident(
        bus, incident_type=req_choice(data, "incident_type", {"sos", "breakdown", "medical", "other"}),
        description=req_str(data, "description", max_len=500, required=False), source="bus_dashboard")
    commit()
    return jsonify({"incident": incident_dict(incident)}), 201


@bp.get("/driver-duty")
def driver_duty():
    bus = _my_bus()
    events = (DriverRFIDEvent.query.filter_by(bus_id=bus.id)
              .order_by(DriverRFIDEvent.received_at.desc(), DriverRFIDEvent.id.desc()).limit(200).all())
    return jsonify({"duty": driver_duty_status(bus), "card_registered": bool(bus.driver_rfid_uid),
                    "events": [driver_event_dict(e) for e in events]})


@bp.get("/device")
def device():
    bus = _my_bus()
    return jsonify({"device": device_status(bus), "alcohol": alcohol_status(bus), "occupancy": occupancy_status(bus),
                    "location": location_status(bus)})


@bp.post("/lcd-message")
def lcd_message():
    bus = _my_bus()
    data = get_json()
    cmd = commands.enqueue_lcd_message(bus, req_str(data, "line1", max_len=16),
                                       req_str(data, "line2", max_len=16, required=False) or "",
                                       req_int(data, "duration_s", min_value=3, max_value=600, required=False) or 15,
                                       current_user().id)
    if cmd is None:
        raise ApiError(409, "NO_DEVICE", "No active ESP32 device is associated with this bus.")
    log_audit("device.lcd_message", "bus", bus.id, {"line1": data.get("line1")})
    commit()
    return jsonify({"command": commands.command_dict(cmd)}), 201
