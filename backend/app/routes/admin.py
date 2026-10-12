"""Administrator API. Every endpoint requires an authenticated admin session."""
from __future__ import annotations

import secrets

from flask import Blueprint, Response, current_app, jsonify, request
from sqlalchemy import or_

from ..auth import current_user, hash_device_token, hash_password, login_required
from ..extensions import db
from ..models import (
    INCIDENT_TYPES,
    PICKUP_STATUSES,
    AlcoholReading,
    AuditLog,
    Bus,
    DeviceRegistry,
    DriverRFIDEvent,
    OccupancyReading,
    PickupRequest,
    Route,
    RouteStop,
    SOSIncident,
    Student,
    StudentLocation,
    User,
)
from ..services import analytics, commands, realtime, reports
from ..services.accounts import (
    assign_bus,
    create_bus_account,
    create_student_account,
    normalize_bus_number,
    normalize_register_number,
    random_password,
    validate_stop_for_bus,
)
from ..services.audit import log_audit
from ..services.notifications import NotificationBatch, bus_student_user_ids, bus_user_ids
from ..services.serializers import (
    bus_dict,
    driver_event_dict,
    incident_dict,
    incident_public_dict,
    pickup_dict,
    route_dict,
    stop_dict,
    student_dict,
)
from ..services.status import bus_live_summary, device_status
from ..services.tx import commit, defer
from ..utils.errors import ApiError
from ..utils.time import iso, parse_date_param, utcnow
from ..utils.validation import (
    DEVICE_ID_RE,
    PHONE_RE,
    fail,
    get_json,
    normalize_uid,
    req_bool,
    req_float,
    req_int,
    req_str,
    validate_coordinates,
)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.before_request
@login_required("admin")
def _require_admin():
    return None


def _get_or_404(model, obj_id, label):
    obj = db.session.get(model, obj_id)
    if obj is None:
        raise ApiError(404, "NOT_FOUND", f"{label} not found.")
    return obj


def _opt_bus(bus_id) -> Bus | None:
    if bus_id is None or bus_id == "":
        return None
    bus = db.session.get(Bus, req_int({"bus_id": bus_id}, "bus_id", min_value=1))
    if bus is None:
        fail("bus_id", "bus not found")
    return bus


def _phone(data, key, required=True):
    return req_str(data, key, max_len=20, required=required, pattern=PHONE_RE,
                   pattern_msg="must be a valid phone number (7-15 digits, optional +)")


# ================================================================ overview
@bp.get("/overview")
def overview():
    return jsonify(analytics.overview())


# ================================================================ students
@bp.get("/students")
def list_students():
    q = Student.query.join(User, Student.user_id == User.id)
    term = (request.args.get("q") or "").strip()
    if term:
        like = f"%{term}%"
        q = q.filter(or_(Student.full_name.ilike(like), Student.register_number.ilike(like),
                         User.username.ilike(like), Student.department.ilike(like)))
    active = request.args.get("active")
    if active in ("true", "false"):
        q = q.filter(User.is_active.is_(active == "true"))
    students = q.order_by(Student.full_name).all()
    bus_id = request.args.get("bus_id", type=int)
    if bus_id:
        students = [s for s in students if s.bus and s.bus.id == bus_id]
    return jsonify({"items": [student_dict(s) for s in students], "total": len(students)})


@bp.post("/students")
def create_student():
    data = get_json()
    full_name = req_str(data, "full_name", max_len=120, min_len=2)
    register_number = normalize_register_number(req_str(data, "register_number", max_len=32))
    department = req_str(data, "department", max_len=80)
    year = req_int(data, "year", min_value=1, max_value=6)
    phone = _phone(data, "phone")
    bus = _opt_bus(data.get("bus_id"))
    if bus is not None and not bus.is_active:
        fail("bus_id", "bus is not active")
    student, initial_password = create_student_account(
        full_name=full_name, register_number=register_number, department=department, year=year, phone=phone,
        bus=bus, boarding_stop_id=req_int(data, "boarding_stop_id", required=False),
        destination_stop_id=req_int(data, "destination_stop_id", required=False),
        requested_username=req_str(data, "username", max_len=32, required=False), actor_id=current_user().id)
    log_audit("student.created", "student", student.id,
              {"register_number": register_number, "username": student.user.username, "bus_id": bus.id if bus else None})
    commit()
    return jsonify({
        "student": student_dict(student),
        "credentials": {"username": student.user.username, "initial_password": initial_password,
                        "notice": "Shown once. The student must change this password at first login."},
    }), 201


