"""Upsert MARTA rail stations and replace transit_edges from GTFS."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import psycopg

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import get_settings  # noqa: E402
from app.migrate import migrate  # noqa: E402
from fetch_gtfs import parse_rail_network  # noqa: E402

logger = logging.getLogger(__name__)

UPSERT_STATION = """
INSERT INTO stations (id, name, location, lines, is_active)
VALUES (
    %(id)s,
    %(name)s,
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
    %(lines)s,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    lines = EXCLUDED.lines
"""

INSERT_EDGE = """
INSERT INTO transit_edges (
    from_station, to_station, travel_minutes, line, frequency_minutes
)
VALUES (
    %(from_station)s,
    %(to_station)s,
    %(travel_minutes)s,
    %(line)s,
    %(frequency_minutes)s
)
"""


def load() -> tuple[int, int]:
    stations, edges = parse_rail_network()
    if not stations or not edges:
        raise RuntimeError("GTFS produced no rail stations or edges")
    station_ids = [station["id"] for station in stations]
    applied = migrate()
    if applied:
        logger.info("Applied migrations: %s", ", ".join(applied))
    with psycopg.connect(get_settings().database_url, connect_timeout=15) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.executemany(UPSERT_STATION, stations)
                cur.execute(
                    """
                    DELETE FROM transit_edges
                    WHERE from_station = ANY(%s) OR to_station = ANY(%s)
                    """,
                    (station_ids, station_ids),
                )
                cur.executemany(INSERT_EDGE, edges)
        station_count = conn.execute("SELECT count(*) FROM stations").fetchone()[0]
        edge_count = conn.execute("SELECT count(*) FROM transit_edges").fetchone()[0]
    logger.info("stations=%s transit_edges=%s", station_count, edge_count)
    return station_count, edge_count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stations, edges = load()
    print(f"{stations} stations, {edges} edges")
