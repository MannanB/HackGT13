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
    return count_all(conn)


def count_all(conn: psycopg.Connection) -> int:
    return conn.execute("SELECT count(*) AS count FROM access_edges").fetchone()["count"]


def absorb_station(conn: psycopg.Connection, station_id: str) -> int:
    """Add walking links to a newly inserted station without rebuilding the whole table.

    Same rule as rebuild_all: keep each place's nearest station, plus up to two more
    inside 1.5 miles. Existing links stay; we only insert the new station where it
    ranks in that set, then drop any link that the new nearest pushed out.
    """
    conn.execute(
        """
        WITH new_station AS (
            SELECT location FROM stations WHERE id = %(station_id)s
        ),
        origins AS (
            SELECT 'zone'::text AS location_type, id AS location_id, centroid AS geog
            FROM residential_zones
            UNION ALL
            SELECT 'poi'::text, id::text, location
            FROM points_of_interest
        ),
        dist AS (
            SELECT
                origins.location_type,
                origins.location_id,
                ST_Distance(origins.geog, new_station.location) AS meters
            FROM origins
            CROSS JOIN new_station
        ),
        stats AS (
            SELECT
                location_type,
                location_id,
                count(*) AS n,
                min(walking_minutes) AS best_minutes,
                max(walking_minutes) AS worst_minutes
            FROM access_edges
            GROUP BY location_type, location_id
        )
        INSERT INTO access_edges (location_type, location_id, station_id, walking_minutes)
        SELECT
            dist.location_type,
            dist.location_id,
            %(station_id)s,
            dist.meters / %(walk_meters_per_minute)s::float8
        FROM dist
        LEFT JOIN stats
          ON stats.location_type = dist.location_type
         AND stats.location_id = dist.location_id
        WHERE stats.n IS NULL
           OR dist.meters / %(walk_meters_per_minute)s::float8 < stats.best_minutes
           OR (
                dist.meters <= %(max_walk_meters)s::float8
                AND (
                    stats.n < %(max_stations)s::int
                    OR dist.meters / %(walk_meters_per_minute)s::float8 < stats.worst_minutes
                )
           )
        ON CONFLICT (location_type, location_id, station_id) DO NOTHING
        """,
        {
            "station_id": station_id,
            "walk_meters_per_minute": WALK_METERS_PER_MINUTE,
            "max_stations": MAX_STATIONS,
            "max_walk_meters": MAX_WALK_METERS,
        },
    )
    conn.execute(
        """
        DELETE FROM access_edges AS ae
        USING (
            SELECT id
            FROM (
                SELECT
                    id,
                    walking_minutes,
                    row_number() OVER (
                        PARTITION BY location_type, location_id
                        ORDER BY walking_minutes
                    ) AS rank
                FROM access_edges
                WHERE (location_type, location_id) IN (
                    SELECT location_type, location_id
                    FROM access_edges
                    WHERE station_id = %(station_id)s
                )
            ) ranked
            WHERE NOT (
                rank = 1
                OR (
                    rank <= %(max_stations)s::int
                    AND walking_minutes <= %(max_walk_meters)s::float8
                        / %(walk_meters_per_minute)s::float8
                )
            )
        ) drop
        WHERE ae.id = drop.id
        """,
        {
            "station_id": station_id,
            "walk_meters_per_minute": WALK_METERS_PER_MINUTE,
            "max_stations": MAX_STATIONS,
            "max_walk_meters": MAX_WALK_METERS,
        },
    )
    return count_all(conn)


def locations_for_station(conn: psycopg.Connection, station_id: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        "SELECT location_type, location_id FROM access_edges WHERE station_id = %s",
        (station_id,),
    ).fetchall()
    return [(row["location_type"], row["location_id"]) for row in rows]


def rebuild_locations(conn: psycopg.Connection, locations: list[tuple[str, str]]) -> int:
    """Recompute walking links for a small set of places (used after a station is removed)."""
    if not locations:
        return count_all(conn)
    types = [item[0] for item in locations]
    ids = [item[1] for item in locations]
    conn.execute(
        """
        DELETE FROM access_edges
        WHERE (location_type, location_id) IN (
            SELECT location_type, location_id
            FROM unnest(%(types)s::text[], %(ids)s::text[])
                AS t(location_type, location_id)
        )
        """,
        {"types": types, "ids": ids},
    )
    conn.execute(
        """
        INSERT INTO access_edges (location_type, location_id, station_id, walking_minutes)
        WITH wanted AS (
            SELECT location_type, location_id
            FROM unnest(%(types)s::text[], %(ids)s::text[])
                AS t(location_type, location_id)
        ),
        origins AS (
            SELECT 'zone'::text AS location_type, id AS location_id, centroid AS geog
            FROM residential_zones
            WHERE EXISTS (
                SELECT 1 FROM wanted
                WHERE location_type = 'zone' AND location_id = residential_zones.id
            )
            UNION ALL
            SELECT 'poi'::text, id::text, location
            FROM points_of_interest
            WHERE EXISTS (
                SELECT 1 FROM wanted
                WHERE location_type = 'poi' AND location_id = points_of_interest.id::text
            )
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
            meters / %(walk_meters_per_minute)s::float8
        FROM ranked
        WHERE rank = 1
           OR (rank <= %(max_stations)s::int AND meters <= %(max_walk_meters)s::float8)
        """,
        {
            "types": types,
            "ids": ids,
            "walk_meters_per_minute": WALK_METERS_PER_MINUTE,
            "max_stations": MAX_STATIONS,
            "max_walk_meters": MAX_WALK_METERS,
        },
    )
    return count_all(conn)


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
