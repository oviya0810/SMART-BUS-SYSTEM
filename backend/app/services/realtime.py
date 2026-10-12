"""Role-aware Socket.IO broadcasting.

Rooms:
  admin                 every administrator
  user:<user_id>        a single user (notifications)
  bus:<bus_id>          the bus account only (private: pickup locations, alcohol, device)
  busfeed:<bus_id>      bus account + students assigned to that bus (location, seats, SOS)
  student:<student_id>  one student (own pickup requests)

Emits happen only AFTER the database transaction is committed, so a client
that reloads persisted state never sees an event for an uncommitted record.
"""
from __future__ import annotations

from flask import current_app

from ..extensions import socketio

ADMIN = "admin"


def user_room(user_id: int) -> str:
    return f"user:{user_id}"


def bus_room(bus_id: int) -> str:
    return f"bus:{bus_id}"


def busfeed_room(bus_id: int) -> str:
    return f"busfeed:{bus_id}"


def student_room(student_id: int) -> str:
    return f"student:{student_id}"


def emit(event: str, payload: dict, rooms: list[str]) -> None:
    rooms = [r for r in dict.fromkeys(rooms) if r]
    if not rooms:
        return
    try:
        socketio.emit(event, payload, to=rooms, namespace="/")
    except Exception:  # pragma: no cover - realtime is best effort; data is persisted
        current_app.logger.exception("Socket emit failed for %s", event)


def emit_bus_location(bus_id: int, payload: dict) -> None:
    emit("bus_location_updated", payload, [ADMIN, busfeed_room(bus_id)])


def emit_student_location(payload: dict) -> None:
    emit("student_location_updated", payload, [ADMIN])


def emit_pickup(event: str, payload: dict, bus_id: int, student_id: int) -> None:
    emit(event, payload, [ADMIN, bus_room(bus_id), student_room(student_id)])


def emit_occupancy(bus_id: int, payload: dict) -> None:
    emit("occupancy_updated", payload, [ADMIN, busfeed_room(bus_id)])


def emit_alcohol(bus_id: int, payload: dict, warning: bool) -> None:
    emit("alcohol_updated", payload, [ADMIN, bus_room(bus_id)])
    if warning:
        emit("alcohol_warning", payload, [ADMIN, bus_room(bus_id)])


def emit_sos(event: str, bus_id: int, full: dict, public: dict) -> None:
    emit(event, full, [ADMIN, bus_room(bus_id)])
    emit(event, public, [f"{busfeed_room(bus_id)}:students"])


def emit_device_status(bus_id: int | None, payload: dict) -> None:
    rooms = [ADMIN]
    if bus_id:
        rooms.append(bus_room(bus_id))
    emit("device_status_updated", payload, rooms)


def emit_driver_rfid(bus_id: int, payload: dict) -> None:
    emit("driver_rfid_event", payload, [ADMIN, bus_room(bus_id)])


def emit_notification(user_id: int, payload: dict) -> None:
    emit("notification", payload, [user_room(user_id)])
