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
        count = conn.execute("SELECT count(*) FROM residential_zones").fetchone()[0]
    logger.info("residential_zones now has %s rows", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load()
