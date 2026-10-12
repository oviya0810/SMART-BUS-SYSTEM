"""Authenticated Socket.IO connections with role-aware rooms.

The browser's session cookie is sent with the Socket.IO handshake (same
origin), so the connect handler can identify the user. Unauthenticated or
password-change-pending connections are refused. Clients never choose their
own rooms — the server assigns them from the authenticated identity.
"""
from __future__ import annotations

from flask import request, session
from flask_socketio import ConnectionRefusedError, join_room

from ..extensions import db, socketio
from ..models import User
from ..services import realtime
from ..utils.time import utcnow


def rooms_for(user: User) -> list[str]:
    rooms = [realtime.user_room(user.id)]
    if user.role == "admin":
        rooms.append(realtime.ADMIN)
    elif user.role == "bus" and user.bus and user.bus.is_active:
        rooms += [realtime.bus_room(user.bus.id), realtime.busfeed_room(user.bus.id)]
    elif user.role == "student" and user.student:
        rooms.append(realtime.student_room(user.student.id))
        bus = user.student.bus
        if bus:
            rooms += [realtime.busfeed_room(bus.id), f"{realtime.busfeed_room(bus.id)}:students"]
    return rooms


def handle_connect(auth=None):
    uid = session.get("uid")
    user = db.session.get(User, uid) if uid is not None else None
    if (user is None or not user.is_active or user.session_version != session.get("sv")
            or user.must_change_password):
        db.session.remove()
        raise ConnectionRefusedError("unauthorized")
    rooms = rooms_for(user)
    for room in rooms:
        join_room(room)
    socketio.emit("connected", {"user_id": user.id, "role": user.role, "rooms": len(rooms),
                                "server_time": utcnow().isoformat() + "Z"}, to=request.sid)
    db.session.remove()


def handle_ping(_data=None):
    return {"server_time": utcnow().isoformat() + "Z"}


def register_socket_handlers() -> None:
    """Attach handlers to the Socket.IO server created by socketio.init_app()."""
    socketio.on_event("connect", handle_connect)
    socketio.on_event("ping_server", handle_ping)
