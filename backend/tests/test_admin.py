from app.extensions import db
from app.models import AuditLog, User
from conftest import make_bus, make_route, make_student


def test_role_based_access_restrictions(fleet):
    student = fleet["s1_client"]()
    bus = fleet["bus_a_client"]()
    assert student.get("/api/admin/overview").status_code == 403
    assert student.get("/api/bus/overview").status_code == 403
    assert bus.get("/api/admin/students").status_code == 403
    assert bus.get("/api/student/profile").status_code == 403


def test_only_admin_can_create_accounts(fleet):
    student = fleet["s1_client"]()
    bus = fleet["bus_a_client"]()
    payload = {"full_name": "Hacker", "register_number": "99XX999", "department": "X", "year": 1, "phone": "9000000000"}
    assert student.post("/api/admin/students", payload).status_code == 403
    assert bus.post("/api/admin/students", payload).status_code == 403
    bus_payload = {"bus_number": "99", "registration_number": "X", "driver_name": "Xy", "driver_phone": "9000000000",
                   "capacity": 10}
    assert student.post("/api/admin/buses", bus_payload).status_code == 403


def test_duplicate_register_number_rejected(admin):
    make_student(admin, "Arun Kumar", "21EC045")
    r = admin.post("/api/admin/students", {"full_name": "Another Person", "register_number": "21ec045",
                                           "department": "ECE", "year": 2, "phone": "9123456789"})
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "DUPLICATE_REGISTER_NUMBER"


def test_username_collision_gets_suffix(admin):
    a = make_student(admin, "Arun Kumar", "21EC045")
    b = make_student(admin, "Arun Kumar", "21EC046")
    assert a["credentials"]["username"] == "arun.kumar"
    assert b["credentials"]["username"] == "arun.kumar2"


def test_students_have_no_rfid(admin, fleet):
    """Students do not carry RFID cards: no RFID field or attendance module for students."""
    listing = admin.get("/api/admin/students").get_data(as_text=True)
    assert "rfid" not in listing.lower()
    assert fleet["s1_client"]().get("/api/student/attendance").status_code == 404
    assert admin.get("/api/admin/reports?type=attendance").status_code == 422


def test_duplicate_bus_number_rejected(admin):
    make_bus(admin, "07")
    r = admin.post("/api/admin/buses", {"bus_number": "07", "registration_number": "TN38-OTHER",
                                        "driver_name": "Someone", "driver_phone": "9000000001", "capacity": 30})
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "DUPLICATE_BUS_NUMBER"


def test_passwords_are_hashed_and_never_listed(app, admin):
    created = make_student(admin, "Arun Kumar", "21EC045")
    with app.app_context():
        u = User.query.filter_by(username="arun.kumar").first()
        assert u.password_hash.startswith("scrypt:")
        assert "21EC045" not in u.password_hash
    listing = admin.get("/api/admin/students").get_data(as_text=True)
    assert "SB@21EC045" not in listing and "password_hash" not in listing and "scrypt" not in listing
    detail = admin.get(f"/api/admin/students/{created['student']['id']}").get_data(as_text=True)
    assert "SB@21EC045" not in detail
    csv_text = admin.get("/api/admin/reports?type=students&format=csv").get_data(as_text=True)
    assert "SB@21EC045" not in csv_text and "Arun Kumar" in csv_text
    with app.app_context():
        for entry in AuditLog.query.all():
            assert "SB@21EC045" not in str(entry.details)


def test_stop_must_belong_to_bus_route(admin):
    route_a = make_route(admin, "Route A")
    route_b = make_route(admin, "Route B", stops=(("Ukkadam", 10.99, 76.96),))
    bus = make_bus(admin, "07", route_id=route_a["id"])
    r = admin.post("/api/admin/students", {"full_name": "X Y", "register_number": "21AB001", "department": "ECE",
                                           "year": 1, "phone": "9123456789", "bus_id": bus["bus"]["id"],
                                           "boarding_stop_id": route_b["stops"][0]["id"]})
    assert r.status_code == 422


def test_overview_reports_real_counts_without_fake_data(admin, fleet):
    k = admin.get("/api/admin/overview").get_json()["kpis"]
    assert k["total_students"] == 3
    assert k["total_buses"] == 2
    assert k["online_buses"] == 0          # devices provisioned but never connected
    assert k["available_seats"] is None    # no hardware occupancy data yet → not invented
    assert k["students_onboard"] is None
    assert k["active_sos"] == 0 and k["pending_pickups"] == 0


def test_device_token_shown_once_and_stored_hashed(app, admin):
    created = make_bus(admin, "33", device_id="ESP32-33")
    token = created["device"]["device_token"]
    assert len(token) >= 32
    detail = admin.get(f"/api/admin/buses/{created['bus']['id']}").get_data(as_text=True)
    assert token not in detail
    from app.models import DeviceRegistry

    with app.app_context():
        d = DeviceRegistry.query.filter_by(device_id="ESP32-33").first()
        assert d.token_hash != token and len(d.token_hash) == 64


def test_reports_all_types(admin, fleet):
    for kind in ("students", "buses", "driver_duty", "pickups", "occupancy", "device_status", "sos", "alcohol"):
        r = admin.get(f"/api/admin/reports?type={kind}")
        assert r.status_code == 200, kind
        assert "columns" in r.get_json()
    assert admin.get("/api/admin/reports?type=bogus").status_code == 422


def test_reset_password_forces_change(admin, new_client, fleet):
    sid = fleet["s1"]["student"]["id"]
    r = admin.post(f"/api/admin/students/{sid}/reset-password")
    temp = r.get_json()["credentials"]["temporary_password"]
    c = new_client()
    body = c.login("arun.kumar", temp).get_json()
    assert body["user"]["must_change_password"] is True
