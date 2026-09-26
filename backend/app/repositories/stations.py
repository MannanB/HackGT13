"""SQL for the station catalog."""

from typing import Any

import psycopg
from psycopg import sql

from app.repositories.jsonutil import with_json

STATION_COLUMNS = """
    s.id,
    s.name,
    json_build_object(
        'lon', ST_X(s.location::geometry),
        'lat', ST_Y(s.location::geometry)
    ) AS location,
    s.lines,
    s.is_active
"""


def exists(conn: psycopg.Connection, station_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM stations WHERE id = %s", (station_id,)).fetchone()
    return row is not None


def missing_ids(conn: psycopg.Connection, station_ids: list[str]) -> list[str]:
    if not station_ids:
        return []
    rows = conn.execute(
        "SELECT id FROM stations WHERE id = ANY(%s)",
        (station_ids,),
    ).fetchall()
    found = {row["id"] for row in rows}
    return [station_id for station_id in station_ids if station_id not in found]


def _where(line: str | None, is_active: bool | None) -> tuple[sql.Composable, dict[str, Any]]:
    clauses: list[sql.Composable] = [sql.SQL("TRUE")]
    params: dict[str, Any] = {}
    if line is not None:
        clauses.append(sql.SQL("%(line)s = ANY(s.lines)"))
        params["line"] = line
    if is_active is not None:
        clauses.append(sql.SQL("s.is_active = %(is_active)s"))
        params["is_active"] = is_active
    return sql.SQL(" AND ").join(clauses), params


def list_stations(
    conn: psycopg.Connection,
    *,
    line: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    where, params = _where(line, is_active)
    total = conn.execute(
        sql.SQL("SELECT count(*) AS count FROM stations AS s WHERE {where}").format(where=where),
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM stations AS s
            WHERE {where}
            ORDER BY s.name
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(STATION_COLUMNS), where=where),
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    return total, [with_json(row, "location") for row in rows]


def list_for_network(conn: psycopg.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM stations AS s
            ORDER BY s.name
            """
        ).format(columns=sql.SQL(STATION_COLUMNS))
    ).fetchall()
    return [with_json(row, "location") for row in rows]


def nearby(
    conn: psycopg.Connection,
    *,
    lon: float,
    lat: float,
    limit: int,
    active_only: bool,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        sql.SQL(
            """
            WITH origin AS (
                SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography AS geog
            )
            SELECT {columns},
                   ST_Distance(s.location, origin.geog) AS distance_meters
            FROM stations AS s
            CROSS JOIN origin
            WHERE %(active_only)s = FALSE OR s.is_active
            ORDER BY s.location <-> origin.geog
            LIMIT %(limit)s
            """
        ).format(columns=sql.SQL(STATION_COLUMNS)),
        {"lon": lon, "lat": lat, "limit": limit, "active_only": active_only},
    ).fetchall()
    return [with_json(row, "location") for row in rows]


def get_station(conn: psycopg.Connection, station_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM stations AS s
            WHERE s.id = %(id)s
            """
        ).format(columns=sql.SQL(STATION_COLUMNS)),
        {"id": station_id},
    ).fetchone()
    return with_json(row, "location")


def create_station(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    location = payload["location"]
    conn.execute(
        """
        INSERT INTO stations (id, name, location, lines, is_active)
        VALUES (
            %(id)s,
            %(name)s,
            ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
            %(lines)s,
            %(is_active)s
        )
        """,
        {
            "id": payload["id"],
            "name": payload["name"],
            "lon": location["lon"],
            "lat": location["lat"],
            "lines": payload["lines"],
            "is_active": payload["is_active"],
        },
    )
    created = get_station(conn, payload["id"])
    assert created is not None
    return created


def update_station(
    conn: psycopg.Connection,
    station_id: str,
    changes: dict[str, Any],
) -> dict[str, Any] | None:
    assignments: list[sql.Composable] = []
    params: dict[str, Any] = {"id": station_id}
    if "name" in changes:
        assignments.append(sql.SQL("name = %(name)s"))
        params["name"] = changes["name"]
    if "location" in changes:
        assignments.append(
            sql.SQL("location = ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography")
        )
        params["lon"] = changes["location"]["lon"]
        params["lat"] = changes["location"]["lat"]
    if "lines" in changes:
        assignments.append(sql.SQL("lines = %(lines)s"))
        params["lines"] = changes["lines"]
    if "is_active" in changes:
        assignments.append(sql.SQL("is_active = %(is_active)s"))
        params["is_active"] = changes["is_active"]
    conn.execute(
        sql.SQL("UPDATE stations SET {assignments} WHERE id = %(id)s").format(
            assignments=sql.SQL(", ").join(assignments)
        ),
        params,
    )
    return get_station(conn, station_id)


def delete_station(conn: psycopg.Connection, station_id: str) -> bool:
    row = conn.execute(
        "DELETE FROM stations WHERE id = %s RETURNING id",
        (station_id,),
    ).fetchone()
    return row is not None
