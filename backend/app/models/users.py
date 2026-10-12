from sqlalchemy import CheckConstraint, Index, text

from ..extensions import db
from ..utils.time import utcnow
from .base import TimestampMixin

ROLES = ("admin", "student", "bus")


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(16), nullable=False, index=True)
    display_name = db.Column(db.String(120), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    must_change_password = db.Column(db.Boolean, nullable=False, default=True)
    session_version = db.Column(db.Integer, nullable=False, default=1)
    last_login_at = db.Column(db.DateTime)
    password_changed_at = db.Column(db.DateTime)

    student = db.relationship("Student", back_populates="user", uselist=False)
    bus = db.relationship("Bus", back_populates="user", uselist=False)

    __table_args__ = (CheckConstraint("role IN ('admin','student','bus')", name="ck_users_role"),)

    def __repr__(self):  # pragma: no cover
        return f"<User {self.username} ({self.role})>"


class Student(TimestampMixin, db.Model):
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False)
    full_name = db.Column(db.String(120), nullable=False, index=True)
    register_number = db.Column(db.String(32), unique=True, nullable=False, index=True)
    department = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    boarding_stop_id = db.Column(db.Integer, db.ForeignKey("route_stops.id", ondelete="SET NULL"))
    destination_stop_id = db.Column(db.Integer, db.ForeignKey("route_stops.id", ondelete="SET NULL"))

    user = db.relationship("User", back_populates="student")
    boarding_stop = db.relationship("RouteStop", foreign_keys=[boarding_stop_id])
    destination_stop = db.relationship("RouteStop", foreign_keys=[destination_stop_id])
    assignments = db.relationship("StudentBusAssignment", back_populates="student",
                                  order_by="StudentBusAssignment.assigned_at.desc()")

    __table_args__ = (CheckConstraint("year BETWEEN 1 AND 6", name="ck_students_year"),)

    @property
    def current_assignment(self):
        return next((a for a in self.assignments if a.is_active), None)

    @property
    def bus(self):
        a = self.current_assignment
        return a.bus if a else None


class StudentBusAssignment(db.Model):
    __tablename__ = "student_bus_assignments"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    assigned_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    ended_at = db.Column(db.DateTime)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    student = db.relationship("Student", back_populates="assignments")
    bus = db.relationship("Bus", back_populates="assignments")

    __table_args__ = (
        Index("uq_student_active_assignment", "student_id", unique=True, sqlite_where=text("is_active = 1")),
    )

