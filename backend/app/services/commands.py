"""Command queue polled by the ESP32 (GET /api/device/commands)."""
from __future__ import annotations

from datetime import timedelta

from flask import current_app

from ..extensions import db
from ..models import Bus, DeviceCommand, DeviceRegistry, PickupRequest
from ..utils.errors import ApiError
from ..utils.time import iso, utcnow

COMMAND_TYPES = ("pickup_request", "pickup_update", "lcd_message")


def _lcd_safe(text: str, width: int = 16) -> str:
    """Restrict to printable ASCII so a 16x2 HD44780 LCD can render it."""
    cleaned = "".join(ch if 32 <= ord(ch) < 127 else "?" for ch in (text or ""))
    return cleaned[:width]


def pickup_command_payload(p: PickupRequest) -> dict:
    name = p.student.full_name if p.student else "Student"
    return {
        "pickup_id": p.id,
        "status": p.status,
        "student_name": name,
        "boarding_stop": p.boarding_stop_name,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "created_at": iso(p.created_at),
        "lcd_line1": _lcd_safe(f"PICKUP {p.status.upper()}"),
        "lcd_line2": _lcd_safe(f"{name[:8]}@{p.boarding_stop_name}"),
    }


def enqueue(bus: Bus, command_type: str, payload: dict, *, pickup_request_id: int | None = None,
            user_id: int | None = None) -> DeviceCommand | None:
    device = bus.device
    if device is None or not device.is_active:
        return None  # nothing to deliver to; the dashboard still has the data
    cmd = DeviceCommand(
        device_pk=device.id,
        bus_id=bus.id,
        command_type=command_type,
        payload=payload,
        status="pending",
        pickup_request_id=pickup_request_id,
        created_by_user_id=user_id,
        expires_at=utcnow() + timedelta(minutes=current_app.config["COMMAND_EXPIRY_MINUTES"]),
    )
    db.session.add(cmd)
    return cmd


def enqueue_lcd_message(bus: Bus, line1: str, line2: str, duration_s: int, user_id: int | None) -> DeviceCommand | None:
    return enqueue(bus, "lcd_message",
                   {"line1": _lcd_safe(line1), "line2": _lcd_safe(line2), "duration_s": duration_s}, user_id=user_id)


def command_dict(c: DeviceCommand) -> dict:
    return {"command_id": c.id, "type": c.command_type, "payload": c.payload, "status": c.status,
            "created_at": iso(c.created_at), "expires_at": iso(c.expires_at), "delivery_count": c.delivery_count}


def fetch_for_device(device: DeviceRegistry, limit: int = 10) -> list[dict]:
    now = utcnow()
    (DeviceCommand.query
     .filter(DeviceCommand.device_pk == device.id, DeviceCommand.status.in_(("pending", "delivered")),
             DeviceCommand.expires_at < now)
     .update({DeviceCommand.status: "expired"}, synchronize_session=False))
    cmds = (DeviceCommand.query
            .filter(DeviceCommand.device_pk == device.id, DeviceCommand.bus_id == device.bus_id,
                    DeviceCommand.status.in_(("pending", "delivered")))
            .order_by(DeviceCommand.created_at, DeviceCommand.id)
            .limit(limit).all())
    for c in cmds:
        c.status = "delivered"
        c.delivered_at = now
        c.delivery_count = (c.delivery_count or 0) + 1
    return [command_dict(c) for c in cmds]


def acknowledge(device: DeviceRegistry, command_id: int, result: str, message: str | None) -> DeviceCommand:
    cmd = db.session.get(DeviceCommand, command_id)
    if cmd is None or cmd.device_pk != device.id:
        raise ApiError(404, "COMMAND_NOT_FOUND", "Command not found for this device.")
    if cmd.status in ("acknowledged", "failed"):
        return cmd  # idempotent
    if cmd.status == "expired":
        raise ApiError(409, "COMMAND_EXPIRED", "Command already expired.")
    cmd.status = "acknowledged" if result == "ok" else "failed"
    cmd.acked_at = utcnow()
    cmd.ack_message = (message or "")[:255] or None
    return cmd
