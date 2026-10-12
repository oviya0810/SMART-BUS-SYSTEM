from __future__ import annotations

from flask import g, has_request_context, request

from ..extensions import db
from ..models import AuditLog

SENSITIVE_KEYS = {"password", "new_password", "current_password", "initial_password", "token", "device_token",
                  "password_hash", "token_hash"}


def _scrub(details):
    if isinstance(details, dict):
        return {k: ("[redacted]" if k in SENSITIVE_KEYS else _scrub(v)) for k, v in details.items()}
    if isinstance(details, list):
        return [_scrub(v) for v in details]
    return details


def log_audit(action: str, entity_type: str | None = None, entity_id: int | None = None,
              details: dict | None = None, *, actor_type: str | None = None, actor_label: str | None = None,
              actor_user_id: int | None = None) -> AuditLog:
    """Add an audit record to the current transaction (caller commits)."""
    ip = None
    if has_request_context():
        ip = (request.remote_addr or "")[:64]
        user = g.get("current_user")
        device = g.get("device")
        if actor_type is None:
            if user is not None:
                actor_type, actor_user_id, actor_label = "user", user.id, f"{user.role}:{user.username}"
            elif device is not None:
                actor_type, actor_label = "device", f"device:{device.device_id}"
    entry = AuditLog(
        actor_type=actor_type or "system",
        actor_user_id=actor_user_id,
        actor_label=actor_label or "system",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=_scrub(details or {}),
        ip_address=ip,
    )
    db.session.add(entry)
    return entry
