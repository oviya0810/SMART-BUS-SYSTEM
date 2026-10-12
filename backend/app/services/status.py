"""Live status derived ONLY from hardware-reported data stored in the database.

When no data (or only stale data) exists the response says so explicitly;
nothing is fabricated.
"""
from __future__ import annotations

from flask import current_app

from ..models import AlcoholReading, Bus, BusLocation, DeviceRegistry, DriverRFIDEvent, OccupancyReading, SOSIncident
from ..utils.time import age_seconds, iso


def latest_location(bus_id: int) -> BusLocation | None:
    return BusLocation.query.filter_by(bus_id=bus_id).order_by(BusLocation.received_at.desc(), BusLocation.id.desc()).first()


def latest_occupancy(bus_id: int) -> OccupancyReading | None:
    return (OccupancyReading.query.filter_by(bus_id=bus_id)
            .order_by(OccupancyReading.received_at.desc(), OccupancyReading.id.desc()).first())


def latest_alcohol(bus_id: int) -> AlcoholReading | None:
    return (AlcoholReading.query.filter_by(bus_id=bus_id)
            .order_by(AlcoholReading.received_at.desc(), AlcoholReading.id.desc()).first())


def device_online(device: DeviceRegistry | None) -> bool:
    if device is None or not device.is_active or device.last_seen_at is None:
        return False
    return age_seconds(device.last_seen_at) <= current_app.config["DEVICE_OFFLINE_SECONDS"]


def location_status(bus: Bus) -> dict:
    loc = latest_location(bus.id)
    if loc is None:
        return {"available": False, "state": "no_data", "message": "Bus location not available yet."}
    age = age_seconds(loc.received_at)
    stale = age > current_app.config["GPS_STALE_SECONDS"]
    return {
        "available": True,
        "state": "stale" if stale else "live",
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "speed_kmh": loc.speed_kmh,
        "heading_deg": loc.heading_deg,
        "satellites": loc.satellites,
        "hdop": loc.hdop,
        "device_timestamp": iso(loc.device_timestamp),
        "received_at": iso(loc.received_at),
        "age_seconds": int(age),
        "message": "GPS data is stale — last fix is older than the freshness limit." if stale else None,
    }


def occupancy_status(bus: Bus) -> dict:
    reading = latest_occupancy(bus.id)
    online = device_online(bus.device)
    base = {"capacity": bus.capacity, "sensor_connected": online}
    if reading is None:
        return {**base, "available": False, "state": "no_data", "occupied": None, "available_seats": None,
                "occupancy_percent": None, "message": "Waiting for hardware data"}
    age = age_seconds(reading.received_at)
    stale = age > current_app.config["OCCUPANCY_STALE_SECONDS"]
    sensor_ok = reading.sensor_status == "ok"
    state = "live"
    message = None
    if not sensor_ok:
        state, message = "sensor_error", f"Sensor reported status '{reading.sensor_status}'."
    elif stale:
        state, message = "stale", "Sensor offline" if not online else "Occupancy data is stale."
    occupied = min(reading.occupied, bus.capacity)
    return {
        **base,
        "available": True,
        "state": state,
        "occupied": occupied,
        "available_seats": max(0, bus.capacity - occupied),
        "occupancy_percent": round(occupied * 100.0 / bus.capacity, 1) if bus.capacity else None,
        "sensor_status": reading.sensor_status,
        "device_timestamp": iso(reading.device_timestamp),
        "received_at": iso(reading.received_at),
        "age_seconds": int(age),
        "message": message,
    }


ALCOHOL_LABELS = {
    "warming_up": "Warming Up",
    "normal": "Normal",
    "warning": "Warning",
    "sensor_error": "Sensor Error",
    "offline": "Offline",
    "no_data": "Offline",
}


