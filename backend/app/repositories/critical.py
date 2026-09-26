"""SQL for the POI critical-station cache."""

from typing import Any

import psycopg
from psycopg.types.json import Json

from app.repositories.jsonutil import with_json


def get(conn: psycopg.Connection, fingerprint: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT fingerprint, snapshot, calculated_at
        FROM poi_critical_cache
        WHERE fingerprint = %s
        """,
        (fingerprint,),
    ).fetchone()
    return with_json(row, "snapshot")


def upsert(conn: psycopg.Connection, fingerprint: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO poi_critical_cache (fingerprint, snapshot, calculated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (fingerprint) DO UPDATE SET
            snapshot = EXCLUDED.snapshot,
            calculated_at = now()
        """,
        (fingerprint, Json(snapshot)),
    )
    row = get(conn, fingerprint)
    assert row is not None
    return row
