"""Small, explicit request validators. All failures raise ApiError(422)."""
from __future__ import annotations

import math
import re
from typing import Any

from flask import request

from .errors import ApiError

PHONE_RE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}$")
UID_RE = re.compile(r"^[0-9A-F]{4,20}$")
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_\-:.]{3,64}$")
EVENT_ID_RE = re.compile(r"^[A-Za-z0-9_\-:.]{1,64}$")


def fail(field: str, message: str, status: int = 422, code: str = "VALIDATION_ERROR"):
    raise ApiError(status, code, f"{field}: {message}", {field: message})


def get_json() -> dict:
    if request.method in ("POST", "PUT", "PATCH") and request.content_length and not request.is_json:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
    data = request.get_json(silent=True)
    if data is None:
        data = {} if not request.content_length else None
    if not isinstance(data, dict):
        raise ApiError(400, "INVALID_JSON", "Request body must be a JSON object")
    return data


def req_str(data: dict, key: str, *, max_len: int = 255, min_len: int = 1, required: bool = True,
            pattern: re.Pattern | None = None, pattern_msg: str = "has an invalid format") -> str | None:
    value = data.get(key)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            fail(key, "is required")
        return None
    if not isinstance(value, str):
        fail(key, "must be a string")
    value = value.strip()
    if len(value) < min_len:
        fail(key, f"must be at least {min_len} characters")
    if len(value) > max_len:
        fail(key, f"must be at most {max_len} characters")
    if pattern is not None and not pattern.match(value):
        fail(key, pattern_msg)
    return value


def req_int(data: dict, key: str, *, min_value: int | None = None, max_value: int | None = None,
            required: bool = True) -> int | None:
    value = data.get(key)
    if value is None or value == "":
        if required:
            fail(key, "is required")
        return None
    if isinstance(value, bool):
        fail(key, "must be an integer")
    if isinstance(value, float):
        if not value.is_integer():
            fail(key, "must be an integer")
        value = int(value)
    if isinstance(value, str):
        if not re.fullmatch(r"-?\d+", value.strip()):
            fail(key, "must be an integer")
        value = int(value.strip())
    if not isinstance(value, int):
        fail(key, "must be an integer")
    if min_value is not None and value < min_value:
        fail(key, f"must be >= {min_value}")
    if max_value is not None and value > max_value:
        fail(key, f"must be <= {max_value}")
    return value


def req_float(data: dict, key: str, *, min_value: float | None = None, max_value: float | None = None,
              required: bool = True) -> float | None:
    value = data.get(key)
    if value is None or value == "":
        if required:
            fail(key, "is required")
        return None
    if isinstance(value, bool):
        fail(key, "must be a number")
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            fail(key, "must be a number")
    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        fail(key, "must be a finite number")
    value = float(value)
    if min_value is not None and value < min_value:
        fail(key, f"must be >= {min_value}")
    if max_value is not None and value > max_value:
        fail(key, f"must be <= {max_value}")
    return value


def req_bool(data: dict, key: str, *, required: bool = True, default: bool | None = None) -> bool | None:
    value = data.get(key)
    if value is None:
        if required and default is None:
            fail(key, "is required")
        return default
    if not isinstance(value, bool):
        fail(key, "must be true or false")
    return value


def req_choice(data: dict, key: str, choices: set[str] | list[str], *, required: bool = True,
               default: str | None = None) -> str | None:
    value = data.get(key)
    if value is None or value == "":
        if required and default is None:
            fail(key, "is required")
        return default
    if not isinstance(value, str) or value not in choices:
        fail(key, f"must be one of: {', '.join(sorted(choices))}")
    return value


def validate_coordinates(lat: Any, lng: Any, *, lat_key: str = "latitude", lng_key: str = "longitude") -> tuple[float, float]:
    payload = {lat_key: lat, lng_key: lng}
    lat_v = req_float(payload, lat_key, min_value=-90.0, max_value=90.0)
    lng_v = req_float(payload, lng_key, min_value=-180.0, max_value=180.0)
    if abs(lat_v) < 1e-7 and abs(lng_v) < 1e-7:
        raise ApiError(422, "INVALID_COORDINATES", "0,0 is not a valid GPS fix (no satellite lock).",
                       {lat_key: "invalid", lng_key: "invalid"})
    return round(lat_v, 7), round(lng_v, 7)


def normalize_uid(value, field: str = "driver_rfid_uid") -> str | None:
    """RFID UID as uppercase hex without separators ("04:a1:b2:c3" -> "04A1B2C3")."""
    if value is None:
        return None
    if not isinstance(value, str):
        fail(field, "must be a string")
    cleaned = re.sub(r"[\s:\-]", "", value).upper()
    if cleaned == "":
        return None
    if not UID_RE.match(cleaned):
        fail(field, "must be 4-20 hexadecimal characters (e.g. 04A1B2C3)")
    return cleaned


def pagination_args(default_per_page: int = 50, max_per_page: int = 500) -> tuple[int, int]:
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(max_per_page, max(1, int(request.args.get("per_page", default_per_page))))
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "page/per_page must be integers")
    return page, per_page
