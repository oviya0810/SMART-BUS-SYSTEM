from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..extensions import db
from ..utils.time import utcnow

bp = Blueprint("system", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    db_ok = True
    try:
        db.session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
        current_app.logger.exception("Health check database failure")
    body = {
        "status": "ok" if db_ok else "degraded",
        "service": current_app.config["APP_NAME"],
        "version": current_app.config["APP_VERSION"],
        "database": "ok" if db_ok else "error",
        "server_time": utcnow().isoformat() + "Z",
    }
    return jsonify(body), (200 if db_ok else 503)
