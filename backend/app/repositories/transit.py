"""SQL for station-to-station connections."""

from typing import Any

import psycopg
from psycopg import sql

COLUMNS = """
    id,
    from_station,
    to_station,
    travel_minutes,
    line,
    frequency_minutes
"""


def _where(
    from_station: str | None,
    to_station: str | None,
    line: str | None,
) -> tuple[sql.Composable, dict[str, Any]]:
    clauses: list[sql.Composable] = [sql.SQL("TRUE")]
    params: dict[str, Any] = {}
    if from_station is not None:
        clauses.append(sql.SQL("from_station = %(from_station)s"))
        params["from_station"] = from_station
    if to_station is not None:
        clauses.append(sql.SQL("to_station = %(to_station)s"))
        params["to_station"] = to_station
    if line is not None:
        clauses.append(sql.SQL("line = %(line)s"))
        params["line"] = line
    return sql.SQL(" AND ").join(clauses), params


def list_edges(
    conn: psycopg.Connection,
    *,
    from_station: str | None,
    to_station: str | None,
    line: str | None,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    where, params = _where(from_station, to_station, line)
    total = conn.execute(
        sql.SQL("SELECT count(*) AS count FROM transit_edges WHERE {where}").format(where=where),
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM transit_edges
            WHERE {where}
            ORDER BY line, from_station, to_station
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(COLUMNS), where=where),
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    return total, rows


def list_for_network(conn: psycopg.Connection) -> list[dict[str, Any]]:
    return conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM transit_edges
            ORDER BY line, from_station, to_station
            """
        ).format(columns=sql.SQL(COLUMNS))
    ).fetchall()


def get_edge(conn: psycopg.Connection, edge_id: str) -> dict[str, Any] | None:
    return conn.execute(
        sql.SQL("SELECT {columns} FROM transit_edges WHERE id = %(id)s::uuid").format(
            columns=sql.SQL(COLUMNS)
        ),
        {"id": edge_id},
    ).fetchone()


def create_edge(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        sql.SQL(
            """
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
            RETURNING {columns}
            """
        ).format(columns=sql.SQL(COLUMNS)),
        payload,
    ).fetchone()
    assert row is not None
    return row


def delete_edge(conn: psycopg.Connection, edge_id: str) -> bool:
    row = conn.execute(
        "DELETE FROM transit_edges WHERE id = %s::uuid RETURNING id",
        (edge_id,),
    ).fetchone()
    return row is not None


def delete_between(conn: psycopg.Connection, station_a: str, station_b: str, line: str) -> int:
    """Remove the direct hop between two stations on a line, in both directions."""
    rows = conn.execute(
        """
        DELETE FROM transit_edges
        WHERE line = %(line)s
          AND (
            (from_station = %(a)s AND to_station = %(b)s)
            OR (from_station = %(b)s AND to_station = %(a)s)
          )
        RETURNING id
        """,
        {"a": station_a, "b": station_b, "line": line},
    ).fetchall()
    return len(rows)


def neighbors_of(conn: psycopg.Connection, station_id: str) -> list[dict[str, Any]]:
    """Every station directly linked to this one, one row per (line, other station)."""
    return conn.execute(
        """
        SELECT
            line,
            CASE WHEN from_station = %(id)s THEN to_station ELSE from_station END AS other,
            avg(travel_minutes) AS travel_minutes,
            avg(frequency_minutes) AS frequency_minutes
        FROM transit_edges
        WHERE from_station = %(id)s OR to_station = %(id)s
        GROUP BY line, other
        ORDER BY line, other
        """,
        {"id": station_id},
    ).fetchall()


def direct_link_exists(conn: psycopg.Connection, station_a: str, station_b: str, line: str) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM transit_edges
        WHERE line = %(line)s
          AND (
            (from_station = %(a)s AND to_station = %(b)s)
            OR (from_station = %(b)s AND to_station = %(a)s)
          )
        LIMIT 1
        """,
        {"a": station_a, "b": station_b, "line": line},
    ).fetchone()
    return row is not None


def line_defaults(conn: psycopg.Connection, line: str) -> dict[str, float | None]:
    """Typical speed (km/min) and headway for a line, from the edges already loaded."""
    row = conn.execute(
        """
        SELECT
            avg(ST_Distance(a.location, b.location) / 1000.0 / e.travel_minutes) AS km_per_minute,
            avg(e.frequency_minutes) AS frequency_minutes
        FROM transit_edges AS e
        JOIN stations AS a ON a.id = e.from_station
        JOIN stations AS b ON b.id = e.to_station
        WHERE e.line = %s AND e.travel_minutes > 0
        """,
        (line,),
    ).fetchone()
    return {
        "km_per_minute": float(row["km_per_minute"]) if row and row["km_per_minute"] else None,
        "frequency_minutes": float(row["frequency_minutes"]) if row and row["frequency_minutes"] else None,
    }
