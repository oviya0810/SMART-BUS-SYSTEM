"""Time helpers. All timestamps are stored as naive UTC datetimes."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.replace(microsecond=0).isoformat() + "Z"


def age_seconds(dt: datetime | None) -> float | None:
    if dt is None:
        return None
    return max(0.0, (utcnow() - dt).total_seconds())


def parse_timestamp(value) -> datetime:
    """Parse epoch seconds/milliseconds or an ISO-8601 string into naive UTC."""
    if isinstance(value, bool):
        raise ValueError("timestamp must be epoch seconds or ISO-8601")
    if isinstance(value, (int, float)):
        if not math.isfinite(value) or value <= 0:
            raise ValueError("timestamp must be a positive number")
        seconds = value / 1000.0 if value > 1e12 else float(value)
        return datetime.fromtimestamp(seconds, tz=timezone.utc).replace(tzinfo=None)
    if isinstance(value, str) and value.strip():
        text = value.strip()
        if text.isdigit():
            return parse_timestamp(int(text))
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    raise ValueError("timestamp must be epoch seconds or ISO-8601")


def local_tz() -> ZoneInfo:
    try:
        return ZoneInfo(current_app.config.get("APP_TIMEZONE", "UTC"))
    except Exception:  # pragma: no cover - missing tz database
        return ZoneInfo("UTC")


def local_day_bounds_utc(day: datetime | None = None) -> tuple[datetime, datetime]:
    """Return [start, end) of the local calendar day as naive UTC datetimes."""
    tz = local_tz()
    now_local = (day or datetime.now(timezone.utc)).astimezone(tz) if (day and day.tzinfo) else datetime.now(tz)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return (
        start_local.astimezone(timezone.utc).replace(tzinfo=None),
        end_local.astimezone(timezone.utc).replace(tzinfo=None),
    )


def parse_date_param(value: str | None, end: bool = False) -> datetime | None:
    """Parse YYYY-MM-DD (interpreted in the app timezone) into naive UTC."""
    if not value:
        return None
    d = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=local_tz())
    if end:
        d = d + timedelta(days=1)
    return d.astimezone(timezone.utc).replace(tzinfo=None)
