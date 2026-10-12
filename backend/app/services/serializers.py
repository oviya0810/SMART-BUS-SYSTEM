"""JSON serializers. Passwords and token hashes are never serialized."""
from __future__ import annotations

from ..models import (
    DriverRFIDEvent,
    Bus,
    PickupRequest,
    Route,
    RouteStop,
    SOSIncident,
    Student,
    User,
)
from ..utils.time import iso

INCIDENT_LABELS = {"sos": "SOS Emergency", "breakdown": "Breakdown", "medical": "Medical Emergency", "other": "Other"}
PICKUP_LABELS = {"pending": "Pending", "accepted": "Accepted", "approaching": "Approaching",
                 "picked_up": "Picked Up", "cancelled": "Cancelled"}


def user_dict(u: User) -> dict:
    data = {
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "display_name": u.display_name,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "last_login_at": iso(u.last_login_at),
    }
    if u.role == "student" and u.student:
        data["student_id"] = u.student.id
    if u.role == "bus" and u.bus:
        data["bus_id"] = u.bus.id
    return data


def stop_dict(s: RouteStop | None) -> dict | None:
    if s is None:
        return None
    return {"id": s.id, "route_id": s.route_id, "name": s.name, "sequence": s.sequence,
            "latitude": s.latitude, "longitude": s.longitude}


def route_dict(r: Route | None, with_stops: bool = True) -> dict | None:
    if r is None:
        return None
    data = {"id": r.id, "name": r.name, "description": r.description, "is_active": r.is_active,
            "created_at": iso(r.created_at), "updated_at": iso(r.updated_at)}
    if with_stops:
        data["stops"] = [stop_dict(s) for s in r.stops]
    data["bus_count"] = len(r.buses)
    return data


def bus_brief(b: Bus | None) -> dict | None:
    if b is None:
        return None
    return {"id": b.id, "bus_number": b.bus_number, "route_id": b.route_id,
            "route_name": b.route.name if b.route else None}


def bus_dict(b: Bus) -> dict:
    return {
        "id": b.id,
        "bus_number": b.bus_number,
        "registration_number": b.registration_number,
        "route_id": b.route_id,
        "route_name": b.route.name if b.route else None,
        "driver_name": b.driver_name,
        "driver_phone": b.driver_phone,
        "capacity": b.capacity,
        "username": b.user.username if b.user else None,
        "is_active": b.is_active,
        "alcohol_threshold": b.alcohol_threshold,
        "driver_rfid_uid": b.driver_rfid_uid,
        "device_id": b.device.device_id if b.device else None,
        "assigned_students": sum(1 for a in b.assignments if a.is_active),
        "created_at": iso(b.created_at),
        "updated_at": iso(b.updated_at),
    }


def student_dict(s: Student, include_contact: bool = True) -> dict:
    bus = s.bus
    data = {
        "id": s.id,
        "user_id": s.user_id,
        "full_name": s.full_name,
        "register_number": s.register_number,
        "department": s.department,
        "year": s.year,
        "username": s.user.username if s.user else None,
        "is_active": bool(s.user and s.user.is_active),
        "must_change_password": bool(s.user and s.user.must_change_password),
        "bus": bus_brief(bus),
        "boarding_stop": stop_dict(s.boarding_stop),
        "destination_stop": stop_dict(s.destination_stop),
        "created_at": iso(s.created_at),
        "updated_at": iso(s.updated_at),
    }
    if include_contact:
        data["phone"] = s.phone
    return data


def pickup_dict(p: PickupRequest, *, include_register_number: bool = False, include_history: bool = False) -> dict:
    data = {
        "id": p.id,
        "student_id": p.student_id,
        "student_name": p.student.full_name if p.student else None,
        "bus_id": p.bus_id,
        "bus_number": p.bus.bus_number if p.bus else None,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "location_source": p.location_source,
        "location_accuracy_m": p.location_accuracy_m,
        "boarding_stop_id": p.boarding_stop_id,
        "boarding_stop_name": p.boarding_stop_name,
        "note": p.note,
        "status": p.status,
        "status_label": PICKUP_LABELS.get(p.status, p.status),
        "cancel_reason": p.cancel_reason,
        "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
        "accepted_at": iso(p.accepted_at),
        "picked_up_at": iso(p.picked_up_at),
    }
    if include_register_number and p.student:
        data["register_number"] = p.student.register_number
    if include_history:
        data["history"] = [
            {"from_status": h.from_status, "to_status": h.to_status, "changed_by": h.changed_by_type,
             "reason": h.reason, "at": iso(h.created_at)}
            for h in p.history
        ]
    return data


def incident_dict(i: SOSIncident) -> dict:
    return {
        "id": i.id,
        "event_id": i.event_id,
        "bus_id": i.bus_id,
        "bus_number": i.bus.bus_number if i.bus else None,
        "incident_type": i.incident_type,
        "type_label": INCIDENT_LABELS.get(i.incident_type, i.incident_type),
        "source": i.source,
        "description": i.description,
        "latitude": i.latitude,
        "longitude": i.longitude,
        "location_source": i.location_source,
        "status": i.status,
        "acknowledged_at": iso(i.acknowledged_at),
        "acknowledged_by": i.acknowledged_by.display_name if i.acknowledged_by else None,
        "resolved_at": iso(i.resolved_at),
        "resolved_by": i.resolved_by.display_name if i.resolved_by else None,
        "resolution_notes": i.resolution_notes,
        "device_timestamp": iso(i.device_timestamp),
        "created_at": iso(i.created_at),
        "updated_at": iso(i.updated_at),
    }


def incident_public_dict(i: SOSIncident) -> dict:
    """Student-facing view: no staff identities or internal notes."""
    d = incident_dict(i)
    for key in ("acknowledged_by", "resolved_by", "resolution_notes", "description"):
        d.pop(key, None)
    return d



DRIVER_RESULT_LABELS = {"authorized": "Authorized", "unknown_card": "Unknown card", "other_bus_driver": "Other bus driver"}


def driver_event_dict(e: DriverRFIDEvent) -> dict:
    return {
        "id": e.id,
        "bus_id": e.bus_id,
        "bus_number": e.bus.bus_number if e.bus else None,
        "card_uid": e.card_uid,
        "result": e.result,
        "result_label": DRIVER_RESULT_LABELS.get(e.result, e.result),
        "authorized": e.result == "authorized",
        "action": e.action,
        "driver_name": e.driver_name,
        "device_event_id": e.device_event_id,
        "device_timestamp": iso(e.device_timestamp),
        "received_at": iso(e.received_at),
    }
