"""Commit helper that runs realtime side effects only after a successful commit."""
from __future__ import annotations

from flask import current_app, g

from ..extensions import db


def defer(callback) -> None:
    pending = getattr(g, "_after_commit", None)
    if pending is None:
        pending = []
        g._after_commit = pending
    pending.append(callback)


def commit() -> None:
    db.session.commit()
    callbacks = getattr(g, "_after_commit", [])
    g._after_commit = []
    for cb in callbacks:
        try:
            cb()
        except Exception:  # pragma: no cover - side effects must never break the request
            current_app.logger.exception("after-commit callback failed")


def discard() -> None:
    g._after_commit = []
    db.session.rollback()
