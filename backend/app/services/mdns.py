"""Optional mDNS advertisement so devices that support mDNS can resolve bus.local.

Enable with MDNS_ENABLED=true. Not every device resolves .local names via mDNS
(some Android versions, many ESP32 sketches) — see docs/NETWORK_SETUP.md.
"""
from __future__ import annotations

import socket


def detect_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def start_mdns(app):
    if not app.config.get("MDNS_ENABLED"):
        return None
    try:
        from zeroconf import ServiceInfo, Zeroconf
    except ImportError:  # pragma: no cover
        app.logger.warning("zeroconf not installed; mDNS disabled")
        return None
    host = app.config["MDNS_HOSTNAME"].rstrip(".") + "."
    ip = app.config.get("MDNS_IP") or detect_lan_ip()
    port = int(app.config["PORT"])
    info = ServiceInfo("_http._tcp.local.", "SMARTBUS 360._http._tcp.local.", addresses=[socket.inet_aton(ip)],
                       port=port, properties={"path": "/"}, server=host)
    zc = Zeroconf()
    try:
        zc.register_service(info, allow_name_change=True)
        app.logger.info("mDNS: advertising %s -> %s:%s", host, ip, port)
    except Exception:
        app.logger.exception("mDNS registration failed")
        zc.close()
        return None
    return zc
