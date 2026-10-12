def test_student_location_submission(fleet):
    s = fleet["s1_client"]()
    r = s.post("/api/student/location", {"latitude": 11.0168, "longitude": 76.9558, "accuracy_m": 12.5})
    assert r.status_code == 201
    assert r.get_json()["location"]["latitude"] == 11.0168


def test_gps_coordinate_validation(fleet):
    s = fleet["s1_client"]()
    for bad in ({"latitude": 95, "longitude": 76.9}, {"latitude": 11, "longitude": 181},
                {"latitude": "abc", "longitude": 76.9}, {"latitude": 0, "longitude": 0},
                {"latitude": None, "longitude": 76.9}, {"latitude": True, "longitude": 76.9},
                {"latitude": "NaN", "longitude": 76.9}):
        r = s.post("/api/student/location", bad)
        assert r.status_code == 422, bad


def test_pickup_request_creation_and_status(fleet):
    s = fleet["s1_client"]()
    r = s.post("/api/student/pickup-requests", {"latitude": 11.0170, "longitude": 76.9560,
                                                "boarding_stop_id": fleet["route"]["stops"][0]["id"]})
    assert r.status_code == 201, r.get_json()
    p = r.get_json()["pickup_request"]
    assert p["status"] == "pending" and p["boarding_stop_name"] == "Gandhipuram"
    assert p["location_source"] == "phone_gps"
    mine = s.get("/api/student/pickup-requests").get_json()["items"]
    assert [x["id"] for x in mine] == [p["id"]]


def test_pickup_with_stop_only_uses_stop_coordinates(fleet):
    s = fleet["s2_client"]()
    stop = fleet["route"]["stops"][1]
    r = s.post("/api/student/pickup-requests", {"boarding_stop_id": stop["id"]})
    assert r.status_code == 201
    p = r.get_json()["pickup_request"]
    assert p["location_source"] == "stop" and p["latitude"] == stop["latitude"]


def test_multiple_students_requests_do_not_overwrite(fleet):
    s1, s2 = fleet["s1_client"](), fleet["s2_client"]()
    a = s1.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]
    b = s2.post("/api/student/pickup-requests", {"latitude": 11.02, "longitude": 76.96}).get_json()["pickup_request"]
    assert a["id"] != b["id"]
    bus = fleet["bus_a_client"]()
    items = bus.get("/api/bus/pickup-requests").get_json()["items"]
    assert {i["student_name"] for i in items} == {"Arun Kumar", "Divya Priya"}


def test_second_active_request_rejected(fleet):
    s = fleet["s1_client"]()
    assert s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).status_code == 201
    r = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95})
    assert r.status_code == 409 and r.get_json()["error"]["code"] == "ACTIVE_REQUEST_EXISTS"


def test_pickup_visible_to_assigned_bus_only(fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    bus_a, bus_b = fleet["bus_a_client"](), fleet["bus_b_client"]()
    a_items = bus_a.get("/api/bus/pickup-requests").get_json()["items"]
    assert [i["id"] for i in a_items] == [pid]
    assert "register_number" not in a_items[0]  # not exposed unless operationally necessary
    assert bus_b.get("/api/bus/pickup-requests").get_json()["items"] == []


def test_bus_cannot_modify_another_bus_request(fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    bus_b = fleet["bus_b_client"]()
    r = bus_b.post(f"/api/bus/pickup-requests/{pid}/status", {"status": "accepted"})
    assert r.status_code == 404


def test_pickup_status_flow_and_history(fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    bus = fleet["bus_a_client"]()
    bad = bus.post(f"/api/bus/pickup-requests/{pid}/status", {"status": "approaching"})
    assert bad.status_code == 409  # cannot skip "accepted"
    for status in ("accepted", "approaching", "picked_up"):
        r = bus.post(f"/api/bus/pickup-requests/{pid}/status", {"status": status})
        assert r.status_code == 200, r.get_json()
    final = s.get("/api/student/pickup-requests").get_json()["items"][0]
    assert final["status"] == "picked_up"
    assert [h["to_status"] for h in final["history"]] == ["pending", "accepted", "approaching", "picked_up"]
    notes = s.get("/api/notifications").get_json()
    assert notes["unread"] >= 3


def test_bus_cancel_requires_reason(fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    bus = fleet["bus_a_client"]()
    assert bus.post(f"/api/bus/pickup-requests/{pid}/status", {"status": "cancelled"}).status_code == 422
    r = bus.post(f"/api/bus/pickup-requests/{pid}/status", {"status": "cancelled", "reason": "Route diverted"})
    assert r.status_code == 200 and r.get_json()["pickup_request"]["cancel_reason"] == "Route diverted"


def test_student_cannot_see_or_cancel_others_requests(fleet):
    s1, s2 = fleet["s1_client"](), fleet["s2_client"]()
    pid = s1.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95}).get_json()["pickup_request"]["id"]
    assert s2.get("/api/student/pickup-requests").get_json()["items"] == []
    assert s2.post(f"/api/student/pickup-requests/{pid}/cancel", {}).status_code == 404
    assert s1.post(f"/api/student/pickup-requests/{pid}/cancel", {}).status_code == 200


def test_pickup_reaches_esp32_command_queue(fleet):
    s = fleet["s1_client"]()
    pid = s.post("/api/student/pickup-requests", {"latitude": 11.01, "longitude": 76.95,
                                                  "boarding_stop_id": fleet["route"]["stops"][0]["id"]}
                 ).get_json()["pickup_request"]["id"]
    r = fleet["dev_a"].get("commands")
    assert r.status_code == 200
    body = r.get_json()
    assert any(c["type"] == "pickup_request" and c["payload"]["pickup_id"] == pid for c in body["commands"])
    assert body["active_pickups"][0]["student_name"] == "Arun Kumar"
    assert body["active_pickups"][0]["boarding_stop"] == "Gandhipuram"
    other = fleet["dev_b"].get("commands").get_json()
    assert other["commands"] == [] and other["active_pickups"] == []


def test_bus_status_without_hardware_data_is_explicit(fleet):
    s = fleet["s1_client"]()
    body = s.get("/api/student/bus-status").get_json()
    assert body["location"]["available"] is False
    assert body["occupancy"]["available"] is False
    assert body["occupancy"]["message"] == "Waiting for hardware data"
    assert body["occupancy"]["occupied"] is None
