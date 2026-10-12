"""Authentication & authorization.

* Browser dashboards: signed, HttpOnly session cookie + per-session CSRF token
  (sent back in the ``X-CSRF-Token`` header on every state-changing request).
* ESP32 devices: ``X-Device-ID`` + ``Authorization: Bearer <device token>``.
  Only a SHA-256 hash of each high-entropy device token is stored.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from functools import wraps

from flask import current_app, g, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import DeviceRegistry, User
from ..utils.errors import ApiError
from ..utils.time import utcnow

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except Exception:  # pragma: no cover - malformed hash
        return False


def validate_new_password(password: str, username: str) -> None:
    if not isinstance(password, str):
        raise ApiError(422, "WEAK_PASSWORD", "Password must be a string.", {"new_password": "invalid"})
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if len(password) > 128:
        problems.append("at most 128 characters")
    if not re.search(r"[A-Za-z]", password):
        problems.append("at least one letter")
    if not re.search(r"\d", password):
        problems.append("at least one digit")
    if problems:
        raise ApiError(422, "WEAK_PASSWORD", "Password must contain " + ", ".join(problems) + ".",
                       {"new_password": "too weak"})
    if password.lower() == (username or "").lower():
        raise ApiError(422, "WEAK_PASSWORD", "Password must not equal the username.", {"new_password": "too weak"})


# ---------------------------------------------------------------- rate limit
class LoginRateLimiter:
    """In-memory sliding window limiter keyed by client IP + username."""

    def __init__(self):
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _key(self, ip: str, username: str) -> str:
        return f"{ip}|{(username or '').lower()}"

    def _prune(self, key: str, window: int) -> list[float]:
        now = time.monotonic()
        items = [t for t in self._failures.get(key, []) if now - t < window]
        self._failures[key] = items
        return items

    def is_blocked(self, ip: str, username: str) -> int:
        cfg = current_app.config
        with self._lock:
            items = self._prune(self._key(ip, username), cfg["LOGIN_WINDOW_SECONDS"])
            if len(items) >= cfg["LOGIN_MAX_ATTEMPTS"]:
                return int(cfg["LOGIN_WINDOW_SECONDS"] - (time.monotonic() - items[0])) + 1
        return 0

    def record_failure(self, ip: str, username: str) -> None:
        with self._lock:
            self._failures.setdefault(self._key(ip, username), []).append(time.monotonic())

    def reset(self, ip: str, username: str) -> None:
        with self._lock:
            self._failures.pop(self._key(ip, username), None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


login_rate_limiter = LoginRateLimiter()


# ---------------------------------------------------------------- sessions
def login_user(user: User) -> str:
    session.clear()
    session.permanent = True
    session["uid"] = user.id
    session["sv"] = user.session_version
    session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def logout_user() -> None:
    session.clear()


def current_user() -> User | None:
    if "current_user" in g:
        return g.current_user
    user = None
    uid = session.get("uid")
    if uid is not None:
        candidate = db.session.get(User, uid)
        if candidate and candidate.is_active and candidate.session_version == session.get("sv"):
            user = candidate
    g.current_user = user
    return user


def _check_csrf() -> None:
    sent = request.headers.get("X-CSRF-Token", "")
    expected = session.get("csrf", "")
    if not expected or not hmac.compare_digest(sent, expected):
        raise ApiError(403, "CSRF_FAILED", "Missing or invalid CSRF token. Reload the page and try again.")


def login_required(*roles: str, allow_password_change: bool = False):
    """Require an authenticated, active user with one of ``roles`` (any role if empty)."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                raise ApiError(401, "UNAUTHENTICATED", "Please sign in.")
            if request.method in MUTATING:
                _check_csrf()
            if roles and user.role not in roles:
                raise ApiError(403, "FORBIDDEN", "You do not have permission to access this resource.")
            if user.must_change_password and not allow_password_change:
                raise ApiError(403, "PASSWORD_CHANGE_REQUIRED", "You must change your initial password first.")
            if user.role == "bus" and (user.bus is None or not user.bus.is_active):
                raise ApiError(403, "BUS_INACTIVE", "This bus account is not active.")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


# ---------------------------------------------------------------- devices
def hash_device_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def device_required(require_bus: bool = True):
    """Authenticate an ESP32 device. Sets ``g.device`` and ``g.bus``."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            device_id = (request.headers.get("X-Device-ID") or "").strip()
            auth = request.headers.get("Authorization", "")
            token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
            if not device_id or not token:
                raise ApiError(401, "DEVICE_UNAUTHENTICATED", "X-Device-ID and Authorization: Bearer <token> are required.")
            device = DeviceRegistry.query.filter_by(device_id=device_id).first()
            if device is None or not hmac.compare_digest(device.token_hash, hash_device_token(token)):
                current_app.logger.warning("Rejected device auth for id=%s from %s", device_id[:64], request.remote_addr)
                raise ApiError(401, "DEVICE_UNAUTHENTICATED", "Invalid device credentials.")
            if not device.is_active:
                raise ApiError(403, "DEVICE_DISABLED", "This device has been disabled by an administrator.")
            if require_bus and (device.bus is None or not device.bus.is_active):
                raise ApiError(403, "DEVICE_NOT_ASSIGNED", "This device is not assigned to an active bus.")
            device.last_seen_at = utcnow()
            device.last_ip = (request.remote_addr or "")[:64]
            g.device = device
            g.bus = device.bus
            return fn(*args, **kwargs)

        return wrapper

    return decorator
