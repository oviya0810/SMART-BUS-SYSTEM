"""Student API. The student is always derived from the session — never from client-supplied IDs."""
from __future__ import annotations

from datetime import timedelta

from flask import Blueprint, jsonify

from ..auth import current_user, login_required
from ..extensions import db
from ..models import PickupRequest, RouteStop, SOSIncident, StudentLocation
from ..services import realtime
from ..services.pickups import create_pickup, transition
from ..services.serializers import (
    incident_public_dict,
    pickup_dict,
    route_dict,
    student_dict,
)
from ..services.status import device_status, location_status, occupancy_status
from ..services.tx import commit, defer
from ..utils.errors import ApiError
from ..utils.time import iso, utcnow
from ..utils.validation import get_json, req_float, req_int, req_str, validate_coordinates

bp = Blueprint("student", __name__, url_prefix="/api/student")


@bp.before_request
@login_required("student")
def _require_student():
    return None


def _me():
    student = current_user().student
    if student is None:
        raise ApiError(403, "FORBIDDEN", "No student profile is linked to this account.")
    return student


@bp.get("/profile")
def profile():
    s = _me()
    bus = s.bus
    return jsonify({
        "student": student_dict(s),
        "bus": ({"id": bus.id, "bus_number": bus.bus_number, "registration_number": bus.registration_number,
                 "driver_name": bus.driver_name, "driver_phone": bus.driver_phone, "capacity": bus.capacity,
                 "route_name": bus.route.name if bus.route else None} if bus else None),
        "route": route_dict(bus.route) if bus and bus.route else None,
    })


@bp.post("/location")
def submit_location():
    s = _me()
    data = get_json()
    lat, lng = validate_coordinates(data.get("latitude"), data.get("longitude"))
    accuracy = req_float(data, "accuracy_m", min_value=0, max_value=100000, required=False)
    loc = StudentLocation(student_id=s.id, latitude=lat, longitude=lng, accuracy_m=accuracy, recorded_at=utcnow())
    db.session.add(loc)
    db.session.flush()
    payload = {"student_id": s.id, "student_name": s.full_name, "bus_id": s.bus.id if s.bus else None,
               "latitude": lat, "longitude": lng, "accuracy_m": accuracy, "recorded_at": iso(loc.recorded_at)}
    defer(lambda: realtime.emit_student_location(payload))
    commit()
    return jsonify({"location": payload}), 201


@bp.get("/pickup-requests")
def my_pickups():
    s = _me()
    items = PickupRequest.query.filter_by(student_id=s.id).order_by(PickupRequest.created_at.desc()).limit(100).all()
    return jsonify({"items": [pickup_dict(p, include_history=True) for p in items]})


@bp.post("/pickup-requests")
def new_pickup():
    s = _me()
    data = get_json()
    lat = lng = None
    if data.get("latitude") is not None or data.get("longitude") is not None:
        lat, lng = validate_coordinates(data.get("latitude"), data.get("longitude"))
    accuracy = req_float(data, "accuracy_m", min_value=0, max_value=100000, required=False)
    stop_id = req_int(data, "boarding_stop_id", min_value=1, required=False)
    stop = None
    if stop_id is not None:
        stop = db.session.get(RouteStop, stop_id)
        if stop is None:
            raise ApiError(422, "VALIDATION_ERROR", "boarding_stop_id: stop not found", {"boarding_stop_id": "not found"})
    p = create_pickup(s, latitude=lat, longitude=lng, accuracy=accuracy, stop=stop,
                      stop_name=req_str(data, "boarding_stop_name", max_len=120, required=False),
                      note=req_str(data, "note", max_len=200, required=False))
    if lat is not None:
        db.session.add(StudentLocation(student_id=s.id, latitude=lat, longitude=lng, accuracy_m=accuracy))
    commit()
    return jsonify({"pickup_request": pickup_dict(p, include_history=True),
                    "message": "Pickup request saved and sent to your bus."}), 201


@bp.post("/pickup-requests/<int:request_id>/cancel")
def cancel_pickup(request_id):
    s = _me()
    p = db.session.get(PickupRequest, request_id)
    if p is None or p.student_id != s.id:
        raise ApiError(404, "NOT_FOUND", "Pickup request not found.")
    reason = req_str(get_json(), "reason", max_len=255, required=False) or "Cancelled by student"
    transition(p, "cancelled", actor_type="student", actor_user_id=s.user_id, reason=reason)
    commit()
    return jsonify({"pickup_request": pickup_dict(p, include_history=True)})


@bp.get("/bus-status")
def bus_status():
    s = _me()
    bus = s.bus
    if bus is None:
        return jsonify({"assigned": False, "message": "You are not assigned to a bus yet."})
    dev = device_status(bus)
    return jsonify({
        "assigned": True,
        "bus": {"id": bus.id, "bus_number": bus.bus_number, "route_name": bus.route.name if bus.route else None,
                "capacity": bus.capacity, "is_active": bus.is_active},
        "location": location_status(bus),
        "occupancy": occupancy_status(bus),
        "device": {"assigned": dev["assigned"], "online": dev["online"], "last_seen_at": dev.get("last_seen_at")},
        "route": route_dict(bus.route) if bus.route else None,
        "active_incidents": SOSIncident.query.filter(SOSIncident.bus_id == bus.id,
                                                     SOSIncident.status != "resolved").count(),
    })


@bp.get("/alerts")
def alerts():
    s = _me()
    bus = s.bus
    if bus is None:
        return jsonify({"items": []})
    since = utcnow() - timedelta(days=30)
    items = (SOSIncident.query.filter(SOSIncident.bus_id == bus.id, SOSIncident.created_at >= since)
             .order_by(SOSIncident.created_at.desc()).limit(100).all())
    return jsonify({"items": [incident_public_dict(i) for i in items]})

