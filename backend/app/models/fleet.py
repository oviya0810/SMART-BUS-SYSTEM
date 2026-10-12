from sqlalchemy import CheckConstraint, UniqueConstraint

from ..extensions import db
from ..utils.time import utcnow
from .base import TimestampMixin


class Route(TimestampMixin, db.Model):
    __tablename__ = "routes"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False, index=True)
    description = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    stops = db.relationship("RouteStop", back_populates="route", cascade="all, delete-orphan",
                            order_by="(RouteStop.sequence, RouteStop.id)")
    buses = db.relationship("Bus", back_populates="route")


class RouteStop(TimestampMixin, db.Model):
    __tablename__ = "route_stops"

    id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    sequence = db.Column(db.Integer, nullable=False, default=0)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)

    route = db.relationship("Route", back_populates="stops")

    __table_args__ = (UniqueConstraint("route_id", "name", name="uq_route_stop_name"),)


class Bus(TimestampMixin, db.Model):
    __tablename__ = "buses"

    id = db.Column(db.Integer, primary_key=True)
    bus_number = db.Column(db.String(32), unique=True, nullable=False, index=True)
    registration_number = db.Column(db.String(32), unique=True, nullable=False, index=True)
    route_id = db.Column(db.Integer, db.ForeignKey("routes.id", ondelete="SET NULL"), index=True)
    driver_name = db.Column(db.String(120), nullable=False)
    driver_phone = db.Column(db.String(20), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    alcohol_threshold = db.Column(db.Integer, nullable=False, default=2000)
    # RFID ID card of the bus driver (students do not use RFID)
    driver_rfid_uid = db.Column(db.String(32), unique=True, index=True)

    user = db.relationship("User", back_populates="bus")
    route = db.relationship("Route", back_populates="buses")
    device = db.relationship("DeviceRegistry", back_populates="bus", uselist=False)
    assignments = db.relationship("StudentBusAssignment", back_populates="bus")

    __table_args__ = (
        CheckConstraint("capacity > 0 AND capacity <= 150", name="ck_buses_capacity"),
        CheckConstraint("alcohol_threshold > 0", name="ck_buses_alcohol_threshold"),
    )


class DeviceRegistry(TimestampMixin, db.Model):
    __tablename__ = "device_registry"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="SET NULL"), unique=True, index=True)
    token_hash = db.Column(db.String(64), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    firmware_version = db.Column(db.String(40))
    registered_at = db.Column(db.DateTime)
    last_seen_at = db.Column(db.DateTime, index=True)
    last_telemetry_at = db.Column(db.DateTime)
    last_ip = db.Column(db.String(64))
    gps_status = db.Column(db.String(24))
    occupancy_sensor_status = db.Column(db.String(24))
    alcohol_sensor_status = db.Column(db.String(24))
    lcd_status = db.Column(db.String(24))
    buzzer_status = db.Column(db.String(24))
    rfid_reader_status = db.Column(db.String(24))
    last_error = db.Column(db.String(255))
    last_error_at = db.Column(db.DateTime)
    reported_online = db.Column(db.Boolean, nullable=False, default=False)

    bus = db.relationship("Bus", back_populates="device")


class DeviceHeartbeat(db.Model):
    __tablename__ = "device_heartbeats"

    id = db.Column(db.Integer, primary_key=True)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), index=True)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    device_timestamp = db.Column(db.DateTime)
    uptime_s = db.Column(db.Integer)
    rssi_dbm = db.Column(db.Integer)
    free_heap = db.Column(db.Integer)
    firmware_version = db.Column(db.String(40))
    statuses = db.Column(db.JSON)
    error_message = db.Column(db.String(255))


COMMAND_STATUSES = ("pending", "delivered", "acknowledged", "failed", "expired")


class DeviceCommand(db.Model):
    __tablename__ = "device_commands"

    id = db.Column(db.Integer, primary_key=True)
    device_pk = db.Column(db.Integer, db.ForeignKey("device_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    command_type = db.Column(db.String(32), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    status = db.Column(db.String(16), nullable=False, default="pending", index=True)
    pickup_request_id = db.Column(db.Integer, db.ForeignKey("pickup_requests.id", ondelete="SET NULL"))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    delivered_at = db.Column(db.DateTime)
    delivery_count = db.Column(db.Integer, nullable=False, default=0)
    acked_at = db.Column(db.DateTime)
    ack_message = db.Column(db.String(255))

    __table_args__ = (
        CheckConstraint("status IN ('pending','delivered','acknowledged','failed','expired')", name="ck_cmd_status"),
    )
