"""Build walking links from residential zones and POIs to MARTA stations.

Walk time is the absolute straight-line distance divided by 80 meters per minute.
Each place keeps its nearest station, plus up to two more inside the walk limit,
so a closure can fall back to another station.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import psycopg

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import get_settings  # noqa: E402

logger = logging.getLogger(__name__)

WALK_METERS_PER_MINUTE = 80
MAX_STATIONS = 3
MAX_WALK_METERS = 1.5 * 1609.344

INSERT = """
INSERT INTO access_edges (location_type, location_id, station_id, walking_minutes)
WITH origins AS (
    SELECT 'zone'::text AS location_type, id AS location_id, centroid AS geog
    FROM residential_zones
    UNION ALL
    SELECT 'poi'::text, id::text, location
    FROM points_of_interest
),
ranked AS (
    SELECT
        origins.location_type,
        origins.location_id,
        stations.id AS station_id,
        ST_Distance(origins.geog, stations.location) AS meters,
        row_number() OVER (
            PARTITION BY origins.location_type, origins.location_id
            ORDER BY origins.geog <-> stations.location
        ) AS rank
    FROM origins
    CROSS JOIN stations
)
SELECT
    location_type,
    location_id,
    station_id,
    meters / %(walk_meters_per_minute)s
FROM ranked
WHERE rank = 1
   OR (rank <= %(max_stations)s AND meters <= %(max_walk_meters)s);
"""


def load() -> int:
    with psycopg.connect(get_settings().database_url, connect_timeout=15) as conn:
        station_count = conn.execute("SELECT count(*) FROM stations").fetchone()[0]
        if station_count == 0:
            raise RuntimeError("stations table is empty")
        with conn.transaction():
            conn.execute("DELETE FROM access_edges")
            conn.execute(
                INSERT,
                {
                    "walk_meters_per_minute": WALK_METERS_PER_MINUTE,
                    "max_stations": MAX_STATIONS,
                    "max_walk_meters": MAX_WALK_METERS,
                },
            )
        summary = conn.execute(
            """
            SELECT
                count(*) AS edges,
                count(*) FILTER (WHERE location_type = 'zone') AS zone_edges,
                count(*) FILTER (WHERE location_type = 'poi') AS poi_edges,
                count(DISTINCT location_type || ':' || location_id) AS places,
                round(min(walking_minutes)::numeric, 1) AS min_minutes,
                round(avg(walking_minutes)::numeric, 1) AS avg_minutes,
                round(max(walking_minutes)::numeric, 1) AS max_minutes
            FROM access_edges
            """
        ).fetchone()
    logger.info(
        "access_edges=%s zone_edges=%s poi_edges=%s places=%s walk_minutes min=%s avg=%s max=%s",
        *summary,
    )
    return int(summary[0])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load()
