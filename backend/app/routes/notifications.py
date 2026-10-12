from flask import Blueprint, jsonify

from ..auth import current_user, login_required
from ..extensions import db
from ..models import Notification
from ..services.notifications import notification_dict
from ..utils.validation import get_json

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp.get("")
@login_required()
def list_notifications():
    user = current_user()
    items = (Notification.query.filter_by(user_id=user.id)
             .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(50).all())
    unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return jsonify({"items": [notification_dict(n) for n in items], "unread": unread})


@bp.post("/read")
@login_required()
def mark_read():
    user = current_user()
    data = get_json()
    ids = data.get("ids")
    q = Notification.query.filter_by(user_id=user.id, is_read=False)
    if isinstance(ids, list) and ids:
        q = q.filter(Notification.id.in_([i for i in ids if isinstance(i, int)]))
    count = q.update({Notification.is_read: True}, synchronize_session=False)
    db.session.commit()
    return jsonify({"marked": count})
