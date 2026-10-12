from sqlalchemy import CheckConstraint, Index, UniqueConstraint

from ..extensions import db
from ..utils.time import utcnow
from .base import TimestampMixin

PICKUP_STATUSES = ("pending", "accepted", "approaching", "picked_up", "cancelled")
PICKUP_ACTIVE = ("pending", "accepted", "approaching")
INCIDENT_TYPES = ("sos", "breakdown", "medical", "other")
INCIDENT_STATUSES = ("active", "acknowledged", "resolved")
ALCOHOL_STATUSES = ("warming_up", "normal", "warning", "sensor_error")


class PickupRequest(TimestampMixin, db.Model):
    __tablename__ = "pickup_requests"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    location_source = db.Column(db.String(16), nullable=False)  # phone_gps | stop
    location_accuracy_m = db.Column(db.Float)
    boarding_stop_id = db.Column(db.Integer, db.ForeignKey("route_stops.id", ondelete="SET NULL"))
    boarding_stop_name = db.Column(db.String(120), nullable=False)
    note = db.Column(db.String(200))
    status = db.Column(db.String(16), nullable=False, default="pending", index=True)
    cancel_reason = db.Column(db.String(255))
    accepted_at = db.Column(db.DateTime)
    picked_up_at = db.Column(db.DateTime)
    closed_at = db.Column(db.DateTime)

    student = db.relationship("Student")
    bus = db.relationship("Bus")
    history = db.relationship("PickupStatusHistory", back_populates="pickup_request",
                              order_by="PickupStatusHistory.created_at", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('pending','accepted','approaching','picked_up','cancelled')",
                        name="ck_pickup_status"),
        Index("ix_pickup_bus_status", "bus_id", "status"),
    )


class PickupStatusHistory(db.Model):
    __tablename__ = "pickup_status_history"

    id = db.Column(db.Integer, primary_key=True)
    pickup_request_id = db.Column(db.Integer, db.ForeignKey("pickup_requests.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    from_status = db.Column(db.String(16))
    to_status = db.Column(db.String(16), nullable=False)
    changed_by_type = db.Column(db.String(16), nullable=False)  # student | bus | admin | device | system
    changed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    reason = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    pickup_request = db.relationship("PickupRequest", back_populates="history")


class StudentLocation(db.Model):
    __tablename__ = "student_locations"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    accuracy_m = db.Column(db.Float)
    recorded_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)


class BusLocation(db.Model):
    __tablename__ = "bus_locations"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="SET NULL"))
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    speed_kmh = db.Column(db.Float)
    heading_deg = db.Column(db.Float)
    satellites = db.Column(db.Integer)
    hdop = db.Column(db.Float)
    device_timestamp = db.Column(db.DateTime, nullable=False)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (Index("ix_bus_locations_bus_received", "bus_id", "received_at"),)


class OccupancyReading(db.Model):
    __tablename__ = "occupancy_readings"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="SET NULL"))
    occupied = db.Column(db.Integer, nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    sensor_status = db.Column(db.String(24), nullable=False, default="ok")
    device_timestamp = db.Column(db.DateTime, nullable=False)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        Index("ix_occupancy_bus_received", "bus_id", "received_at"),
        CheckConstraint("occupied >= 0 AND occupied <= capacity", name="ck_occupancy_range"),
    )


class AlcoholReading(db.Model):
    __tablename__ = "alcohol_readings"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="SET NULL"))
    raw_adc = db.Column(db.Integer)
    threshold = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(16), nullable=False)
    device_timestamp = db.Column(db.DateTime, nullable=False)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        Index("ix_alcohol_bus_received", "bus_id", "received_at"),
        CheckConstraint("status IN ('warming_up','normal','warning','sensor_error')", name="ck_alcohol_status"),
    )


DRIVER_ACTIONS = ("duty_start", "duty_end")
DRIVER_RFID_RESULTS = ("authorized", "unknown_card", "other_bus_driver")


class DriverRFIDEvent(db.Model):
    """A driver ID-card tap on the bus RFID reader (duty start / duty end)."""

    __tablename__ = "driver_rfid_events"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="SET NULL"))
    device_event_id = db.Column(db.String(64), nullable=False)
    card_uid = db.Column(db.String(32), nullable=False, index=True)
    result = db.Column(db.String(20), nullable=False)
    action = db.Column(db.String(12))  # duty_start | duty_end (null when the card was rejected)
    driver_name = db.Column(db.String(120))  # snapshot of the bus driver name at tap time
    device_timestamp = db.Column(db.DateTime, nullable=False)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    bus = db.relationship("Bus")

    __table_args__ = (
        UniqueConstraint("device_pk", "device_event_id", name="uq_driver_rfid_device_event"),
        CheckConstraint("result IN ('authorized','unknown_card','other_bus_driver')", name="ck_driver_rfid_result"),
    )


class SOSIncident(TimestampMixin, db.Model):
    __tablename__ = "sos_incidents"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="SET NULL"))
    event_id = db.Column(db.String(64), nullable=False)
    incident_type = db.Column(db.String(16), nullable=False, default="sos", index=True)
    source = db.Column(db.String(16), nullable=False)  # device | bus_dashboard | admin
    description = db.Column(db.String(500))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    location_source = db.Column(db.String(24))  # device_payload | last_known_gps
    status = db.Column(db.String(16), nullable=False, default="active", index=True)
    acknowledged_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    acknowledged_at = db.Column(db.DateTime)
    resolved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at = db.Column(db.DateTime)
    resolution_notes = db.Column(db.String(1000))
    device_timestamp = db.Column(db.DateTime)

    bus = db.relationship("Bus")
    acknowledged_by = db.relationship("User", foreign_keys=[acknowledged_by_user_id])
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_user_id])

    __table_args__ = (
        UniqueConstraint("bus_id", "event_id", name="uq_sos_bus_event"),
        CheckConstraint("status IN ('active','acknowledged','resolved')", name="ck_sos_status"),
        CheckConstraint("incident_type IN ('sos','breakdown','medical','other')", name="ck_sos_type"),
    )
