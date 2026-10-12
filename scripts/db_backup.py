"""Consistent SQLite backup/restore for SMARTBUS 360.

    python scripts/db_backup.py backup                 -> backups/smartbus360_YYYYmmdd_HHMMSS.db
    python scripts/db_backup.py restore <backup.db>    -> replaces the live DB (stop the server first)
    python scripts/db_backup.py list

Uses SQLite's online backup API, so a backup is consistent even while the server is running (WAL mode).
"""
from __future__ import annotations

import datetime as dt
import os
import shutil
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from config import Config  # noqa: E402

BACKUP_DIR = os.path.join(ROOT, "backups")


def db_path() -> str:
    uri = Config.SQLALCHEMY_DATABASE_URI
    if not uri.startswith("sqlite:///"):
        raise SystemExit(f"Only SQLite file databases are supported (got {uri})")
    return uri[len("sqlite:///"):]


def backup() -> str:
    src = db_path()
    if not os.path.exists(src):
        raise SystemExit(f"Database not found: {src}. Run init_db.py first.")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dest = os.path.join(BACKUP_DIR, f"smartbus360_{dt.datetime.now():%Y%m%d_%H%M%S}.db")
    with sqlite3.connect(src) as s, sqlite3.connect(dest) as d:
        s.backup(d)
    with sqlite3.connect(dest) as d:
        ok = d.execute("PRAGMA integrity_check").fetchone()[0]
    print(f"Backup written: {dest} (integrity: {ok})")
    return dest


def restore(path: str) -> None:
    if not os.path.exists(path):
        raise SystemExit(f"Backup not found: {path}")
    with sqlite3.connect(path) as d:
        ok = d.execute("PRAGMA integrity_check").fetchone()[0]
        tables = {r[0] for r in d.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if ok != "ok" or "users" not in tables:
        raise SystemExit("Backup failed integrity check or is not a SMARTBUS 360 database.")
    target = db_path()
    if os.path.exists(target):
        safety = target + f".before_restore_{dt.datetime.now():%Y%m%d_%H%M%S}"
        shutil.copy2(target, safety)
        print(f"Current database saved as {safety}")
    for suffix in ("-wal", "-shm"):
        if os.path.exists(target + suffix):
            os.remove(target + suffix)
    with sqlite3.connect(path) as s, sqlite3.connect(target) as d:
        s.backup(d)
    print(f"Restored {path} -> {target}. Start the server again.")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("backup", "restore", "list"):
        print(__doc__)
        raise SystemExit(2)
    if sys.argv[1] == "backup":
        backup()
    elif sys.argv[1] == "list":
        if os.path.isdir(BACKUP_DIR):
            for f in sorted(os.listdir(BACKUP_DIR)):
                print(os.path.join(BACKUP_DIR, f))
    else:
        if len(sys.argv) < 3:
            raise SystemExit("Usage: db_backup.py restore <backup file>")
        restore(sys.argv[2])


if __name__ == "__main__":
    main()
