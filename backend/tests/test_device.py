import time


def test_device_token_authentication(fleet):
    dev = fleet["dev_a"]
    assert dev.http.post("/api/device/heartbeat", json={"bus_number": "07", "timestamp": int(time.time())}).status_code == 401
    assert dev.post("heartbeat", token="wrong-token").status_code == 401
    assert dev.post("heartbeat", device_id="ESP32-UNKNOWN").status_code == 401
    ok = dev.post("heartbeat", {"uptime_s": 120, "rssi_dbm": -60, "components": {"gps": "fix", "lcd": "ok"}})
    assert ok.status_code == 200, ok.get_json()
    assert ok.get_json()["config"]["bus_number"] == "07"


def test_device_register(fleet):
    r = fleet["dev_a"].post("register", {"firmware_version": "1.0.3"})
    assert r.status_code == 200
    assert r.get_json()["config"]["capacity"] == 40


def test_device_to_bus_authorization(fleet):
    dev_a = fleet["dev_a"]
    # Device A tries to report for bus 12 → rejected
    r = dev_a.post("gps", {"bus_number": "12", "latitude": 11.0, "longitude": 76.9})
    assert r.status_code == 403 and r.get_json()["error"]["code"] == "DEVICE_BUS_MISMATCH"
    # Device A's token cannot be used with device B's id
    r = dev_a.post("gps", {"latitude": 11.0, "longitude": 76.9}, device_id="ESP32-BUS12")
    assert r.status_code == 401
    # Missing bus_number
    r = dev_a.http.post("/api/device/gps", json={"latitude": 11.0, "longitude": 76.9, "timestamp": int(time.time())},
                        headers=dev_a.headers())
    assert r.status_code == 422


def test_device_disabled_after_removal(fleet, admin):
    admin.delete(f"/api/admin/buses/{fleet['bus_a']['bus']['id']}/device")
    assert fleet["dev_a"].post("heartbeat").status_code in (401, 403)


def test_gps_ingestion_and_validation(fleet):
    dev = fleet["dev_a"]
    assert dev.post("gps", {"latitude": 91, "longitude": 76.9}).status_code == 422
    assert dev.post("gps", {"latitude": 0, "longitude": 0}).status_code == 422
    assert dev.post("gps", {"latitude": 11.0, "longitude": 76.9, "timestamp": int(time.time()) + 3600}).status_code == 422
    nofix = dev.post("gps", {"fix": False})
    assert nofix.status_code == 200 and nofix.get_json()["stored"] is False
    r = dev.post("gps", {"latitude": 11.0183, "longitude": 76.9725, "speed_kmh": 32.5, "satellites": 9})
    assert r.status_code == 201
    s = fleet["s1_client"]()
    loc = s.get("/api/student/bus-status").get_json()["location"]
    assert loc["available"] and loc["state"] == "live" and loc["latitude"] == 11.0183


def test_occupancy_validation(fleet, app):
    dev = fleet["dev_a"]
    over = dev.post("occupancy", {"occupied": 41})  # capacity 40
    assert over.status_code == 422 and over.get_json()["error"]["code"] == "OCCUPANCY_OUT_OF_RANGE"
    assert dev.post("occupancy", {"occupied": -1}).status_code == 422
    assert dev.post("occupancy", {"occupied": "many"}).status_code == 422
    ok = dev.post("occupancy", {"occupied": 25})
    assert ok.status_code == 201 and ok.get_json()["available_seats"] == 15
    bus = fleet["bus_a_client"]()
    occ = bus.get("/api/bus/occupancy").get_json()
    assert occ["occupancy"]["occupied"] == 25 and occ["occupancy"]["available_seats"] == 15
    assert len(occ["history"]) == 1  # the rejected reading was never stored
    dev_info = bus.get("/api/bus/device").get_json()["device"]
    assert "occupancy rejected" in dev_info["last_error"]


def test_alcohol_validation_and_warning(fleet, admin):
    dev = fleet["dev_a"]
    assert dev.post("alcohol", {"raw_adc": 5000}).status_code == 422
    assert dev.post("alcohol", {"sensor_state": "bogus", "raw_adc": 100}).status_code == 422
    assert dev.post("alcohol", {"sensor_state": "warming_up"}).get_json()["status"] == "warming_up"
    assert dev.post("alcohol", {"raw_adc": 800}).get_json()["status"] == "normal"
    w = dev.post("alcohol", {"raw_adc": 2600})
    assert w.status_code == 201 and w.get_json()["status"] == "warning"
    bus = fleet["bus_a_client"]()
    status = bus.get("/api/bus/alcohol-status").get_json()
    assert status["alcohol"]["label"] == "Warning"
    assert "do not measure blood alcohol" in status["alcohol"]["disclaimer"]
    assert len(status["warnings"]) == 1
    assert admin.get("/api/admin/overview").get_json()["kpis"]["alcohol_warnings"] == 1
    # threshold is configurable per bus
    admin.put(f"/api/admin/buses/{fleet['bus_a']['bus']['id']}", {"alcohol_threshold": 3000})
    assert dev.post("alcohol", {"raw_adc": 2600}).get_json()["status"] == "normal"


