"""Serves the built React app (frontend/dist) so dashboards and API share one origin:
http://bus.local/admin, /student, /bus and /api/* all come from this server."""
from pathlib import Path

from flask import Blueprint, Response, current_app, redirect, send_from_directory

bp = Blueprint("spa", __name__)

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; "
       "font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; "
       "form-action 'self'")

NOT_BUILT = """<!doctype html><html><head><meta charset="utf-8"><title>SMARTBUS 360</title></head>
<body style="font-family:system-ui;padding:40px;max-width:640px">
<h1>SMARTBUS 360 backend is running</h1>
<p>The web dashboards have not been built yet. Run <code>scripts\\build_frontend.bat</code>
(or <code>npm run build</code> inside <code>frontend</code>) and refresh this page.</p>
<p>API health: <a href="/api/health">/api/health</a></p></body></html>"""


def _dist() -> Path:
    return Path(current_app.config["FRONTEND_DIST"])


def _index():
    dist = _dist()
    if not (dist / "index.html").exists():
        return Response(NOT_BUILT, mimetype="text/html")
    resp = send_from_directory(dist, "index.html", max_age=0)
    resp.headers["Content-Security-Policy"] = CSP
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@bp.get("/")
def root():
    return redirect("/login")


@bp.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(_dist() / "assets", filename, max_age=31536000)


@bp.get("/<string:name>.<string:ext>")
def top_level_file(name, ext):
    if ext not in {"svg", "png", "ico", "webmanifest", "txt", "json"}:
        return _index()
    return send_from_directory(_dist(), f"{name}.{ext}", max_age=3600)


@bp.get("/login")
@bp.get("/change-password")
@bp.get("/admin")
@bp.get("/admin/<path:_rest>")
@bp.get("/student")
@bp.get("/student/<path:_rest>")
@bp.get("/bus")
@bp.get("/bus/<path:_rest>")
def spa(_rest=None):
    return _index()
