"""Generate a self-signed TLS certificate for HTTPS on the local network.

    python generate_cert.py                       # bus.local + detected LAN IP
    python generate_cert.py --ip 192.168.1.50     # explicit server IP

Why: browsers only allow phone GPS (navigator.geolocation) on secure pages.
Plain http://bus.local works for everything EXCEPT the student's "Use my GPS".

The certificate is self-signed, so each phone shows a warning once (or install
the generated CA-less cert as trusted). For a warning-free setup use mkcert —
see docs/NETWORK_SETUP.md section "HTTPS".
"""
from __future__ import annotations

import argparse
import datetime as dt
import ipaddress
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

from app.services.mdns import detect_lan_ip  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="bus.local")
    parser.add_argument("--ip", default=None, help="Server LAN IP (default: auto-detect)")
    parser.add_argument("--days", type=int, default=825)
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance", "certs"))
    args = parser.parse_args()

    ip = args.ip or detect_lan_ip()
    os.makedirs(args.out, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, args.host),
                      x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SMARTBUS 360 (self-signed)")])
    now = dt.datetime.now(dt.timezone.utc)
    san = x509.SubjectAlternativeName([x509.DNSName(args.host), x509.DNSName("localhost"),
                                       x509.IPAddress(ipaddress.ip_address(ip)),
                                       x509.IPAddress(ipaddress.ip_address("127.0.0.1"))])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(minutes=5))
            .not_valid_after(now + dt.timedelta(days=args.days)).add_extension(san, critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .sign(key, hashes.SHA256()))
    cert_path = os.path.join(args.out, "smartbus360.crt")
    key_path = os.path.join(args.out, "smartbus360.key")
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Certificate: {cert_path}\nPrivate key: {key_path}\nValid for: {args.host}, {ip}, localhost")
    print("\nAdd to .env:\n  SSL_CERT_FILE=" + cert_path + "\n  SSL_KEY_FILE=" + key_path +
          "\n  PORT=443\n  SESSION_COOKIE_SECURE=true\n  PUBLIC_BASE_URL=https://bus.local\n"
          "  CORS_ORIGINS=https://bus.local,http://localhost:5173")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