def test_sos_incident_creation_and_duplicates(fleet, admin):
    dev = fleet["dev_a"]
    dev.post("gps", {"latitude": 11.0183, "longitude": 76.9725})
    r = dev.post("sos", {"event_id": "sos-0001"})
    assert r.status_code == 201
    first = r.get_json()
    assert first["incident"]["location_source"] == "last_known_gps"
    dup = dev.post("sos", {"event_id": "sos-0001"})
    assert dup.status_code == 200 and dup.get_json()["duplicate"] is True
    assert dup.get_json()["incident_id"] == first["incident_id"]
    incidents = admin.get("/api/admin/incidents").get_json()["items"]
    assert len(incidents) == 1 and incidents[0]["status"] == "active"
    # visible to students of that bus only
    assert len(fleet["s1_client"]().get("/api/student/alerts").get_json()["items"]) == 1
    assert fleet["s3_client"]().get("/api/student/alerts").get_json()["items"] == []
    # acknowledge + resolve with audit trail
    iid = first["incident_id"]
    assert admin.post(f"/api/admin/incidents/{iid}/acknowledge", {"note": "Called driver"}).status_code == 200
    assert admin.post(f"/api/admin/incidents/{iid}/resolve", {}).status_code == 422
    res = admin.post(f"/api/admin/incidents/{iid}/resolve", {"resolution_notes": "False alarm confirmed by driver"})
    assert res.get_json()["incident"]["status"] == "resolved"
    actions = [e["action"] for e in admin.get("/api/admin/audit-logs?action=incident").get_json()["items"]]
    assert {"incident.created", "incident.acknowledged", "incident.resolved"} <= set(actions)


def test_sos_never_rejected_for_bad_gps_or_clock(fleet):
    r = fleet["dev_a"].post("sos", {"event_id": "sos-bad-gps", "latitude": 999, "longitude": 0,
                                    "timestamp": "not-a-time", "sos_type": "medical"})
    assert r.status_code == 201
    inc = r.get_json()["incident"]
    assert inc["latitude"] is None and inc["incident_type"] == "medical"


def test_students_onboard_comes_from_occupancy_sensor(fleet, admin):
    fleet["dev_a"].post("occupancy", {"occupied": 18})
    fleet["dev_b"].post("occupancy", {"occupied": 7, "bus_number": "12"})
    k = admin.get("/api/admin/overview").get_json()["kpis"]
    assert k["students_onboard"] == 25
    assert k["available_seats"] == (40 - 18) + (30 - 7)


def test_command_ack(fleet, admin):
    bus = fleet["bus_a_client"]()
    r = bus.post("/api/bus/lcd-message", {"line1": "Delay 10 min", "line2": "Traffic"})
    assert r.status_code == 201
    cmds = fleet["dev_a"].get("commands").get_json()["commands"]
    lcd = [c for c in cmds if c["type"] == "lcd_message"][0]
    assert lcd["payload"]["line1"] == "Delay 10 min"
    assert fleet["dev_b"].post("command-ack", {"command_id": lcd["command_id"]}).status_code == 404
    ack = fleet["dev_a"].post("command-ack", {"command_id": lcd["command_id"], "result": "ok"})
    assert ack.status_code == 200 and ack.get_json()["command"]["status"] == "acknowledged"
    again = fleet["dev_a"].get("commands").get_json()["commands"]
    assert all(c["command_id"] != lcd["command_id"] for c in again)


def test_combined_telemetry_partial_rejection(fleet):
    r = fleet["dev_a"].post("telemetry", {"gps": {"latitude": 11.02, "longitude": 76.97},
                                          "occupancy": {"occupied": 999},
                                          "alcohol": {"raw_adc": 500}})
    assert r.status_code == 207
    body = r.get_json()
    assert body["results"]["gps"]["stored"] is True
    assert body["results"]["alcohol"]["status"] == "normal"
    assert body["errors"]["occupancy"]["code"] == "OCCUPANCY_OUT_OF_RANGE"


def test_device_online_status(fleet, admin):
    fleet["dev_a"].post("heartbeat", {"components": {"gps": "fix"}})
    k = admin.get("/api/admin/overview").get_json()["kpis"]
    assert k["online_buses"] == 1 and k["offline_buses"] == 1
