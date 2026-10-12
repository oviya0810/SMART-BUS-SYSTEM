"""SMARTBUS 360 configuration.

Every value can be overridden through environment variables or the project
root ``.env`` file (see ``.env.example``). Secrets are never hardcoded.
"""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
INSTANCE_DIR = BACKEND_DIR / "instance"

load_dotenv(ROOT_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    try:
        return int(raw) if raw not in (None, "") else default
    except ValueError:
        return default


def _list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name) or default
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


def _default_db_uri() -> str:
    INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{(INSTANCE_DIR / 'smartbus360.db').as_posix()}"


class Config:
    APP_NAME = "SMARTBUS 360"
    APP_VERSION = "1.0.0"

    SECRET_KEY = os.environ.get("SECRET_KEY") or None  # generated + persisted on first run if missing

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or _default_db_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"check_same_thread": False, "timeout": 30}}

    # Session cookie (browser dashboards)
    SESSION_COOKIE_NAME = "smartbus_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)  # set true when served over HTTPS
    PERMANENT_SESSION_LIFETIME = timedelta(hours=_int("SESSION_HOURS", 12))
    MAX_CONTENT_LENGTH = 1 * 1024 * 1024

    # Network
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = _int("PORT", 80)
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://bus.local")
    CORS_ORIGINS = _list("CORS_ORIGINS", "http://bus.local,http://localhost:5173,http://127.0.0.1:5173")
    SOCKETIO_ASYNC_MODE = os.environ.get("SOCKETIO_ASYNC_MODE", "threading")
    # Optional HTTPS (required by browsers for phone GPS). See generate_cert.py / docs/NETWORK_SETUP.md
    SSL_CERT_FILE = os.environ.get("SSL_CERT_FILE", "")
    SSL_KEY_FILE = os.environ.get("SSL_KEY_FILE", "")

    FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST") or (ROOT_DIR / "frontend" / "dist"))

    # Optional mDNS advertisement of bus.local (see docs/NETWORK_SETUP.md)
    MDNS_ENABLED = _bool("MDNS_ENABLED", False)
    MDNS_HOSTNAME = os.environ.get("MDNS_HOSTNAME", "bus.local")
    MDNS_IP = os.environ.get("MDNS_IP", "")

    # Data freshness thresholds (seconds)
    GPS_STALE_SECONDS = _int("GPS_STALE_SECONDS", 60)
    OCCUPANCY_STALE_SECONDS = _int("OCCUPANCY_STALE_SECONDS", 120)
    ALCOHOL_STALE_SECONDS = _int("ALCOHOL_STALE_SECONDS", 120)
    DEVICE_OFFLINE_SECONDS = _int("DEVICE_OFFLINE_SECONDS", 90)
    STUDENT_LOCATION_STALE_SECONDS = _int("STUDENT_LOCATION_STALE_SECONDS", 300)
    SOS_LAST_KNOWN_GPS_MAX_AGE_SECONDS = _int("SOS_LAST_KNOWN_GPS_MAX_AGE_SECONDS", 300)

    # Device protocol
    DEVICE_HEARTBEAT_INTERVAL_SECONDS = _int("DEVICE_HEARTBEAT_INTERVAL_SECONDS", 30)
    DEVICE_MAX_FUTURE_SKEW_SECONDS = _int("DEVICE_MAX_FUTURE_SKEW_SECONDS", 300)
    DEVICE_MAX_PAST_AGE_HOURS = _int("DEVICE_MAX_PAST_AGE_HOURS", 72)
    COMMAND_EXPIRY_MINUTES = _int("COMMAND_EXPIRY_MINUTES", 30)
    ALCOHOL_DEFAULT_THRESHOLD = _int("ALCOHOL_DEFAULT_THRESHOLD", 2000)
    ALCOHOL_ADC_MAX = _int("ALCOHOL_ADC_MAX", 4095)

    # Login protection
    LOGIN_MAX_ATTEMPTS = _int("LOGIN_MAX_ATTEMPTS", 5)
    LOGIN_WINDOW_SECONDS = _int("LOGIN_WINDOW_SECONDS", 900)

    APP_TIMEZONE = os.environ.get("APP_TIMEZONE", "Asia/Kolkata")
    LOG_DIR = Path(os.environ.get("LOG_DIR") or (BACKEND_DIR / "logs"))
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

    BACKGROUND_MONITOR = _bool("BACKGROUND_MONITOR", True)
    TESTING = False


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key-not-for-production"
    SQLALCHEMY_DATABASE_URI = "sqlite://"  # overridden per test with a temp file
    BACKGROUND_MONITOR = False
    MDNS_ENABLED = False
    LOGIN_MAX_ATTEMPTS = 5
    LOG_DIR = None
