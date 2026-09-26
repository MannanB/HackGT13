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
