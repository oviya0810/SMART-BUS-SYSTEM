from flask import Blueprint, current_app, jsonify, request, session

from ..auth import (
    current_user,
    hash_password,
    login_rate_limiter,
    login_required,
    login_user,
    logout_user,
    validate_new_password,
    verify_password,
)
from ..models import User
from ..services.audit import log_audit
from ..services.serializers import user_dict
from ..services.tx import commit
from ..utils.errors import ApiError
from ..utils.time import utcnow
from ..utils.validation import get_json, req_str

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Burns comparable CPU time for unknown usernames to reduce user enumeration by timing.
_DUMMY_HASH = None


def _dummy_hash():
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("not-a-real-password-123")
    return _DUMMY_HASH


@bp.post("/login")
def login():
    data = get_json()
    username = (req_str(data, "username", max_len=64) or "").lower()
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise ApiError(422, "VALIDATION_ERROR", "password: is required", {"password": "is required"})
    expected_role = data.get("role")  # optional: which portal the user is signing in to
    ip = request.remote_addr or "unknown"

    retry = login_rate_limiter.is_blocked(ip, username)
    if retry:
        raise ApiError(429, "TOO_MANY_ATTEMPTS", f"Too many failed attempts. Try again in {retry // 60 + 1} minutes.",
                       {"retry_after_seconds": retry})

    user = User.query.filter_by(username=username).first()
    ok = verify_password(user.password_hash if user else _dummy_hash(), password)
    if not user or not ok:
        login_rate_limiter.record_failure(ip, username)
        current_app.logger.info("Failed login for username=%s from %s", username[:64], ip)
        log_audit("auth.login_failed", "user", user.id if user else None, {"username": username},
                  actor_type="system", actor_label="auth")
        commit()
        raise ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.")
    if not user.is_active:
        raise ApiError(403, "ACCOUNT_DISABLED", "This account has been deactivated. Contact the administrator.")
    if user.role == "bus" and (user.bus is None or not user.bus.is_active):
        raise ApiError(403, "ACCOUNT_DISABLED", "This bus account is not active.")
    if expected_role in ("admin", "student", "bus") and expected_role != user.role:
        raise ApiError(403, "WRONG_PORTAL", f"This account belongs to the {user.role} portal.",
                       {"role": user.role})

    login_rate_limiter.reset(ip, username)
    csrf = login_user(user)
    user.last_login_at = utcnow()
    log_audit("auth.login", "user", user.id, actor_type="user", actor_user_id=user.id,
              actor_label=f"{user.role}:{user.username}")
    commit()
    return jsonify({"user": user_dict(user), "csrf_token": csrf})


@bp.post("/logout")
def logout():
    user = current_user()
    if user is not None:
        sent = request.headers.get("X-CSRF-Token", "")
        if sent and sent == session.get("csrf"):
            log_audit("auth.logout", "user", user.id)
            commit()
    logout_user()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    user = current_user()
    if user is None:
        raise ApiError(401, "UNAUTHENTICATED", "Please sign in.")
    return jsonify({"user": user_dict(user), "csrf_token": session.get("csrf")})


@bp.post("/change-password")
@login_required(allow_password_change=True)
def change_password():
    user = current_user()
    data = get_json()
    current_pw = data.get("current_password")
    new_pw = data.get("new_password")
    if not isinstance(current_pw, str) or not verify_password(user.password_hash, current_pw):
        raise ApiError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.",
                       {"current_password": "incorrect"})
    validate_new_password(new_pw, user.username)
    if verify_password(user.password_hash, new_pw):
        raise ApiError(422, "WEAK_PASSWORD", "New password must differ from the current password.",
                       {"new_password": "unchanged"})
    user.password_hash = hash_password(new_pw)
    user.must_change_password = False
    user.password_changed_at = utcnow()
    user.session_version += 1
    log_audit("auth.password_changed", "user", user.id)
    commit()
    csrf = login_user(user)  # rotate session after credential change
    return jsonify({"ok": True, "user": user_dict(user), "csrf_token": csrf})
