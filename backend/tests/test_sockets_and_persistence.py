from app import create_app
from app.extensions import db, socketio
from app.models import PickupRequest, Student
from config import TestConfig
from conftest import make_student


def _events(client, name):
    return [e["args"][0] for e in client.get_received() if e["name"] == name]


def test_socket_rejects_unauthenticated(app):
    sock = socketio.test_client(app, flask_test_client=app.test_client())
    assert not sock.is_connected()


def test_socket_rejects_pending_password_change(app, admin, new_client):
    created = make_student(admin, "New Kid", "23AB001")
    c = new_client()
    c.login(created["credentials"]["username"], created["credentials"]["initial_password"])
    sock = socketio.test_client(app, flask_test_client=c.http)
    assert not sock.is_connected()


def test_socket_event_authorization(app, fleet, admin):
    s1, s2, s3 = fleet["s1_client"](), fleet["s2_client"](), fleet["s3_client"]()
    bus_a, bus_b = fleet["bus_a_client"](), fleet["bus_b_client"]()
    socks = {name: socketio.test_client(app, flask_test_client=c.http)
             for name, c in {"admin": admin, "s1": s1, "s2": s2, "s3": s3, "bus_a": bus_a, "bus_b": bus_b}.items()}
    assert all(s.is_connected() for s in socks.values())
    for s in socks.values():
        s.get_received()  # drain "connected"

    s1.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95})
    fleet["dev_a"].post("gps", {"latitude": 11.0183, "longitude": 76.9725})
    fleet["dev_a"].post("alcohol", {"raw_adc": 3000})
    fleet["dev_a"].post("sos", {"event_id": "sock-sos-1"})

    got = {name: s.get_received() for name, s in socks.items()}
    names = {n: [e["name"] for e in evs] for n, evs in got.items()}

    # pickup: admin, bus A and the requesting student only
    assert "pickup_request_created" in names["admin"]
    assert "pickup_request_created" in names["bus_a"]
    assert "pickup_request_created" in names["s1"]
    for other in ("s2", "s3", "bus_b"):
        assert "pickup_request_created" not in names[other], other
    # bus location: admin + bus A feed (bus A account and its students), never bus B / other students
    for who in ("admin", "bus_a", "s1", "s2"):
        assert "bus_location_updated" in names[who], who
    for who in ("s3", "bus_b"):
        assert "bus_location_updated" not in names[who], who
    # alcohol warnings: admin + bus A account only (not students)
    assert "alcohol_warning" in names["admin"] and "alcohol_warning" in names["bus_a"]
    for who in ("s1", "s2", "s3", "bus_b"):
        assert "alcohol_warning" not in names[who], who
    # SOS: admin, bus A, students of bus A; not bus B or its students
    for who in ("admin", "bus_a", "s1", "s2"):
        assert "sos_created" in names[who], who
    for who in ("s3", "bus_b"):
        assert "sos_created" not in names[who], who
    # students get the public SOS view without internal fields
    s1_sos = [e["args"][0] for e in got["s1"] if e["name"] == "sos_created"][0]
    assert "resolution_notes" not in s1_sos
    # student location goes to admin only
    s2.post("/api/student/location", {"latitude": 11.02, "longitude": 76.96})
    assert _events(socks["admin"], "student_location_updated")
    assert not _events(socks["bus_a"], "student_location_updated")
    assert not _events(socks["s1"], "student_location_updated")
    for s in socks.values():
        s.disconnect()


def test_database_persistence(db_path, tmp_path, admin, fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    # A brand-new application instance on the same database file sees the same records.
    app2 = create_app(TestConfig, SQLALCHEMY_DATABASE_URI=f"sqlite:///{db_path.as_posix()}",
                      FRONTEND_DIST=tmp_path / "no_dist")
    with app2.app_context():
        assert Student.query.count() == 3
        p = db.session.get(PickupRequest, pid)
        assert p is not None and p.status == "pending" and p.student.full_name == "Arun Kumar"
        db.engine.dispose()


def test_spa_routes_without_build(app):
    c = app.test_client()
    for path in ("/admin", "/student/map", "/bus/pickups", "/login"):
        r = c.get(path)
        assert r.status_code == 200
        assert b"SMARTBUS 360" in r.data
    assert c.get("/api/does-not-exist").status_code == 404
    assert c.get("/api/does-not-exist").get_json()["error"]["code"] == "NOT_FOUND"


def test_socket_origin_policy(app):
    from app import _origin_checker

    check = _origin_checker(["http://bus.local"])
    env = {"HTTP_HOST": "192.168.1.50", "wsgi.url_scheme": "http"}
    assert check("http://192.168.1.50", env)          # same origin via LAN IP
    assert check("http://bus.local", env)             # configured hostname
    assert not check("http://evil.example", env)      # foreign site


def test_driver_rfid_event_only_to_admin_and_own_bus(app, fleet, admin):
    s1, bus_a, bus_b = fleet["s1_client"](), fleet["bus_a_client"](), fleet["bus_b_client"]()
    socks = {n: socketio.test_client(app, flask_test_client=c.http)
             for n, c in {"admin": admin, "s1": s1, "bus_a": bus_a, "bus_b": bus_b}.items()}
    for s in socks.values():
        s.get_received()
    fleet["dev_a"].post("rfid", {"card_uid": "D1A2B3C4", "event_id": "sock-drv-1"})
    got = {n: [e["name"] for e in s.get_received()] for n, s in socks.items()}
    assert "driver_rfid_event" in got["admin"] and "driver_rfid_event" in got["bus_a"]
    assert "driver_rfid_event" not in got["s1"] and "driver_rfid_event" not in got["bus_b"]
    for s in socks.values():
        s.disconnect()
