"""Driver ID card on the bus RFID reader: duty start / duty end."""
from conftest import make_bus


def test_driver_card_toggles_duty(fleet, admin):
    dev = fleet["dev_a"]
    r = dev.post("rfid", {"card_uid": "d1:a2:b3:c4", "event_id": "drv-1"})
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["authorized"] is True and body["action"] == "duty_start"
    assert body["lcd_line1"] == "DUTY STARTED" and body["driver_name"] == "Ravi Kumar"
    bus = fleet["bus_a_client"]()
    duty = bus.get("/api/bus/driver-duty").get_json()
    assert duty["duty"]["on_duty"] is True and len(duty["events"]) == 1
    r2 = dev.post("rfid", {"card_uid": "D1A2B3C4", "event_id": "drv-2"}).get_json()
    assert r2["action"] == "duty_end"
    assert bus.get("/api/bus/driver-duty").get_json()["duty"]["on_duty"] is False
    detail = admin.get(f"/api/admin/buses/{fleet['bus_a']['bus']['id']}").get_json()
    assert detail["live"]["driver"]["state"] == "off_duty"
    assert len(detail["driver_events"]) == 2


def test_driver_card_duplicate_event_ignored(fleet):
    dev = fleet["dev_a"]
    dev.post("rfid", {"card_uid": "D1A2B3C4", "event_id": "drv-dup"})
    again = dev.post("rfid", {"card_uid": "D1A2B3C4", "event_id": "drv-dup"})
    assert again.status_code == 200 and again.get_json()["duplicate"] is True
    assert len(fleet["bus_a_client"]().get("/api/bus/driver-duty").get_json()["events"]) == 1


def test_unknown_and_other_bus_cards_rejected(fleet, admin):
    dev = fleet["dev_a"]
    unknown = dev.post("rfid", {"card_uid": "FFFFFFFF", "event_id": "drv-x1"}).get_json()
    assert unknown["authorized"] is False and unknown["result"] == "unknown_card" and unknown["buzzer"] == "deny"
    other = dev.post("rfid", {"card_uid": "D9E8F7A6", "event_id": "drv-x2"}).get_json()  # bus 12 driver
    assert other["result"] == "other_bus_driver"
    duty = fleet["bus_a_client"]().get("/api/bus/driver-duty").get_json()["duty"]
    assert duty["on_duty"] is False and duty["last_tap_result"] == "other_bus_driver"
    notes = admin.get("/api/notifications").get_json()["items"]
    assert any(n["title"] == "Unauthorized driver card" for n in notes)


def test_driver_card_validation(fleet, admin):
    dev = fleet["dev_a"]
    assert dev.post("rfid", {"card_uid": "zz-not-hex", "event_id": "v1"}).status_code == 422
    assert dev.post("rfid", {"card_uid": "D1A2B3C4"}).status_code == 422  # event_id required
    assert dev.post("rfid", {"card_uid": "D1A2B3C4", "event_id": "v2", "bus_number": "12"}).status_code == 403
    # driver card UIDs are unique across buses
    r = admin.post("/api/admin/buses", {"bus_number": "33", "registration_number": "TN38-X-33", "driver_name": "Mani",
                                        "driver_phone": "9000000033", "capacity": 30, "driver_rfid_uid": "d1a2b3c4"})
    assert r.status_code == 409 and r.get_json()["error"]["code"] == "DUPLICATE_DRIVER_RFID"
    upd = admin.put(f"/api/admin/buses/{fleet['bus_a']['bus']['id']}", {"driver_rfid_uid": "AABBCCDD"})
    assert upd.status_code == 200 and upd.get_json()["bus"]["driver_rfid_uid"] == "AABBCCDD"


def test_no_card_registered_means_rejected(admin, app):
    created = make_bus(admin, "44", device_id="ESP32-44")
    from conftest import Device

    dev = Device(app, "ESP32-44", created["device"]["device_token"], "44")
    r = dev.post("rfid", {"card_uid": "01020304", "event_id": "n1"}).get_json()
    assert r["result"] == "unknown_card"
