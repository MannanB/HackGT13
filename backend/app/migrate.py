"""Apply versioned SQL files in backend/sql to the configured database."""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg

from app.config import get_settings

logger = logging.getLogger(__name__)

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"
MIGRATIONS = (("001_schema", SQL_DIR / "001_schema.sql"),)


def iter_statements(script: str):
    """Split a SQL script on semicolons, dropping full-line comments."""
    lines = []
    for line in script.splitlines():
        if line.strip().startswith("--"):
            continue
        lines.append(line)
    body = "\n".join(lines)
    for statement in body.split(";"):
        stripped = statement.strip()
        if stripped:
            yield stripped


def _applied_versions(conn: psycopg.Connection) -> set[str]:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    return {row[0] for row in rows}


def migrate() -> list[str]:
    """Apply pending migrations. Returns the versions applied on this run.

    Statements run outside a transaction so TimescaleDB can create the hypertable.
    Each file is idempotent, and its version is recorded only after every statement succeeds.
    """
    applied: list[str] = []
    with psycopg.connect(
        get_settings().database_url,
        connect_timeout=15,
        autocommit=True,
    ) as conn:
        done = _applied_versions(conn)
        for version, path in MIGRATIONS:
            if version in done:
                logger.info("Migration %s already applied", version)
                continue
            for statement in iter_statements(path.read_text(encoding="utf-8")):
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)",
                (version,),
            )
            applied.append(version)
            logger.info("Applied migration %s", version)
    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    versions = migrate()
    if versions:
        print("Applied: " + ", ".join(versions))
    else:
        print("Database schema is up to date")
