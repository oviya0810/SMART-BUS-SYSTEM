"""Test fixtures. Each test gets its own temporary SQLite file — never the real database."""
from __future__ import annotations

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.auth import hash_password, login_rate_limiter  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import User  # noqa: E402
from config import TestConfig  # noqa: E402

ADMIN_PASSWORD = "AdminPass123"


@pytest.fixture()
def db_path(tmp_path):
    return tmp_path / "test_smartbus360.db"


@pytest.fixture()
def app(db_path, tmp_path):
    application = create_app(TestConfig, SQLALCHEMY_DATABASE_URI=f"sqlite:///{db_path.as_posix()}",
                             FRONTEND_DIST=tmp_path / "no_dist")
    with application.app_context():
        db.create_all()
        db.session.add(User(username="admin", password_hash=hash_password(ADMIN_PASSWORD), role="admin",
                            display_name="Test Admin", must_change_password=False))
        db.session.commit()
    login_rate_limiter.clear()
    yield application
    with application.app_context():
        db.session.remove()
        db.engine.dispose()


class ApiClient:
    """Wraps the Flask test client, tracking the CSRF token like the real frontend does."""

    def __init__(self, app):
        self.app = app
        self.http = app.test_client()
        self.csrf = None

    def _headers(self, extra=None):
        h = {}
        if self.csrf:
            h["X-CSRF-Token"] = self.csrf
        if extra:
            h.update(extra)
        return h

    def login(self, username, password, expect=200):
        r = self.http.post("/api/auth/login", json={"username": username, "password": password})
        assert r.status_code == expect, r.get_json()
        if r.status_code == 200:
            self.csrf = r.get_json()["csrf_token"]
        return r

    def get(self, url, **kw):
        return self.http.get(url, headers=self._headers(kw.pop("headers", None)), **kw)

    def post(self, url, json=None, **kw):
        return self.http.post(url, json=json if json is not None else {}, headers=self._headers(kw.pop("headers", None)), **kw)

    def put(self, url, json=None, **kw):
        return self.http.put(url, json=json or {}, headers=self._headers(kw.pop("headers", None)), **kw)

    def delete(self, url, **kw):
        return self.http.delete(url, headers=self._headers(kw.pop("headers", None)), **kw)

    def change_password(self, current, new):
        r = self.post("/api/auth/change-password", {"current_password": current, "new_password": new})
        assert r.status_code == 200, r.get_json()
        self.csrf = r.get_json()["csrf_token"]
        return r


@pytest.fixture()
def admin(app):
    c = ApiClient(app)
    c.login("admin", ADMIN_PASSWORD)
    return c


@pytest.fixture()
def new_client(app):
    return lambda: ApiClient(app)


# ------------------------------------------------------------------ builders
def make_route(admin, name="Route A", stops=(("Gandhipuram", 11.0168, 76.9558), ("Peelamedu", 11.0300, 77.0200))):
    r = admin.post("/api/admin/routes", {"name": name})
    assert r.status_code == 201, r.get_json()
    route = r.get_json()["route"]
    out = []
    for i, (sname, lat, lng) in enumerate(stops, start=1):
        rs = admin.post(f"/api/admin/routes/{route['id']}/stops",
                        {"name": sname, "sequence": i, "latitude": lat, "longitude": lng})
        assert rs.status_code == 201, rs.get_json()
        out.append(rs.get_json()["stop"])
    route["stops"] = out
    return route


def make_bus(admin, bus_number="07", route_id=None, capacity=40, device_id=None, registration=None, driver_uid=None):
    payload = {"bus_number": bus_number, "registration_number": registration or f"TN38-AB-{bus_number}",
               "driver_name": "Ravi Kumar", "driver_phone": "9876543210", "capacity": capacity}
    if route_id:
        payload["route_id"] = route_id
    if device_id:
        payload["device_id"] = device_id
    if driver_uid:
        payload["driver_rfid_uid"] = driver_uid
    r = admin.post("/api/admin/buses", payload)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def make_student(admin, name="Arun Kumar", reg="21EC045", bus_id=None, stop_id=None):
    payload = {"full_name": name, "register_number": reg, "department": "ECE", "year": 3, "phone": "9123456780"}
    if bus_id:
        payload["bus_id"] = bus_id
    if stop_id:
        payload["boarding_stop_id"] = stop_id
    r = admin.post("/api/admin/students", payload)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def ready_user(new_client, credentials, new_password):
    """Log in with initial credentials and complete the forced password change."""
    c = new_client()
    username = credentials["username"]
    c.login(username, credentials.get("initial_password") or credentials.get("temporary_password"))
    c.change_password(credentials.get("initial_password") or credentials.get("temporary_password"), new_password)
    return c


class Device:
    def __init__(self, app, device_id, token, bus_number):
        self.http = app.test_client()
        self.device_id = device_id
        self.token = token
        self.bus_number = bus_number

    def headers(self, token=None, device_id=None):
        return {"X-Device-ID": device_id or self.device_id, "Authorization": f"Bearer {token or self.token}"}

    def post(self, path, body=None, *, token=None, device_id=None, with_identity=True):
        payload = dict(body or {})
        if with_identity:
            payload.setdefault("bus_number", self.bus_number)
            payload.setdefault("timestamp", int(time.time()))
        return self.http.post(f"/api/device/{path}", json=payload, headers=self.headers(token, device_id))

    def get(self, path, *, token=None):
        return self.http.get(f"/api/device/{path}", headers=self.headers(token))


@pytest.fixture()
def fleet(app, admin, new_client):
    """A route, two buses with devices, and two students on bus 07 (+1 on bus 12)."""
    route = make_route(admin)
    route_b = make_route(admin, name="Route B", stops=(("Ukkadam", 10.9925, 76.9614),))
    bus_a = make_bus(admin, "07", route_id=route["id"], device_id="ESP32-BUS07", driver_uid="D1A2B3C4")
    bus_b = make_bus(admin, "12", route_id=route_b["id"], device_id="ESP32-BUS12", capacity=30, driver_uid="D9E8F7A6")
    s1 = make_student(admin, "Arun Kumar", "21EC045", bus_a["bus"]["id"], route["stops"][0]["id"])
    s2 = make_student(admin, "Divya Priya", "21CS101", bus_a["bus"]["id"], route["stops"][1]["id"])
    s3 = make_student(admin, "Karthik Raja", "21ME077", bus_b["bus"]["id"], route_b["stops"][0]["id"])
    return {
        "route": route, "route_b": route_b,
        "bus_a": bus_a, "bus_b": bus_b,
        "dev_a": Device(app, "ESP32-BUS07", bus_a["device"]["device_token"], "07"),
        "dev_b": Device(app, "ESP32-BUS12", bus_b["device"]["device_token"], "12"),
        "s1": s1, "s2": s2, "s3": s3,
        "bus_a_client": lambda: ready_user(new_client, bus_a["credentials"], "BusSevenPass1"),
        "bus_b_client": lambda: ready_user(new_client, bus_b["credentials"], "BusTwelvePass1"),
        "s1_client": lambda: ready_user(new_client, s1["credentials"], "ArunNewPass1"),
        "s2_client": lambda: ready_user(new_client, s2["credentials"], "DivyaNewPass1"),
        "s3_client": lambda: ready_user(new_client, s3["credentials"], "KarthikPass1"),
    }
