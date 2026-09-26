"""SQL for walks between zones or POIs and stations."""

from typing import Any

import psycopg
from psycopg import sql

COLUMNS = """
    id,
    location_type,
    location_id,
    station_id,
    walking_minutes
"""

# Same rule as data/access_edges/load_access_edges.py: straight-line walk at 80 m/min,
# nearest station always, plus up to two more inside a 1.5 mile walk.
WALK_METERS_PER_MINUTE = 80
MAX_STATIONS = 3
MAX_WALK_METERS = 1.5 * 1609.344

_RANKED_INSERT = """
INSERT INTO access_edges (location_type, location_id, station_id, walking_minutes)
WITH origins AS (
    SELECT 'zone'::text AS location_type, id AS location_id, centroid AS geog
    FROM residential_zones
    WHERE %(location_type)s::text IS NULL OR %(location_type)s::text = 'zone'
    UNION ALL
    SELECT 'poi'::text, id::text, location
    FROM points_of_interest
    WHERE %(location_type)s::text IS NULL OR %(location_type)s::text = 'poi'
),
scoped AS (
    SELECT * FROM origins
    WHERE %(location_id)s::text IS NULL OR location_id = %(location_id)s::text
),
ranked AS (
    SELECT
        scoped.location_type,
        scoped.location_id,
        stations.id AS station_id,
        ST_Distance(scoped.geog, stations.location) AS meters,
        row_number() OVER (
            PARTITION BY scoped.location_type, scoped.location_id
            ORDER BY scoped.geog <-> stations.location
        ) AS rank
    FROM scoped
    CROSS JOIN stations
)
SELECT
    location_type,
    location_id,
    station_id,
    meters / %(walk_meters_per_minute)s::float8
FROM ranked
WHERE rank = 1
   OR (rank <= %(max_stations)s::int AND meters <= %(max_walk_meters)s::float8)
"""


def _ranked_params(location_type: str | None, location_id: str | None) -> dict[str, Any]:
    return {
        "location_type": location_type,
        "location_id": location_id,
        "walk_meters_per_minute": WALK_METERS_PER_MINUTE,
        "max_stations": MAX_STATIONS,
        "max_walk_meters": MAX_WALK_METERS,
    }


def rebuild_all(conn: psycopg.Connection) -> int:
    """Recompute every zone/POI walking link. Needed after the station set changes."""
    conn.execute("DELETE FROM access_edges")
    conn.execute(_RANKED_INSERT, _ranked_params(None, None))
    return conn.execute("SELECT count(*) AS count FROM access_edges").fetchone()["count"]


def rebuild_for_location(
    conn: psycopg.Connection, location_type: str, location_id: str
) -> list[dict[str, Any]]:
    """Recompute walking links for one zone or POI only."""
    conn.execute(
        "DELETE FROM access_edges WHERE location_type = %s AND location_id = %s",
        (location_type, location_id),
    )
    conn.execute(_RANKED_INSERT, _ranked_params(location_type, location_id))
    return conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM access_edges
            WHERE location_type = %(location_type)s AND location_id = %(location_id)s
            ORDER BY walking_minutes
            """
        ).format(columns=sql.SQL(COLUMNS)),
        {"location_type": location_type, "location_id": location_id},
    ).fetchall()


def count_for_station(conn: psycopg.Connection, station_id: str) -> int:
    return conn.execute(
        "SELECT count(*) AS count FROM access_edges WHERE station_id = %s",
        (station_id,),
    ).fetchone()["count"]


def list_edges(
    conn: psycopg.Connection,
    *,
    location_type: str | None,
    location_id: str | None,
    station_id: str | None,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    clauses: list[sql.Composable] = [sql.SQL("TRUE")]
    params: dict[str, Any] = {}
    if location_type is not None:
        clauses.append(sql.SQL("location_type = %(location_type)s"))
        params["location_type"] = location_type
    if location_id is not None:
        clauses.append(sql.SQL("location_id = %(location_id)s"))
        params["location_id"] = location_id
    if station_id is not None:
        clauses.append(sql.SQL("station_id = %(station_id)s"))
        params["station_id"] = station_id
    where = sql.SQL(" AND ").join(clauses)
    total = conn.execute(
        sql.SQL("SELECT count(*) AS count FROM access_edges WHERE {where}").format(where=where),
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM access_edges
            WHERE {where}
            ORDER BY location_type, location_id, walking_minutes
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(COLUMNS), where=where),
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    return total, rows


def create_edge(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        sql.SQL(
            """
            INSERT INTO access_edges (location_type, location_id, station_id, walking_minutes)
            VALUES (%(location_type)s, %(location_id)s, %(station_id)s, %(walking_minutes)s)
            RETURNING {columns}
            """
        ).format(columns=sql.SQL(COLUMNS)),
        payload,
    ).fetchone()
    assert row is not None
    return row


def delete_edge(conn: psycopg.Connection, edge_id: str) -> bool:
    row = conn.execute(
        "DELETE FROM access_edges WHERE id = %s::uuid RETURNING id",
        (edge_id,),
    ).fetchone()
    return row is not None