@bp.get("/students/<int:student_id>")
def get_student(student_id):
    s = _get_or_404(Student, student_id, "Student")
    pickups = (PickupRequest.query.filter_by(student_id=s.id).order_by(PickupRequest.created_at.desc()).limit(100).all())
    loc = StudentLocation.query.filter_by(student_id=s.id).order_by(StudentLocation.recorded_at.desc()).first()
    return jsonify({
        "student": student_dict(s),
        "assignments": [{"bus_id": a.bus_id, "bus_number": a.bus.bus_number, "is_active": a.is_active,
                         "assigned_at": iso(a.assigned_at), "ended_at": iso(a.ended_at)} for a in s.assignments],
        "pickup_requests": [pickup_dict(p, include_register_number=True, include_history=True) for p in pickups],
        "last_location": ({"latitude": loc.latitude, "longitude": loc.longitude, "accuracy_m": loc.accuracy_m,
                           "recorded_at": iso(loc.recorded_at)} if loc else None),
    })


@bp.put("/students/<int:student_id>")
def update_student(student_id):
    s = _get_or_404(Student, student_id, "Student")
    data = get_json()
    changes = {}
    if "full_name" in data:
        s.full_name = req_str(data, "full_name", max_len=120, min_len=2)
        s.user.display_name = s.full_name
        changes["full_name"] = s.full_name
    if "register_number" in data:
        reg = normalize_register_number(req_str(data, "register_number", max_len=32))
        if reg != s.register_number:
            if Student.query.filter(Student.register_number == reg, Student.id != s.id).first():
                raise ApiError(409, "DUPLICATE_REGISTER_NUMBER", f"Register number {reg} already exists.",
                               {"register_number": "duplicate"})
            s.register_number = reg
            changes["register_number"] = reg
    if "department" in data:
        s.department = req_str(data, "department", max_len=80)
        changes["department"] = s.department
    if "year" in data:
        s.year = req_int(data, "year", min_value=1, max_value=6)
        changes["year"] = s.year
    if "phone" in data:
        s.phone = _phone(data, "phone")
        changes["phone"] = "updated"

    bus_changed = False
    if "bus_id" in data:
        bus = _opt_bus(data.get("bus_id"))
        if bus is not None and not bus.is_active:
            fail("bus_id", "bus is not active")
        bus_changed = assign_bus(s, bus, current_user().id)
        if bus_changed:
            changes["bus_id"] = bus.id if bus else None
            if "boarding_stop_id" not in data:
                s.boarding_stop = None
            if "destination_stop_id" not in data:
                s.destination_stop = None
    if "boarding_stop_id" in data:
        s.boarding_stop = validate_stop_for_bus(req_int(data, "boarding_stop_id", required=False), s.bus,
                                                "boarding_stop_id")
        changes["boarding_stop_id"] = data.get("boarding_stop_id")
    if "destination_stop_id" in data:
        s.destination_stop = validate_stop_for_bus(req_int(data, "destination_stop_id", required=False), s.bus,
                                                   "destination_stop_id")
        changes["destination_stop_id"] = data.get("destination_stop_id")
    if "is_active" in data:
        active = req_bool(data, "is_active")
        if active != s.user.is_active:
            s.user.is_active = active
            s.user.session_version += 1  # force sign-out everywhere
            changes["is_active"] = active
    log_audit("student.updated", "student", s.id, changes)
    commit()
    return jsonify({"student": student_dict(s), "bus_changed": bus_changed})


@bp.post("/students/<int:student_id>/reset-password")
def reset_student_password(student_id):
    s = _get_or_404(Student, student_id, "Student")
    temp = random_password()
    s.user.password_hash = hash_password(temp)
    s.user.must_change_password = True
    s.user.session_version += 1
    log_audit("student.password_reset", "student", s.id)
    commit()
    return jsonify({"credentials": {"username": s.user.username, "temporary_password": temp,
                                    "notice": "Shown once. The student must change it at next login."}})


