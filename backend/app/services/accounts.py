"""Account creation rules (documented in docs/DATABASE_SCHEMA.md → "Account rules").

Student username  : first.last name (lowercase ASCII letters/digits), max 24 chars;
                    collisions get a numeric suffix: arun.kumar, arun.kumar2, arun.kumar3 ...
Student password  : "SB@" + register number (uppercase, no spaces), e.g. SB@21EC045
Bus username      : "bus_" + bus number letters/digits in lowercase, e.g. "Bus 07" -> bus_bus07 ;
                    "TN38-1234" -> bus_tn381234 ; collisions get a numeric suffix.
Bus password      : "Bus@" + bus number letters/digits uppercase + "#360", e.g. Bus@BUS07#360
All initial passwords are hashed immediately and must be changed at first login.
Admin password resets generate a random temporary password (shown once).
"""
from __future__ import annotations

import re
import secrets
import string
import unicodedata

from ..extensions import db
from ..models import Bus, RouteStop, Student, StudentBusAssignment, User
from ..utils.errors import ApiError
from ..utils.time import utcnow

REGISTER_RE = re.compile(r"^[A-Z0-9][A-Z0-9/\-]{2,31}$")
BUS_NUMBER_RE = re.compile(r"^[A-Z0-9][A-Z0-9 \-]{0,31}$")
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._]{2,31}$")


def normalize_register_number(value: str) -> str:
    cleaned = re.sub(r"\s+", "", value or "").upper()
    if not REGISTER_RE.match(cleaned):
        raise ApiError(422, "VALIDATION_ERROR", "register_number: 3-32 letters/digits (/, - allowed)",
                       {"register_number": "invalid format"})
    return cleaned


def normalize_bus_number(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip()).upper()
    if not BUS_NUMBER_RE.match(cleaned) or not re.search(r"[A-Z0-9]", cleaned):
        raise ApiError(422, "VALIDATION_ERROR", "bus_number: letters, digits, spaces or '-' (max 32)",
                       {"bus_number": "invalid format"})
    return cleaned


def _ascii_tokens(name: str) -> list[str]:
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.findall(r"[a-z0-9]+", text.lower())


def student_username_base(full_name: str) -> str:
    parts = _ascii_tokens(full_name)
    if not parts:
        base = "student"
    elif len(parts) == 1:
        base = parts[0]
    else:
        base = f"{parts[0]}.{parts[-1]}"
    base = base[:24].strip("._")
    if len(base) < 3:
        base = (base + "stu")[:3] if base else "student"
    return base


def bus_username_base(bus_number: str) -> str:
    return ("bus_" + re.sub(r"[^a-z0-9]", "", bus_number.lower()))[:28]


def unique_username(base: str) -> str:
    candidate, n = base, 2
    while User.query.filter_by(username=candidate).first() is not None:
        candidate = f"{base}{n}"
        n += 1
    return candidate


def student_initial_password(register_number: str) -> str:
    return f"SB@{register_number}"


def bus_initial_password(bus_number: str) -> str:
    return f"Bus@{re.sub(r'[^A-Z0-9]', '', bus_number.upper())}#360"


def random_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length - 2)) + secrets.choice("@#%*") + secrets.choice(string.digits)
        if re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw):
            return pw


def resolve_username(requested: str | None, base: str) -> str:
    if requested:
        uname = requested.strip().lower()
        if not USERNAME_RE.match(uname):
            raise ApiError(422, "VALIDATION_ERROR", "username: 3-32 chars, lowercase letters, digits, '.', '_'",
                           {"username": "invalid format"})
        if User.query.filter_by(username=uname).first():
            raise ApiError(409, "DUPLICATE_USERNAME", f"Username '{uname}' is already taken.", {"username": "duplicate"})
        return uname
    return unique_username(base)


# ---------------------------------------------------------------- students
def validate_stop_for_bus(stop_id: int | None, bus: Bus | None, field: str) -> RouteStop | None:
    if stop_id is None:
        return None
    stop = db.session.get(RouteStop, stop_id)
    if stop is None:
        raise ApiError(422, "VALIDATION_ERROR", f"{field}: stop not found", {field: "not found"})
    if bus is None or bus.route_id is None or stop.route_id != bus.route_id:
        raise ApiError(422, "VALIDATION_ERROR", f"{field}: stop must belong to the assigned bus route",
                       {field: "not on assigned route"})
    return stop


def assign_bus(student: Student, bus: Bus | None, actor_id: int | None) -> bool:
    current = student.current_assignment
    if current and bus and current.bus_id == bus.id:
        return False
    if current is None and bus is None:
        return False
    if current:
        current.is_active = False
        current.ended_at = utcnow()
        db.session.flush()
    if bus:
        db.session.add(StudentBusAssignment(student=student, bus=bus, is_active=True, assigned_by_user_id=actor_id))
    db.session.flush()
    db.session.expire(student, ["assignments"])
    return True


def create_student_account(*, full_name, register_number, department, year, phone, bus, boarding_stop_id,
                           destination_stop_id, requested_username, actor_id) -> tuple[Student, str]:
    from ..auth import hash_password

    if Student.query.filter_by(register_number=register_number).first():
        raise ApiError(409, "DUPLICATE_REGISTER_NUMBER", f"Register number {register_number} already exists.",
                       {"register_number": "duplicate"})
    username = resolve_username(requested_username, student_username_base(full_name))
    initial_password = student_initial_password(register_number)
    boarding = validate_stop_for_bus(boarding_stop_id, bus, "boarding_stop_id")
    destination = validate_stop_for_bus(destination_stop_id, bus, "destination_stop_id")

    user = User(username=username, password_hash=hash_password(initial_password), role="student",
                display_name=full_name, is_active=True, must_change_password=True)
    db.session.add(user)
    db.session.flush()
    student = Student(user=user, full_name=full_name, register_number=register_number, department=department,
                      year=year, phone=phone, boarding_stop=boarding, destination_stop=destination)
    db.session.add(student)
    db.session.flush()
    if bus:
        assign_bus(student, bus, actor_id)
    return student, initial_password


def create_bus_account(*, bus_number, registration_number, route, driver_name, driver_phone, capacity,
                       alcohol_threshold, requested_username) -> tuple[Bus, str]:
    from ..auth import hash_password

    if Bus.query.filter_by(bus_number=bus_number).first():
        raise ApiError(409, "DUPLICATE_BUS_NUMBER", f"Bus number {bus_number} already exists.", {"bus_number": "duplicate"})
    if Bus.query.filter_by(registration_number=registration_number).first():
        raise ApiError(409, "DUPLICATE_REGISTRATION", f"Registration number {registration_number} already exists.",
                       {"registration_number": "duplicate"})
    username = resolve_username(requested_username, bus_username_base(bus_number))
    initial_password = bus_initial_password(bus_number)
    user = User(username=username, password_hash=hash_password(initial_password), role="bus",
                display_name=f"Bus {bus_number}", is_active=True, must_change_password=True)
    db.session.add(user)
    db.session.flush()
    bus = Bus(bus_number=bus_number, registration_number=registration_number, route=route, driver_name=driver_name,
              driver_phone=driver_phone, capacity=capacity, user=user, is_active=True,
              alcohol_threshold=alcohol_threshold)
    db.session.add(bus)
    db.session.flush()
    return bus, initial_password
