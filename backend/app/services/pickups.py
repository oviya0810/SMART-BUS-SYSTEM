"""Pickup request lifecycle: pending → accepted → approaching → picked_up (or cancelled)."""
from __future__ import annotations

from ..extensions import db
from ..models import PICKUP_ACTIVE, PickupRequest, PickupStatusHistory, RouteStop, Student
from ..utils.errors import ApiError
from ..utils.time import utcnow
from . import commands, realtime
from .audit import log_audit
from .notifications import NotificationBatch, admin_user_ids, bus_user_ids
from .serializers import PICKUP_LABELS, pickup_dict
from .tx import defer

TRANSITIONS = {
    "pending": {"accepted", "cancelled"},
    "accepted": {"approaching", "picked_up", "cancelled"},
    "approaching": {"picked_up", "cancelled"},
    "picked_up": set(),
    "cancelled": set(),
}


def _broadcast(event: str, p: PickupRequest) -> None:
    admin_payload = pickup_dict(p, include_register_number=True)
    bus_payload = pickup_dict(p)
    student_payload = pickup_dict(p)
    realtime.emit(event, admin_payload, [realtime.ADMIN])
    realtime.emit(event, bus_payload, [realtime.bus_room(p.bus_id)])
    realtime.emit(event, student_payload, [realtime.student_room(p.student_id)])


def create_pickup(student: Student, *, latitude: float | None, longitude: float | None, accuracy: float | None,
                  stop: RouteStop | None, stop_name: str | None, note: str | None) -> PickupRequest:
    bus = student.bus
    if bus is None or not bus.is_active:
        raise ApiError(409, "NO_ASSIGNED_BUS", "You are not assigned to an active bus. Contact the transport office.")
    existing = (PickupRequest.query
                .filter(PickupRequest.student_id == student.id, PickupRequest.status.in_(PICKUP_ACTIVE))
                .first())
    if existing:
        raise ApiError(409, "ACTIVE_REQUEST_EXISTS",
                       f"You already have an active pickup request (#{existing.id}, {PICKUP_LABELS[existing.status]}).",
                       {"pickup_request_id": existing.id})
    if stop is not None and stop.route_id != bus.route_id:
        raise ApiError(422, "VALIDATION_ERROR", "boarding_stop_id: stop is not on your bus route",
                       {"boarding_stop_id": "not on route"})

    source = "phone_gps"
    if latitude is None:
        if stop is None:
            raise ApiError(422, "VALIDATION_ERROR", "Share your GPS location or choose a boarding stop.",
                           {"latitude": "required without boarding_stop_id"})
        source = "stop"
        latitude, longitude = stop.latitude, stop.longitude  # may be None if the stop has no coordinates
    name = stop.name if stop else (stop_name or "Current location")

    p = PickupRequest(student=student, bus=bus, latitude=latitude, longitude=longitude, location_source=source,
                      location_accuracy_m=accuracy, boarding_stop_id=stop.id if stop else None,
                      boarding_stop_name=name[:120], note=note, status="pending")
    db.session.add(p)
    db.session.flush()
    db.session.add(PickupStatusHistory(pickup_request=p, from_status=None, to_status="pending",
                                       changed_by_type="student", changed_by_user_id=student.user_id))
    commands.enqueue(bus, "pickup_request", commands.pickup_command_payload(p), pickup_request_id=p.id)
    log_audit("pickup.created", "pickup_request", p.id, {"bus_id": bus.id, "stop": name, "source": source})

    batch = NotificationBatch()
    batch.add(bus_user_ids(bus.id), category="pickup", title="New pickup request",
              message=f"{student.full_name} requested pickup at {name}.", entity_type="pickup_request", entity_id=p.id)
    defer(batch.push)
    defer(lambda: _broadcast("pickup_request_created", p))
    return p


def transition(p: PickupRequest, new_status: str, *, actor_type: str, actor_user_id: int | None,
               reason: str | None = None) -> PickupRequest:
    if new_status not in TRANSITIONS:
        raise ApiError(422, "VALIDATION_ERROR", "status: invalid", {"status": "invalid"})
    if new_status not in TRANSITIONS[p.status]:
        raise ApiError(409, "INVALID_TRANSITION",
                       f"Cannot change a {PICKUP_LABELS[p.status]} request to {PICKUP_LABELS[new_status]}.")
    old = p.status
    now = utcnow()
    p.status = new_status
    if new_status == "accepted":
        p.accepted_at = now
    if new_status == "picked_up":
        p.picked_up_at = now
    if new_status in ("picked_up", "cancelled"):
        p.closed_at = now
    if new_status == "cancelled":
        p.cancel_reason = (reason or "").strip()[:255] or None
    db.session.add(PickupStatusHistory(pickup_request=p, from_status=old, to_status=new_status,
                                       changed_by_type=actor_type, changed_by_user_id=actor_user_id,
                                       reason=(reason or None)))
    commands.enqueue(p.bus, "pickup_update", commands.pickup_command_payload(p), pickup_request_id=p.id,
                     user_id=actor_user_id)
    log_audit("pickup.status_changed", "pickup_request", p.id,
              {"from": old, "to": new_status, "by": actor_type, "reason": reason})

    batch = NotificationBatch()
    if actor_type != "student":
        msg = f"Your pickup request at {p.boarding_stop_name} is now {PICKUP_LABELS[new_status]}."
        if new_status == "cancelled" and p.cancel_reason:
            msg += f" Reason: {p.cancel_reason}"
        batch.add([p.student.user_id], category="pickup", title=f"Pickup {PICKUP_LABELS[new_status]}",
                  message=msg, severity="warning" if new_status == "cancelled" else "info",
                  entity_type="pickup_request", entity_id=p.id)
    else:
        batch.add(bus_user_ids(p.bus_id), category="pickup", title="Pickup cancelled by student",
                  message=f"{p.student.full_name} cancelled the pickup at {p.boarding_stop_name}.",
                  entity_type="pickup_request", entity_id=p.id)
    defer(batch.push)
    defer(lambda: _broadcast("pickup_request_updated", p))
    return p


__all__ = ["create_pickup", "transition", "TRANSITIONS", "admin_user_ids"]