# ================================================================ buses
@bp.get("/buses")
def list_buses():
    buses = Bus.query.order_by(Bus.bus_number).all()
    items = []
    for b in buses:
        d = bus_dict(b)
        d["live"] = bus_live_summary(b)
        items.append(d)
    return jsonify({"items": items, "total": len(items)})


def _driver_uid(data, bus_id=None):
    uid = normalize_uid(data.get("driver_rfid_uid"))
    if uid:
        q = Bus.query.filter(Bus.driver_rfid_uid == uid)
        if bus_id:
            q = q.filter(Bus.id != bus_id)
        other = q.first()
        if other:
            raise ApiError(409, "DUPLICATE_DRIVER_RFID", f"Driver card {uid} is already registered to bus {other.bus_number}.",
                           {"driver_rfid_uid": "duplicate"})
    return uid


def _route_or_none(value):
    if value is None or value == "":
        return None
    route = db.session.get(Route, req_int({"route_id": value}, "route_id", min_value=1))
    if route is None:
        fail("route_id", "route not found")
    return route


@bp.post("/buses")
def create_bus():
    data = get_json()
    bus_number = normalize_bus_number(req_str(data, "bus_number", max_len=32))
    registration = req_str(data, "registration_number", max_len=32).upper()
    bus, initial_password = create_bus_account(
        bus_number=bus_number, registration_number=registration, route=_route_or_none(data.get("route_id")),
        driver_name=req_str(data, "driver_name", max_len=120, min_len=2), driver_phone=_phone(data, "driver_phone"),
        capacity=req_int(data, "capacity", min_value=1, max_value=150),
        alcohol_threshold=req_int(data, "alcohol_threshold", min_value=1,
                                  max_value=current_app.config["ALCOHOL_ADC_MAX"], required=False)
        or current_app.config["ALCOHOL_DEFAULT_THRESHOLD"],
        requested_username=req_str(data, "username", max_len=32, required=False))
    bus.driver_rfid_uid = _driver_uid(data)
    log_audit("bus.created", "bus", bus.id, {"bus_number": bus_number, "username": bus.user.username,
                                             "driver_rfid_uid": bus.driver_rfid_uid})
    device_info = None
    if data.get("device_id"):
        device_info = _provision_device(bus, data.get("device_id"))
    commit()
    return jsonify({
        "bus": bus_dict(bus),
        "credentials": {"username": bus.user.username, "initial_password": initial_password,
                        "notice": "Shown once. The bus account must change this password at first login."},
        "device": device_info,
    }), 201


