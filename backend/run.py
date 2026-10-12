"""Start the SMARTBUS 360 server (API + Socket.IO + built dashboards).

    python run.py            # uses HOST/PORT from .env (default 0.0.0.0:80)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app  # noqa: E402
from app.extensions import socketio  # noqa: E402
from app.services.mdns import detect_lan_ip, start_mdns  # noqa: E402
from app.services.monitor import start_monitor  # noqa: E402

app = create_app()


def main() -> None:
    host, port = app.config["HOST"], int(app.config["PORT"])
    cert, key = app.config.get("SSL_CERT_FILE"), app.config.get("SSL_KEY_FILE")
    ssl_context = (cert, key) if cert and key else None
    if ssl_context and not (os.path.exists(cert) and os.path.exists(key)):
        print(f"SSL_CERT_FILE/SSL_KEY_FILE not found: {cert} / {key}")
        raise SystemExit(1)
    scheme = "https" if ssl_context else "http"
    if app.config.get("BACKGROUND_MONITOR"):
        start_monitor(app)
    zc = start_mdns(app)
    lan = detect_lan_ip()
    suffix = "" if (port == 80 and not ssl_context) or (port == 443 and ssl_context) else f":{port}"
    print("=" * 64)
    print(" SMARTBUS 360 server")
    print(f"   Local:      {scheme}://127.0.0.1{suffix}/login")
    print(f"   LAN:        {scheme}://{lan}{suffix}/login")
    print(f"   Hostname:   {app.config['PUBLIC_BASE_URL']}  (requires bus.local name resolution)")
    print(f"   Health:     {scheme}://{lan}{suffix}/api/health")
    print("=" * 64)
    try:
        # Werkzeug's threaded server with websocket support (simple-websocket).
        # Suitable for a private LAN deployment; see docs/SECURITY.md for hardening notes.
        run_kwargs = {"ssl_context": ssl_context} if ssl_context else {}
        socketio.run(app, host=host, port=port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True,
                     **run_kwargs)
    finally:
        if zc is not None:
            zc.close()


if __name__ == "__main__":
    main()
