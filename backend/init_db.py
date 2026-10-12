"""Create or upgrade the SQLite database.

    python init_db.py           # apply all migrations (creates the DB on first run)

Uses Flask-Migrate/Alembic migrations from backend/migrations. Existing data is preserved.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask_migrate import upgrade  # noqa: E402
from sqlalchemy import inspect  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402


def main() -> None:
    app = create_app()
    with app.app_context():
        migrations_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")
        if os.path.isdir(os.path.join(migrations_dir, "versions")):
            upgrade(directory=migrations_dir)
        else:  # fallback if migrations folder was removed
            db.create_all()
        tables = sorted(inspect(db.engine).get_table_names())
        print(f"Database ready: {app.config['SQLALCHEMY_DATABASE_URI']}")
        print(f"Tables ({len(tables)}): {', '.join(t for t in tables if t != 'alembic_version')}")


if __name__ == "__main__":
    main()
