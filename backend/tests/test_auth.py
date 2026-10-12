from conftest import ADMIN_PASSWORD, ApiClient, make_bus, make_student


def test_health_endpoint(app):
    r = app.test_client().get("/api/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["status"] == "ok" and body["database"] == "ok"
    assert "server_time" in body


def test_admin_login_and_me(admin):
    r = admin.get("/api/auth/me")
    assert r.status_code == 200
    assert r.get_json()["user"]["role"] == "admin"


def test_login_wrong_password_rejected(app):
    c = ApiClient(app)
    r = c.http.post("/api/auth/login", json={"username": "admin", "password": "wrong-pass1"})
    assert r.status_code == 401
    assert r.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_rate_limited(app):
    c = ApiClient(app)
    for _ in range(app.config["LOGIN_MAX_ATTEMPTS"]):
        assert c.http.post("/api/auth/login", json={"username": "admin", "password": "bad-pass1"}).status_code == 401
    r = c.http.post("/api/auth/login", json={"username": "admin", "password": ADMIN_PASSWORD})
    assert r.status_code == 429


def test_student_login_requires_password_change(admin, new_client):
    created = make_student(admin, "Meena Lakshmi", "22IT010")
    creds = created["credentials"]
    assert creds["username"] == "meena.lakshmi"
    assert creds["initial_password"] == "SB@22IT010"
    c = new_client()
    r = c.login(creds["username"], creds["initial_password"])
    assert r.get_json()["user"]["must_change_password"] is True
    blocked = c.get("/api/student/profile")
    assert blocked.status_code == 403 and blocked.get_json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"
    weak = c.post("/api/auth/change-password", {"current_password": creds["initial_password"], "new_password": "short"})
    assert weak.status_code == 422
    c.change_password(creds["initial_password"], "MeenaSecure9")
    ok = c.get("/api/student/profile")
    assert ok.status_code == 200
    assert ok.get_json()["student"]["register_number"] == "22IT010"


def test_bus_login(admin, new_client):
    created = make_bus(admin, "Bus 21", registration="TN38-Z-9999")
    creds = created["credentials"]
    assert creds["username"] == "bus_bus21"
    assert creds["initial_password"] == "Bus@BUS21#360"
    c = new_client()
    c.login(creds["username"], creds["initial_password"])
    c.change_password(creds["initial_password"], "Bus21Strong1")
    r = c.get("/api/bus/overview")
    assert r.status_code == 200
    assert r.get_json()["bus"]["bus_number"] == "BUS 21"


def test_csrf_required_for_mutations(admin):
    r = admin.http.post("/api/admin/routes", json={"name": "No CSRF"})  # no X-CSRF-Token header
    assert r.status_code == 403
    assert r.get_json()["error"]["code"] == "CSRF_FAILED"


def test_logout_invalidates_session(admin):
    assert admin.post("/api/auth/logout").status_code == 200
    assert admin.get("/api/auth/me").status_code == 401


def test_deactivated_user_cannot_login(admin, new_client):
    created = make_student(admin, "Old Student", "19EE001")
    admin.put(f"/api/admin/students/{created['student']['id']}", {"is_active": False})
    c = new_client()
    r = c.http.post("/api/auth/login", json={"username": created["credentials"]["username"],
                                             "password": created["credentials"]["initial_password"]})
    assert r.status_code == 403
    assert r.get_json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_unauthenticated_api_access_blocked(app):
    c = app.test_client()
    for url in ("/api/admin/overview", "/api/student/profile", "/api/bus/overview"):
        assert c.get(url).status_code == 401
