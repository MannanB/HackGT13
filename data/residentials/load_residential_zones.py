"""Join census block groups to ACS estimates and upsert residential_zones."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import psycopg

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import get_settings  # noqa: E402
from app.migrate import migrate  # noqa: E402
from fetch_acs import fetch_acs  # noqa: E402
from fetch_block_groups import load_block_groups  # noqa: E402

logger = logging.getLogger(__name__)

# Wider than the POI 2-mile ring so nearby neighborhoods still show.
BUFFER_METERS = 4 * 1609.344

OUTSIDE_SERVICE_AREA = """
SELECT z.id
FROM residential_zones AS z
WHERE NOT EXISTS (
    SELECT 1
    FROM stations AS s
    WHERE ST_DWithin(z.centroid, s.location, %(buffer_meters)s)
)
"""

UPSERT = """
INSERT INTO residential_zones (
    id, name, geometry, centroid, population, median_income
)
VALUES (
    %(id)s,
    %(name)s,
    ST_Multi(ST_SetSRID(ST_GeomFromWKB(%(geometry)s), 4326)),
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
    %(population)s,
    %(median_income)s
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    geometry = EXCLUDED.geometry,
    centroid = EXCLUDED.centroid,
    population = EXCLUDED.population,
    median_income = EXCLUDED.median_income
"""


def build_rows() -> list[dict]:
    zones = load_block_groups()
    estimates = fetch_acs()
    rows = []
    missing = 0
    for zone in zones.itertuples(index=False):
        estimate = estimates.get(zone.GEOID)
        if estimate is None:
            missing += 1
            continue
        rows.append(
            {
                "id": zone.GEOID,
                "name": estimate["name"] or zone.NAMELSAD,
                "geometry": zone.geometry.wkb,
                "lon": zone.origin_lon,
                "lat": zone.origin_lat,
                "population": estimate["population"],
                "median_income": estimate["median_income"],
            }
        )
    logger.info("Joined %s zones; %s block groups had no ACS row", len(rows), missing)
    return rows


def build_tiger_rows() -> list[dict]:
    """Block groups from TIGER only. Used when ACS is unavailable."""
    zones = load_block_groups()
    rows = []
    for zone in zones.itertuples(index=False):
        rows.append(
            {
                "id": zone.GEOID,
                "name": zone.NAMELSAD,
                "geometry": zone.geometry.wkb,
                "lon": zone.origin_lon,
                "lat": zone.origin_lat,
                "population": 0,
                "median_income": None,
            }
        )
    logger.info("Prepared %s TIGER block groups", len(rows))
    return rows


TIGER_INSERT = """
INSERT INTO residential_zones (
    id, name, geometry, centroid, population, median_income
)
VALUES (
    %(id)s,
    %(name)s,
    ST_Multi(ST_SetSRID(ST_GeomFromWKB(%(geometry)s), 4326)),
    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
    %(population)s,
    %(median_income)s
)
ON CONFLICT (id) DO NOTHING
"""


def _service_area_params() -> dict[str, float]:
    return {"buffer_meters": BUFFER_METERS}


def clip_to_service_area(conn: psycopg.Connection) -> int:
    """Drop zones whose centroid is farther than 4 miles from every MARTA station."""
    params = _service_area_params()
    dropped = [row[0] for row in conn.execute(OUTSIDE_SERVICE_AREA, params).fetchall()]
    if not dropped:
        logger.info("No residential zones outside the MARTA POI service area")
        return 0
    conn.execute(
        "DELETE FROM access_edges WHERE location_type = 'zone' AND location_id = ANY(%s)",
        (dropped,),
    )
    conn.execute("DELETE FROM residential_zones WHERE id = ANY(%s)", (dropped,))
    logger.info("Removed %s residential zones outside the MARTA POI service area", len(dropped))
    return len(dropped)


def load() -> int:
    rows = build_rows()
    if not rows:
        raise RuntimeError("No residential zones to load")
    applied = migrate()
    if applied:
        logger.info("Applied migrations: %s", ", ".join(applied))
    with psycopg.connect(get_settings().database_url, connect_timeout=15) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.executemany(UPSERT, rows)
            clip_to_service_area(conn)
        count = conn.execute("SELECT count(*) FROM residential_zones").fetchone()[0]
    logger.info("residential_zones now has %s rows", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if "--clip-only" in sys.argv:
        with psycopg.connect(get_settings().database_url, connect_timeout=15) as conn:
            station_count = conn.execute("SELECT count(*) FROM stations").fetchone()[0]
            if station_count == 0:
                raise RuntimeError("stations table is empty")
            tiger_rows = build_tiger_rows()
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.executemany(TIGER_INSERT, tiger_rows)
                clip_to_service_area(conn)
            count = conn.execute("SELECT count(*) FROM residential_zones").fetchone()[0]
        logger.info("residential_zones now has %s rows", count)
    else:
        load()