@bp.get("/buses/<int:bus_id>")
def get_bus(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    occ = (OccupancyReading.query.filter_by(bus_id=b.id).order_by(OccupancyReading.received_at.desc()).limit(100).all())
    alc = (AlcoholReading.query.filter_by(bus_id=b.id).order_by(AlcoholReading.received_at.desc()).limit(100).all())
    sos = SOSIncident.query.filter_by(bus_id=b.id).order_by(SOSIncident.created_at.desc()).limit(100).all()
    students = [a.student for a in b.assignments if a.is_active]
    driver_events = (DriverRFIDEvent.query.filter_by(bus_id=b.id)
                     .order_by(DriverRFIDEvent.received_at.desc(), DriverRFIDEvent.id.desc()).limit(50).all())
    return jsonify({
        "bus": bus_dict(b),
        "route": route_dict(b.route),
        "live": bus_live_summary(b),
        "occupancy_history": [{"occupied": r.occupied, "capacity": r.capacity, "sensor_status": r.sensor_status,
                               "received_at": iso(r.received_at), "device_timestamp": iso(r.device_timestamp)}
                              for r in reversed(occ)],
        "alcohol_history": [{"raw_adc": r.raw_adc, "threshold": r.threshold, "status": r.status,
                             "received_at": iso(r.received_at)} for r in reversed(alc)],
        "sos_history": [incident_dict(i) for i in sos],
        "students": [student_dict(s) for s in students],
        "driver_events": [driver_event_dict(e) for e in driver_events],
    })


@bp.put("/buses/<int:bus_id>")
def update_bus(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    data = get_json()
    changes = {}
    if "bus_number" in data:
        num = normalize_bus_number(req_str(data, "bus_number", max_len=32))
        if num != b.bus_number:
            if Bus.query.filter(Bus.bus_number == num, Bus.id != b.id).first():
                raise ApiError(409, "DUPLICATE_BUS_NUMBER", f"Bus number {num} already exists.", {"bus_number": "duplicate"})
            b.bus_number = num
            b.user.display_name = f"Bus {num}"
            changes["bus_number"] = num
    if "registration_number" in data:
        reg = req_str(data, "registration_number", max_len=32).upper()
        if reg != b.registration_number:
            if Bus.query.filter(Bus.registration_number == reg, Bus.id != b.id).first():
                raise ApiError(409, "DUPLICATE_REGISTRATION", f"Registration {reg} already exists.",
                               {"registration_number": "duplicate"})
            b.registration_number = reg
            changes["registration_number"] = reg
    cleared_stops = 0
    if "route_id" in data:
        route = _route_or_none(data.get("route_id"))
        new_id = route.id if route else None
        if new_id != b.route_id:
            b.route = route
            changes["route_id"] = new_id
            for a in b.assignments:
                if a.is_active:
                    st = a.student
                    if st.boarding_stop_id or st.destination_stop_id:
                        cleared_stops += 1
                    st.boarding_stop = None
                    st.destination_stop = None
    for key, max_len in (("driver_name", 120),):
        if key in data:
            setattr(b, key, req_str(data, key, max_len=max_len, min_len=2))
            changes[key] = getattr(b, key)
    if "driver_phone" in data:
        b.driver_phone = _phone(data, "driver_phone")
        changes["driver_phone"] = "updated"
    if "driver_rfid_uid" in data:
        b.driver_rfid_uid = _driver_uid(data, b.id)
        changes["driver_rfid_uid"] = b.driver_rfid_uid
    if "capacity" in data:
        b.capacity = req_int(data, "capacity", min_value=1, max_value=150)
        changes["capacity"] = b.capacity
    if "alcohol_threshold" in data:
        b.alcohol_threshold = req_int(data, "alcohol_threshold", min_value=1,
                                      max_value=current_app.config["ALCOHOL_ADC_MAX"])
        changes["alcohol_threshold"] = b.alcohol_threshold
    if "is_active" in data:
        active = req_bool(data, "is_active")
        if active != b.is_active:
            b.is_active = active
            b.user.is_active = active
            b.user.session_version += 1
            changes["is_active"] = active
    log_audit("bus.updated", "bus", b.id, changes)
    commit()
    return jsonify({"bus": bus_dict(b), "students_with_cleared_stops": cleared_stops})


@bp.post("/buses/<int:bus_id>/reset-password")
def reset_bus_password(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    temp = random_password()
    b.user.password_hash = hash_password(temp)
    b.user.must_change_password = True
    b.user.session_version += 1
    log_audit("bus.password_reset", "bus", b.id)
    commit()
    return jsonify({"credentials": {"username": b.user.username, "temporary_password": temp,
                                    "notice": "Shown once. Must be changed at next login."}})


def _provision_device(bus: Bus, raw_device_id) -> dict:
    device_id = req_str({"device_id": raw_device_id}, "device_id", max_len=64, pattern=DEVICE_ID_RE,
                        pattern_msg="3-64 chars: letters, digits, '-', '_', ':', '.'")
    if bus.device is not None:
        raise ApiError(409, "DEVICE_ALREADY_ASSIGNED",
                       f"Bus {bus.bus_number} already has device {bus.device.device_id}. Remove it first.")
    token = secrets.token_urlsafe(32)
    device = DeviceRegistry.query.filter_by(device_id=device_id).first()
    if device and device.bus_id is not None:
        raise ApiError(409, "DUPLICATE_DEVICE", f"Device {device_id} is already assigned to another bus.",
                       {"device_id": "duplicate"})
    if device is None:
        device = DeviceRegistry(device_id=device_id, token_hash=hash_device_token(token))
        db.session.add(device)
    device.token_hash = hash_device_token(token)
    device.bus = bus
    device.is_active = True
    device.reported_online = False
    db.session.flush()
    log_audit("device.provisioned", "device", device.id, {"device_id": device_id, "bus_id": bus.id})
    return {"device_id": device_id, "device_token": token,
            "notice": "Copy this token into the ESP32 firmware now. It is shown only once and stored hashed."}


@bp.post("/buses/<int:bus_id>/device")
def provision_device(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    info = _provision_device(b, get_json().get("device_id"))
    commit()
    return jsonify({"device": info, "status": device_status(b)}), 201


@bp.post("/buses/<int:bus_id>/device/rotate-token")
def rotate_device_token(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    if b.device is None:
        raise ApiError(404, "NO_DEVICE", "No device is associated with this bus.")
    token = secrets.token_urlsafe(32)
    b.device.token_hash = hash_device_token(token)
    log_audit("device.token_rotated", "device", b.device.id, {"device_id": b.device.device_id})
    commit()
    return jsonify({"device": {"device_id": b.device.device_id, "device_token": token,
                               "notice": "The previous token stopped working immediately. Shown once."}})


@bp.delete("/buses/<int:bus_id>/device")
def remove_device(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    device = b.device
    if device is None:
        raise ApiError(404, "NO_DEVICE", "No device is associated with this bus.")
    device.bus_id = None
    device.is_active = False
    device.reported_online = False
    device.token_hash = hash_device_token(secrets.token_urlsafe(32))  # invalidate old token
    log_audit("device.removed", "device", device.id, {"device_id": device.device_id, "bus_id": b.id})
    commit()
    return jsonify({"ok": True})


@bp.post("/buses/<int:bus_id>/lcd-message")
def admin_lcd_message(bus_id):
    b = _get_or_404(Bus, bus_id, "Bus")
    data = get_json()
    cmd = commands.enqueue_lcd_message(b, req_str(data, "line1", max_len=16), req_str(data, "line2", max_len=16,
                                                                                         required=False) or "",
                                       req_int(data, "duration_s", min_value=3, max_value=600, required=False) or 15,
                                       current_user().id)
    if cmd is None:
        raise ApiError(409, "NO_DEVICE", "This bus has no active ESP32 device to receive the message.")
    log_audit("device.lcd_message", "bus", b.id, {"line1": data.get("line1")})
    commit()
    return jsonify({"command": commands.command_dict(cmd)}), 201


# ================================================================ routes & stops
@bp.get("/routes")
def list_routes():
    return jsonify({"items": [route_dict(r) for r in Route.query.order_by(Route.name).all()]})


@bp.post("/routes")
def create_route():
    data = get_json()
    name = req_str(data, "name", max_len=120, min_len=2)
    if Route.query.filter(Route.name.ilike(name)).first():
        raise ApiError(409, "DUPLICATE_ROUTE", f"Route '{name}' already exists.", {"name": "duplicate"})
    route = Route(name=name, description=req_str(data, "description", max_len=500, required=False))
    db.session.add(route)
    db.session.flush()
    log_audit("route.created", "route", route.id, {"name": name})
    commit()
    return jsonify({"route": route_dict(route)}), 201


@bp.put("/routes/<int:route_id>")
def update_route(route_id):
    route = _get_or_404(Route, route_id, "Route")
    data = get_json()
    if "name" in data:
        name = req_str(data, "name", max_len=120, min_len=2)
        if Route.query.filter(Route.name.ilike(name), Route.id != route.id).first():
            raise ApiError(409, "DUPLICATE_ROUTE", f"Route '{name}' already exists.", {"name": "duplicate"})
        route.name = name
    if "description" in data:
        route.description = req_str(data, "description", max_len=500, required=False)
    if "is_active" in data:
        route.is_active = req_bool(data, "is_active")
    log_audit("route.updated", "route", route.id, {k: data.get(k) for k in ("name", "is_active") if k in data})
    commit()
    return jsonify({"route": route_dict(route)})


def _stop_fields(data, stop: RouteStop | None = None) -> dict:
    out = {}
    if stop is None or "name" in data:
        out["name"] = req_str(data, "name", max_len=120)
    if stop is None or "sequence" in data:
        out["sequence"] = req_int(data, "sequence", min_value=0, max_value=1000, required=False)
    if "latitude" in data or "longitude" in data:
        if data.get("latitude") in (None, "") and data.get("longitude") in (None, ""):
            out["latitude"] = out["longitude"] = None
        else:
            out["latitude"], out["longitude"] = validate_coordinates(data.get("latitude"), data.get("longitude"))
    return out


@bp.post("/routes/<int:route_id>/stops")
def add_stop(route_id):
    route = _get_or_404(Route, route_id, "Route")
    fields = _stop_fields(get_json())
    if RouteStop.query.filter(RouteStop.route_id == route.id, RouteStop.name.ilike(fields["name"])).first():
        raise ApiError(409, "DUPLICATE_STOP", "A stop with this name already exists on the route.", {"name": "duplicate"})
    if fields.get("sequence") is None:
        fields["sequence"] = (max((s.sequence for s in route.stops), default=0) + 1)
    stop = RouteStop(route=route, **fields)
    db.session.add(stop)
    db.session.flush()
    log_audit("route.stop_added", "route_stop", stop.id, {"route_id": route.id, "name": stop.name})
    commit()
    return jsonify({"stop": stop_dict(stop)}), 201


@bp.put("/stops/<int:stop_id>")
def update_stop(stop_id):
    stop = _get_or_404(RouteStop, stop_id, "Stop")
    fields = _stop_fields(get_json(), stop)
    if "name" in fields and RouteStop.query.filter(RouteStop.route_id == stop.route_id,
                                                   RouteStop.name.ilike(fields["name"]),
                                                   RouteStop.id != stop.id).first():
        raise ApiError(409, "DUPLICATE_STOP", "A stop with this name already exists on the route.", {"name": "duplicate"})
    for k, v in fields.items():
        if k == "sequence" and v is None:
            continue
        setattr(stop, k, v)
    log_audit("route.stop_updated", "route_stop", stop.id, fields)
    commit()
    return jsonify({"stop": stop_dict(stop)})


@bp.delete("/stops/<int:stop_id>")
def delete_stop(stop_id):
    stop = _get_or_404(RouteStop, stop_id, "Stop")
    in_use = Student.query.filter(or_(Student.boarding_stop_id == stop.id, Student.destination_stop_id == stop.id)).count()
    if in_use:
        raise ApiError(409, "STOP_IN_USE", f"{in_use} student(s) use this stop. Reassign them before deleting it.")
    log_audit("route.stop_deleted", "route_stop", stop.id, {"route_id": stop.route_id, "name": stop.name})
    db.session.delete(stop)
    commit()
    return jsonify({"ok": True})


# ================================================================ fleet map
@bp.get("/fleet")
def fleet():
    items = []
    for b in Bus.query.order_by(Bus.bus_number).all():
        d = bus_dict(b)
        d["live"] = bus_live_summary(b)
        d["route"] = route_dict(b.route)
        items.append(d)
    active_pickups = (PickupRequest.query.filter(PickupRequest.status.in_(("pending", "accepted", "approaching")))
                      .order_by(PickupRequest.created_at.desc()).all())
    return jsonify({"buses": items, "pickups": [pickup_dict(p, include_register_number=True) for p in active_pickups]})


# ================================================================ pickups
@bp.get("/pickup-requests")
def admin_pickups():
    q = PickupRequest.query
    status = request.args.get("status")
    if status in PICKUP_STATUSES:
        q = q.filter(PickupRequest.status == status)
    elif status == "active":
        q = q.filter(PickupRequest.status.in_(("pending", "accepted", "approaching")))
    bus_id = request.args.get("bus_id", type=int)
    if bus_id:
        q = q.filter(PickupRequest.bus_id == bus_id)
    items = q.order_by(PickupRequest.created_at.desc()).limit(500).all()
    return jsonify({"items": [pickup_dict(p, include_register_number=True, include_history=True) for p in items]})


# ================================================================ incidents
@bp.get("/incidents")
def list_incidents():
    q = SOSIncident.query
    status = request.args.get("status")
    if status == "open":
        q = q.filter(SOSIncident.status != "resolved")
    elif status in ("active", "acknowledged", "resolved"):
        q = q.filter(SOSIncident.status == status)
    itype = request.args.get("type")
    if itype in INCIDENT_TYPES:
        q = q.filter(SOSIncident.incident_type == itype)
    bus_id = request.args.get("bus_id", type=int)
    if bus_id:
        q = q.filter(SOSIncident.bus_id == bus_id)
    items = q.order_by(SOSIncident.created_at.desc()).limit(500).all()
    return jsonify({"items": [incident_dict(i) for i in items]})


def _incident_broadcast(incident: SOSIncident, event: str):
    iid, bus_id = incident.id, incident.bus_id

    def _emit():
        i = db.session.get(SOSIncident, iid)
        realtime.emit_sos(event, bus_id, incident_dict(i), incident_public_dict(i))

    defer(_emit)


@bp.post("/incidents/<int:incident_id>/acknowledge")
def acknowledge_incident(incident_id):
    incident = _get_or_404(SOSIncident, incident_id, "Incident")
    if incident.status != "active":
        raise ApiError(409, "INVALID_STATE", f"Incident is already {incident.status}.")
    data = get_json()
    user = current_user()
    incident.status = "acknowledged"
    incident.acknowledged_at = utcnow()
    incident.acknowledged_by_user_id = user.id
    note = req_str(data, "note", max_len=500, required=False)
    if note:
        incident.resolution_notes = note
    log_audit("incident.acknowledged", "sos_incident", incident.id, {"note": note})
    batch = NotificationBatch()
    batch.add(bus_user_ids(incident.bus_id) + bus_student_user_ids(incident.bus_id), category="sos",
              title="Emergency acknowledged",
              message=f"The transport office acknowledged the emergency on bus {incident.bus.bus_number}.",
              entity_type="sos_incident", entity_id=incident.id)
    defer(batch.push)
    _incident_broadcast(incident, "sos_acknowledged")
    commit()
    return jsonify({"incident": incident_dict(incident)})


@bp.post("/incidents/<int:incident_id>/resolve")
def resolve_incident(incident_id):
    incident = _get_or_404(SOSIncident, incident_id, "Incident")
    if incident.status == "resolved":
        raise ApiError(409, "INVALID_STATE", "Incident is already resolved.")
    data = get_json()
    notes = req_str(data, "resolution_notes", max_len=1000, min_len=3)
    user = current_user()
    now = utcnow()
    if incident.acknowledged_at is None:
        incident.acknowledged_at = now
        incident.acknowledged_by_user_id = user.id
    incident.status = "resolved"
    incident.resolved_at = now
    incident.resolved_by_user_id = user.id
    incident.resolution_notes = notes
    log_audit("incident.resolved", "sos_incident", incident.id, {"notes": notes})
    _incident_broadcast(incident, "sos_updated")
    commit()
    return jsonify({"incident": incident_dict(incident)})


# ================================================================ reports
@bp.get("/reports")
def get_report():
    kind = request.args.get("type", "students")
    try:
        start = parse_date_param(request.args.get("from"))
        end = parse_date_param(request.args.get("to"), end=True)
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "from/to must be YYYY-MM-DD", {"from": "invalid"})
    itype = request.args.get("incident_type")
    if itype and itype not in INCIDENT_TYPES:
        fail("incident_type", "invalid")
    columns, rows = reports.build_report(kind, start=start, end=end, bus_id=request.args.get("bus_id", type=int),
                                         route_id=request.args.get("route_id", type=int), incident_type=itype)
    if request.args.get("format") == "csv":
        stamp = utcnow().strftime("%Y%m%d_%H%M")
        return Response(reports.to_csv(columns, rows), mimetype="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="smartbus360_{kind}_{stamp}.csv"'})
    return jsonify({"type": kind, "columns": columns, "rows": rows, "count": len(rows)})


# ================================================================ audit log
@bp.get("/audit-logs")
def audit_logs():
    q = AuditLog.query
    action = request.args.get("action")
    if action:
        q = q.filter(AuditLog.action.like(f"{action}%"))
    entries = q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(300).all()
    return jsonify({"items": [{"id": e.id, "actor": e.actor_label, "actor_type": e.actor_type, "action": e.action,
                               "entity_type": e.entity_type, "entity_id": e.entity_id, "details": e.details,
                               "ip_address": e.ip_address, "created_at": iso(e.created_at)} for e in entries]})


__all__ = ["bp", "req_float"]
