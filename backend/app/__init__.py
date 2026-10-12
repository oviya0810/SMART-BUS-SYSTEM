"""SMARTBUS 360 Flask application factory."""
from __future__ import annotations

import logging
import secrets
import sqlite3
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, request
from flask_cors import CORS
from sqlalchemy import event
from sqlalchemy.engine import Engine

from .extensions import db, migrate, socketio


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()


def _ensure_secret_key(app: Flask) -> None:
    if app.config.get("SECRET_KEY"):
        return
    instance = Path(app.root_path).parent / "instance"
    instance.mkdir(parents=True, exist_ok=True)
    key_file = instance / "secret_key"
    if not key_file.exists():
        key_file.write_text(secrets.token_hex(32), encoding="utf-8")
    app.config["SECRET_KEY"] = key_file.read_text(encoding="utf-8").strip()


def _configure_logging(app: Flask) -> None:
    level = getattr(logging, str(app.config.get("LOG_LEVEL", "INFO")).upper(), logging.INFO)
    app.logger.setLevel(level)
    log_dir = app.config.get("LOG_DIR")
    if log_dir and not app.config.get("TESTING"):
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(Path(log_dir) / "smartbus360.log", maxBytes=5_000_000, backupCount=5,
                                      encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s"))
        handler.setLevel(level)
        if not any(isinstance(h, RotatingFileHandler) for h in app.logger.handlers):
            app.logger.addHandler(handler)


def _origin_checker(extra_origins: list[str]):
    """Socket.IO origin policy: same origin as the page (any LAN IP / hostname the
    server is reached by) plus the explicitly configured CORS_ORIGINS."""
    allowed = {o.rstrip("/") for o in extra_origins}

    def check(origin, environ=None):
        if not origin:
            return True  # non-browser clients send no Origin header; auth still required
        origin = origin.rstrip("/")
        if origin in allowed:
            return True
        if environ:
            host = environ.get("HTTP_HOST", "")
            scheme = environ.get("wsgi.url_scheme", "http")
            if origin == f"{scheme}://{host}":
                return True
        return False

    return check


def create_app(config_object=None, **overrides) -> Flask:
    from config import Config

    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_object or Config)
    app.config.update(overrides)
    _ensure_secret_key(app)
    _configure_logging(app)

    db.init_app(app)
    migrate.init_app(app, db, render_as_batch=True,
                     directory=str(Path(__file__).resolve().parent.parent / "migrations"))
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}}, supports_credentials=True,
         allow_headers=["Content-Type", "X-CSRF-Token", "X-Device-ID", "Authorization"])
    socketio.init_app(app, cors_allowed_origins=_origin_checker(app.config["CORS_ORIGINS"]),
                      async_mode=app.config["SOCKETIO_ASYNC_MODE"], logger=False, engineio_logger=False)

    from . import models  # noqa: F401  (register models)
    from .sockets import register_socket_handlers
    from .routes import ALL_BLUEPRINTS
    from .utils.errors import register_error_handlers

    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
    register_error_handlers(app)
    register_socket_handlers()

    @app.after_request
    def _security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.teardown_appcontext
    def _cleanup(_exc):
        db.session.remove()

    return app
