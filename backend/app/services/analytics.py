"""Admin overview KPIs and charts — computed from stored records only."""
from __future__ import annotations

from collections import Counter
from datetime import timedelta, timezone

from sqlalchemy import func

from ..extensions import db
from ..models import Bus, PickupRequest, SOSIncident, Student, User
from ..utils.time import local_tz, utcnow
from .status import alcohol_status, device_online, occupancy_status


def overview() -> dict:
    buses = Bus.query.filter_by(is_active=True).all()
    online = [b for b in buses if device_online(b.device)]
    seats_available = 0
    passengers_onboard = 0
    buses_with_live_seats = 0
    alcohol_warnings = 0
    for b in buses:
        occ = occupancy_status(b)
        if occ["available"] and occ["state"] == "live":
            seats_available += occ["available_seats"]
            passengers_onboard += occ["occupied"]
            buses_with_live_seats += 1
        if alcohol_status(b)["state"] == "warning":
            alcohol_warnings += 1
    total_students = (db.session.query(func.count(Student.id)).join(User, Student.user_id == User.id)
                      .filter(User.is_active.is_(True)).scalar())
    return {
        "kpis": {
            "total_students": total_students,
            "total_buses": len(buses),
            "online_buses": len(online),
            "offline_buses": len(buses) - len(online),
            # Passengers counted by the live occupancy sensors
            "students_onboard": passengers_onboard if buses_with_live_seats else None,
            "available_seats": seats_available if buses_with_live_seats else None,
            "buses_reporting_seats": buses_with_live_seats,
            "active_sos": SOSIncident.query.filter(SOSIncident.status != "resolved").count(),
            "alcohol_warnings": alcohol_warnings,
            "pending_pickups": PickupRequest.query.filter_by(status="pending").count(),
        },
        "charts": charts(buses),
        "generated_at": utcnow().isoformat() + "Z",
    }


def charts(buses: list[Bus]) -> dict:
    tz = local_tz()
    since = utcnow() - timedelta(days=7)
    day_counts = Counter()
    for (created,) in db.session.query(PickupRequest.created_at).filter(PickupRequest.created_at >= since).all():
        local = created.replace(tzinfo=timezone.utc).astimezone(tz)
        day_counts[local.strftime("%Y-%m-%d")] += 1
    today_local = utcnow().replace(tzinfo=timezone.utc).astimezone(tz).date()
    pickups_7d = [{"date": (today_local - timedelta(days=i)).strftime("%Y-%m-%d"),
                   "count": day_counts.get((today_local - timedelta(days=i)).strftime("%Y-%m-%d"), 0)}
                  for i in range(6, -1, -1)]
    incidents = Counter(t for (t,) in db.session.query(SOSIncident.incident_type)
                        .filter(SOSIncident.created_at >= utcnow() - timedelta(days=30)).all())
    occupancy = []
    for b in buses:
        occ = occupancy_status(b)
        if occ["available"]:
            occupancy.append({"bus_number": b.bus_number, "occupied": occ["occupied"], "capacity": b.capacity,
                              "state": occ["state"]})
    return {
        "pickups_last_7_days": pickups_7d,
        "incidents_last_30_days": [{"type": k, "count": v} for k, v in sorted(incidents.items())],
        "bus_occupancy": occupancy,
    }
