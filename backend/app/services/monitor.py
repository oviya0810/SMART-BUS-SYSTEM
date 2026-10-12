"""Background task: detect devices that went offline and broadcast the change."""
from __future__ import annotations

from ..extensions import db, socketio
from ..models import DeviceRegistry
from . import realtime
from .audit import log_audit
from .notifications import NotificationBatch, admin_user_ids
from .status import device_online, device_status


def check_devices(app) -> int:
    changed = 0
    with app.test_request_context("/internal/monitor"):
        for device in DeviceRegistry.query.filter(DeviceRegistry.reported_online.is_(True)).all():
            if not device_online(device):
                device.reported_online = False
                changed += 1
                bus = device.bus
                log_audit("device.offline", "device", device.id, {"device_id": device.device_id},
                          actor_type="system", actor_label="monitor")
                batch = NotificationBatch()
                if bus:
                    batch.add(admin_user_ids(), category="device", severity="warning", title="Device offline",
                              message=f"ESP32 {device.device_id} on bus {bus.bus_number} stopped reporting.",
                              entity_type="bus", entity_id=bus.id)
                db.session.commit()
                batch.push()
                if bus:
                    realtime.emit_device_status(bus.id, {"bus_id": bus.id, **device_status(bus)})
        db.session.remove()
    return changed


def start_monitor(app, interval: int = 15) -> None:
    def _loop():
        while True:
            socketio.sleep(interval)
            try:
                check_devices(app)
            except Exception:  # pragma: no cover
                app.logger.exception("device monitor iteration failed")

    socketio.start_background_task(_loop)
