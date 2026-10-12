"""Create the first administrator account securely (no hardcoded credentials).

Interactive:       python seed_admin.py
Non-interactive:   python seed_admin.py --username admin --name "Transport Admin" --password-stdin < pw.txt

The password is read without echo, checked against the password policy and stored hashed (scrypt).
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app  # noqa: E402
from app.auth import hash_password, validate_new_password  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import User  # noqa: E402
from app.services.accounts import USERNAME_RE  # noqa: E402
from app.services.audit import log_audit  # noqa: E402
from app.utils.errors import ApiError  # noqa: E402
from app.utils.time import utcnow  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a SMARTBUS 360 administrator")
    parser.add_argument("--username")
    parser.add_argument("--name", default=None, help="Display name")
    parser.add_argument("--password-stdin", action="store_true", help="Read the password from standard input")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        username = (args.username or input("Admin username: ")).strip().lower()
        if not USERNAME_RE.match(username):
            print("Username must be 3-32 chars: lowercase letters, digits, '.', '_'.")
            return 1
        if User.query.filter_by(username=username).first():
            print(f"User '{username}' already exists. Choose another username.")
            return 1
        name = (args.name or input("Display name [Transport Administrator]: ").strip() or "Transport Administrator")
        if args.password_stdin:
            password = sys.stdin.readline().rstrip("\r\n")
        else:
            password = getpass.getpass("Password (min 8 chars, letters + digits): ")
            if password != getpass.getpass("Confirm password: "):
                print("Passwords do not match.")
                return 1
        try:
            validate_new_password(password, username)
        except ApiError as err:
            print(f"Rejected: {err.message}")
            return 1
        user = User(username=username, password_hash=hash_password(password), role="admin", display_name=name[:120],
                    is_active=True, must_change_password=False, password_changed_at=utcnow())
        db.session.add(user)
        db.session.flush()
        log_audit("admin.created_via_cli", "user", user.id, {"username": username}, actor_type="system",
                  actor_label="seed_admin.py")
        db.session.commit()
        print(f"Administrator '{username}' created. Sign in at /login.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
