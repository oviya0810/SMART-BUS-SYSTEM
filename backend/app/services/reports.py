"""Admin reports (JSON or CSV). No password or token data is ever included."""
from __future__ import annotations

import csv
import io
from collections import defaultdict

from flask import current_app

from ..extensions import db

from ..models import (
    AlcoholReading,
    Bus,
    DeviceHeartbeat,
    DeviceRegistry,
    DriverRFIDEvent,
    OccupancyReading,
    PickupRequest,
    SOSIncident,
    Student,
)
from ..utils.errors import ApiError
from ..utils.time import iso
from .serializers import INCIDENT_LABELS, PICKUP_LABELS

REPORT_TYPES = ("students", "buses", "driver_duty", "pickups", "occupancy", "device_status", "sos", "alcohol")


def _bus_filter(q, model, bus_id, route_id):
    if bus_id:
        q = q.filter(model.bus_id == bus_id)
    if route_id:
        q = q.join(Bus, Bus.id == model.bus_id).filter(Bus.route_id == route_id)
    return q


def _range(q, column, start, end):
    if start:
        q = q.filter(column >= start)
    if end:
        q = q.filter(column < end)
    return q


def build_report(kind: str, *, start=None, end=None, bus_id=None, route_id=None, incident_type=None,
                 limit: int = 5000) -> tuple[list[str], list[list]]:
    if kind not in REPORT_TYPES:
        raise ApiError(422, "VALIDATION_ERROR", f"type must be one of: {', '.join(REPORT_TYPES)}", {"type": "invalid"})

    if kind == "students":
        cols = ["Register Number", "Full Name", "Department", "Year", "Phone", "Username", "Active", "Bus",
                "Route", "Boarding Stop", "Destination Stop", "Created At"]
        rows = []
        for s in Student.query.order_by(Student.full_name).all():
            b = s.bus
            if bus_id and (b is None or b.id != bus_id):
                continue
            if route_id and (b is None or b.route_id != route_id):
                continue
            rows.append([s.register_number, s.full_name, s.department, s.year, s.phone, s.user.username,
                         "Yes" if s.user.is_active else "No", b.bus_number if b else "",
                         b.route.name if b and b.route else "", s.boarding_stop.name if s.boarding_stop else "",
                         s.destination_stop.name if s.destination_stop else "",
                         iso(s.created_at)])
        return cols, rows

    if kind == "buses":
        cols = ["Bus Number", "Registration", "Route", "Driver", "Driver Phone", "Driver Card UID", "Capacity", "Username",
                "Device ID", "Active", "Alcohol Threshold", "Assigned Students"]
        q = Bus.query.order_by(Bus.bus_number)
        if bus_id:
            q = q.filter(Bus.id == bus_id)
        if route_id:
            q = q.filter(Bus.route_id == route_id)
        rows = [[b.bus_number, b.registration_number, b.route.name if b.route else "", b.driver_name, b.driver_phone,
                 b.driver_rfid_uid or "", b.capacity, b.user.username, b.device.device_id if b.device else "", "Yes" if b.is_active else "No",
                 b.alcohol_threshold, sum(1 for a in b.assignments if a.is_active)] for b in q.all()]
        return cols, rows

    if kind == "driver_duty":
        cols = ["Device Time", "Received At", "Bus", "Driver", "Card UID", "Action", "Result"]
        q = _range(_bus_filter(DriverRFIDEvent.query, DriverRFIDEvent, bus_id, route_id),
                   DriverRFIDEvent.received_at, start, end)
        rows = [[iso(e.device_timestamp), iso(e.received_at), e.bus.bus_number if e.bus else "", e.driver_name or "",
                 e.card_uid, (e.action or "").replace("_", " "), e.result]
                for e in q.order_by(DriverRFIDEvent.received_at.desc()).limit(limit).all()]
        return cols, rows

    if kind == "pickups":
        cols = ["ID", "Created At", "Bus", "Register Number", "Student", "Boarding Stop", "Latitude", "Longitude",
                "Location Source", "Status", "Accepted At", "Picked Up At", "Cancel Reason"]
        q = _range(_bus_filter(PickupRequest.query, PickupRequest, bus_id, route_id), PickupRequest.created_at, start, end)
        rows = [[p.id, iso(p.created_at), p.bus.bus_number, p.student.register_number, p.student.full_name,
                 p.boarding_stop_name, p.latitude, p.longitude, p.location_source, PICKUP_LABELS[p.status],
                 iso(p.accepted_at), iso(p.picked_up_at), p.cancel_reason or ""]
                for p in q.order_by(PickupRequest.created_at.desc()).limit(limit).all()]
        return cols, rows

    if kind == "occupancy":
        cols = ["Received At", "Device Time", "Bus", "Occupied", "Capacity", "Available", "Occupancy %", "Sensor Status"]
        q = _range(_bus_filter(OccupancyReading.query, OccupancyReading, bus_id, route_id),
                   OccupancyReading.received_at, start, end)
        rows = []
        bus_cache = {}
        for r in q.order_by(OccupancyReading.received_at.desc()).limit(limit).all():
            bus = bus_cache.setdefault(r.bus_id, db.session.get(Bus, r.bus_id))
            rows.append([iso(r.received_at), iso(r.device_timestamp), bus.bus_number, r.occupied, r.capacity,
                         r.capacity - r.occupied, round(r.occupied * 100 / r.capacity, 1), r.sensor_status])
        return cols, rows

    if kind == "device_status":
        interval = current_app.config["DEVICE_HEARTBEAT_INTERVAL_SECONDS"]
        cols = ["Device ID", "Bus", "Active", "Last Seen", "Firmware", "Heartbeats In Range",
                "First Heartbeat", "Last Heartbeat", "Estimated Online Minutes", "Last Error"]
        rows = []
        q = DeviceRegistry.query
        if bus_id:
            q = q.filter(DeviceRegistry.bus_id == bus_id)
        for d in q.order_by(DeviceRegistry.device_id).all():
            if route_id and (d.bus is None or d.bus.route_id != route_id):
                continue
            hq = _range(DeviceHeartbeat.query.filter_by(device_pk=d.id), DeviceHeartbeat.received_at, start, end)
            beats = hq.order_by(DeviceHeartbeat.received_at).all()
            minutes = set()
            for hb in beats:
                minutes.add(hb.received_at.replace(second=0, microsecond=0))
            est = round(min(len(beats) * interval / 60.0, len(minutes) * max(1, interval / 60.0)), 1)
            rows.append([d.device_id, d.bus.bus_number if d.bus else "", "Yes" if d.is_active else "No",
                         iso(d.last_seen_at), d.firmware_version or "", len(beats),
                         iso(beats[0].received_at) if beats else "", iso(beats[-1].received_at) if beats else "",
                         est, d.last_error or ""])
        return cols, rows

    if kind == "sos":
        cols = ["ID", "Created At", "Bus", "Type", "Source", "Event ID", "Latitude", "Longitude", "Location Source",
                "Status", "Acknowledged At", "Resolved At", "Resolution Notes"]
        q = _range(_bus_filter(SOSIncident.query, SOSIncident, bus_id, route_id), SOSIncident.created_at, start, end)
        if incident_type:
            q = q.filter(SOSIncident.incident_type == incident_type)
        rows = [[i.id, iso(i.created_at), i.bus.bus_number, INCIDENT_LABELS.get(i.incident_type), i.source, i.event_id,
                 i.latitude, i.longitude, i.location_source or "", i.status, iso(i.acknowledged_at), iso(i.resolved_at),
                 i.resolution_notes or ""] for i in q.order_by(SOSIncident.created_at.desc()).limit(limit).all()]
        return cols, rows

    # alcohol warnings
    cols = ["Received At", "Device Time", "Bus", "Raw ADC", "Threshold", "Status"]
    q = _range(_bus_filter(AlcoholReading.query, AlcoholReading, bus_id, route_id), AlcoholReading.received_at, start, end)
    q = q.filter(AlcoholReading.status.in_(("warning", "sensor_error")))
    bus_cache = defaultdict(lambda: None)
    rows = []
    for r in q.order_by(AlcoholReading.received_at.desc()).limit(limit).all():
        if bus_cache[r.bus_id] is None:
            bus_cache[r.bus_id] = db.session.get(Bus, r.bus_id)
        rows.append([iso(r.received_at), iso(r.device_timestamp), bus_cache[r.bus_id].bus_number, r.raw_adc,
                     r.threshold, r.status])
    return cols, rows


def _csv_safe(value):
    """Neutralise spreadsheet formula injection."""
    if value is None:
        return ""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def to_csv(columns: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_csv_safe(v) for v in row])
    return "﻿" + buf.getvalue()  # BOM so Excel opens UTF-8 correctly
