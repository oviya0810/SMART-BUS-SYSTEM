from ..extensions import db
from ..utils.time import utcnow


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = db.Column(db.String(32), nullable=False)  # sos | pickup | alcohol | device | account
    severity = db.Column(db.String(16), nullable=False, default="info")  # info | warning | critical
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    entity_type = db.Column(db.String(32))
    entity_id = db.Column(db.Integer)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_type = db.Column(db.String(16), nullable=False)  # user | device | system
    actor_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    actor_label = db.Column(db.String(120))
    action = db.Column(db.String(64), nullable=False, index=True)
    entity_type = db.Column(db.String(32), index=True)
    entity_id = db.Column(db.Integer)
    details = db.Column(db.JSON)
    ip_address = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
