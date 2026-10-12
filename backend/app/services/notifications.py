"""Persisted per-user notifications (delivered live through Socket.IO after commit)."""
from __future__ import annotations

from ..extensions import db
from ..models import Bus, Notification, Student, StudentBusAssignment, User
from ..utils.time import iso
from . import realtime


def notification_dict(n: Notification) -> dict:
    return {"id": n.id, "category": n.category, "severity": n.severity, "title": n.title, "message": n.message,
            "entity_type": n.entity_type, "entity_id": n.entity_id, "is_read": n.is_read,
            "created_at": iso(n.created_at)}


def admin_user_ids() -> list[int]:
    return [u.id for u in User.query.filter_by(role="admin", is_active=True).all()]


def bus_student_user_ids(bus_id: int) -> list[int]:
    rows = (db.session.query(User.id)
            .join(Student, Student.user_id == User.id)
            .join(StudentBusAssignment, StudentBusAssignment.student_id == Student.id)
            .filter(StudentBusAssignment.bus_id == bus_id, StudentBusAssignment.is_active.is_(True),
                    User.is_active.is_(True))
            .all())
    return [r[0] for r in rows]


def bus_user_ids(bus_id: int) -> list[int]:
    bus = db.session.get(Bus, bus_id)
    return [bus.user_id] if bus and bus.user and bus.user.is_active else []


class NotificationBatch:
    """Collect notifications inside a transaction; push them after commit."""

    def __init__(self):
        self.items: list[Notification] = []

    def add(self, user_ids, *, category: str, title: str, message: str, severity: str = "info",
            entity_type: str | None = None, entity_id: int | None = None) -> None:
        for uid in dict.fromkeys(user_ids):
            n = Notification(user_id=uid, category=category, title=title[:120], message=message[:500],
                             severity=severity, entity_type=entity_type, entity_id=entity_id)
            db.session.add(n)
            self.items.append(n)

    def push(self) -> None:
        for n in self.items:
            realtime.emit_notification(n.user_id, notification_dict(n))
