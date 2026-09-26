"""Load OpenStreetMap destinations into points_of_interest."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import psycopg

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import get_settings  # noqa: E402
from app.migrate import migrate  # noqa: E402
from fetch_pois import SOURCE, fetch_pois  # noqa: E402

logger = logging.getLogger(__name__)

UPSERT = """
INSERT INTO points_of_interest (
    name, category, location, source, source_id, jobs_count, enrollment
)
VALUES (
    %(name)s,
    %(category)s,
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
    %(source)s,
    %(source_id)s,
    NULL,
    NULL
)
ON CONFLICT (source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL
DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    location = EXCLUDED.location
"""


def build_rows() -> list[dict]:
    pois = fetch_pois()
    rows = []
    for poi in pois.itertuples(index=False):
        rows.append(
            {
                "name": poi.name,
                "category": poi.category,
                "lon": poi.geometry.x,
                "lat": poi.geometry.y,
                "source": SOURCE,
                "source_id": poi.source_id,
            }
        )
    return rows


def load() -> int:
    rows = build_rows()
    source_ids = [row["source_id"] for row in rows]
    applied = migrate()
    if applied:
        logger.info("Applied migrations: %s", ", ".join(applied))
    with psycopg.connect(get_settings().database_url, connect_timeout=15) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.executemany(UPSERT, rows)
                cur.execute(
                    """
                    DELETE FROM points_of_interest
                    WHERE source = %s
                      AND NOT (source_id = ANY(%s))
                    """,
                    (SOURCE, source_ids),
                )
        count = conn.execute(
            "SELECT count(*) FROM points_of_interest WHERE source = %s",
            (SOURCE,),
        ).fetchone()[0]
    logger.info("points_of_interest has %s OpenStreetMap rows", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load()