def alcohol_status(bus: Bus) -> dict:
    reading = latest_alcohol(bus.id)
    base = {"threshold": bus.alcohol_threshold,
            "disclaimer": "Raw MQ-3 ADC values are an indicative screening signal only. They do not measure "
                          "blood alcohol concentration and do not prove intoxication."}
    if reading is None:
        return {**base, "available": False, "state": "offline", "label": "Offline", "raw_adc": None,
                "message": "Waiting for hardware data"}
    age = age_seconds(reading.received_at)
    stale = age > current_app.config["ALCOHOL_STALE_SECONDS"]
    state = "offline" if stale else reading.status
    return {
        **base,
        "available": True,
        "state": state,
        "label": ALCOHOL_LABELS.get(state, state),
        "last_status": reading.status,
        "raw_adc": reading.raw_adc,
        "reading_threshold": reading.threshold,
        "device_timestamp": iso(reading.device_timestamp),
        "received_at": iso(reading.received_at),
        "age_seconds": int(age),
        "message": "No recent alcohol sensor data — sensor or device offline." if stale else None,
    }


def device_status(bus: Bus) -> dict:
    device = bus.device
    if device is None:
        return {"assigned": False, "online": False, "message": "No ESP32 device is associated with this bus."}
    online = device_online(device)
    return {
        "assigned": True,
        "device_id": device.device_id,
        "is_active": device.is_active,
        "online": online,
        "connection": "online" if online else ("never_connected" if device.last_seen_at is None else "offline"),
        "firmware_version": device.firmware_version,
        "registered_at": iso(device.registered_at),
        "last_seen_at": iso(device.last_seen_at),
        "last_telemetry_at": iso(device.last_telemetry_at),
        "last_seen_age_seconds": int(age_seconds(device.last_seen_at)) if device.last_seen_at else None,
        "last_ip": device.last_ip,
        "components": {
            "gps": device.gps_status or "unknown",
            "occupancy_sensor": device.occupancy_sensor_status or "unknown",
            "alcohol_sensor": device.alcohol_sensor_status or "unknown",
            "lcd": device.lcd_status or "unknown",
            "buzzer": device.buzzer_status or "unknown",
            "rfid_reader": device.rfid_reader_status or "unknown",
        },
        "last_error": device.last_error,
        "last_error_at": iso(device.last_error_at),
    }


def latest_duty_event(bus_id: int) -> DriverRFIDEvent | None:
    return (DriverRFIDEvent.query.filter_by(bus_id=bus_id, result="authorized")
            .order_by(DriverRFIDEvent.device_timestamp.desc(), DriverRFIDEvent.id.desc()).first())


def driver_duty_status(bus: Bus) -> dict:
    """Driver duty state from authorized driver ID-card taps on the bus RFID reader."""
    last = latest_duty_event(bus.id)
    last_tap = (DriverRFIDEvent.query.filter_by(bus_id=bus.id)
                .order_by(DriverRFIDEvent.received_at.desc(), DriverRFIDEvent.id.desc()).first())
    on_duty = bool(last and last.action == "duty_start")
    return {
        "card_registered": bool(bus.driver_rfid_uid),
        "on_duty": on_duty,
        "state": "on_duty" if on_duty else ("off_duty" if last else "no_data"),
        "driver_name": (last.driver_name if last else None) or bus.driver_name,
        "since": iso(last.device_timestamp) if last else None,
        "last_tap_at": iso(last_tap.received_at) if last_tap else None,
        "last_tap_result": last_tap.result if last_tap else None,
    }


def active_incident_count(bus_id: int) -> int:
    return SOSIncident.query.filter(SOSIncident.bus_id == bus_id, SOSIncident.status != "resolved").count()


def bus_live_summary(bus: Bus) -> dict:
    return {
        "location": location_status(bus),
        "occupancy": occupancy_status(bus),
        "alcohol": alcohol_status(bus),
        "device": device_status(bus),
        "driver": driver_duty_status(bus),
        "active_incidents": active_incident_count(bus.id),
    }
