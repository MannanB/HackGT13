"""SQL for disruption scenarios and stored travel-time results."""

from typing import Any

import psycopg
from psycopg import sql

SCENARIO_COLUMNS = """
    id,
    created_at,
    closed_stations,
    description
"""

TRAVEL_COLUMNS = """
    calculated_at,
    scenario_id,
    zone_id,
    poi_id,
    travel_minutes,
    is_disrupted
"""


def list_scenarios(
    conn: psycopg.Connection,
    *,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    total = conn.execute("SELECT count(*) AS count FROM scenarios").fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM scenarios
            ORDER BY created_at DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(SCENARIO_COLUMNS)),
        {"limit": limit, "offset": offset},
    ).fetchall()
    return total, rows


def get_scenario(conn: psycopg.Connection, scenario_id: str) -> dict[str, Any] | None:
    return conn.execute(
        sql.SQL("SELECT {columns} FROM scenarios WHERE id = %(id)s::uuid").format(
            columns=sql.SQL(SCENARIO_COLUMNS)
        ),
        {"id": scenario_id},
    ).fetchone()


def create_scenario(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        sql.SQL(
            """
            INSERT INTO scenarios (closed_stations, description)
            VALUES (%(closed_stations)s, %(description)s)
            RETURNING {columns}
            """
        ).format(columns=sql.SQL(SCENARIO_COLUMNS)),
        payload,
    ).fetchone()
    assert row is not None
    return row


def update_scenario(
    conn: psycopg.Connection,
    scenario_id: str,
    changes: dict[str, Any],
) -> dict[str, Any] | None:
    assignments: list[sql.Composable] = []
    params: dict[str, Any] = {"id": scenario_id}
    if "closed_stations" in changes:
        assignments.append(sql.SQL("closed_stations = %(closed_stations)s"))
        params["closed_stations"] = changes["closed_stations"]
    if "description" in changes:
        assignments.append(sql.SQL("description = %(description)s"))
        params["description"] = changes["description"]
    conn.execute(
        sql.SQL("UPDATE scenarios SET {assignments} WHERE id = %(id)s::uuid").format(
            assignments=sql.SQL(", ").join(assignments)
        ),
        params,
    )
    return get_scenario(conn, scenario_id)


def delete_scenario(conn: psycopg.Connection, scenario_id: str) -> bool:
    row = conn.execute(
        "DELETE FROM scenarios WHERE id = %s::uuid RETURNING id",
        (scenario_id,),
    ).fetchone()
    return row is not None


def impact(
    conn: psycopg.Connection,
    *,
    scenario_id: str,
    poi_id: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    poi_filter = sql.SQL("")
    params: dict[str, Any] = {"scenario_id": scenario_id, "limit": limit}
    if poi_id is not None:
        poi_filter = sql.SQL("AND poi_id = %(poi_id)s::uuid")
        params["poi_id"] = poi_id
    return conn.execute(
        sql.SQL(
            """
            WITH latest AS (
                SELECT DISTINCT ON (zone_id, poi_id, is_disrupted)
                    zone_id,
                    poi_id,
                    is_disrupted,
                    travel_minutes
                FROM travel_times
                WHERE scenario_id = %(scenario_id)s::uuid
                {poi_filter}
                ORDER BY zone_id, poi_id, is_disrupted, calculated_at DESC
            )
            SELECT
                disrupted.zone_id,
                zones.name AS zone_name,
                disrupted.poi_id,
                pois.name AS poi_name,
                normal.travel_minutes AS normal_time,
                disrupted.travel_minutes AS disrupted_time,
                disrupted.travel_minutes - normal.travel_minutes AS delay
            FROM latest AS normal
            JOIN latest AS disrupted
                ON normal.zone_id = disrupted.zone_id
               AND normal.poi_id = disrupted.poi_id
            JOIN residential_zones AS zones ON zones.id = disrupted.zone_id
            JOIN points_of_interest AS pois ON pois.id = disrupted.poi_id
            WHERE normal.is_disrupted = FALSE
              AND disrupted.is_disrupted = TRUE
            ORDER BY delay DESC
            LIMIT %(limit)s
            """
        ).format(poi_filter=poi_filter),
        params,
    ).fetchall()


def list_travel_times(
    conn: psycopg.Connection,
    *,
    scenario_id: str,
    zone_id: str | None,
    poi_id: str | None,
    is_disrupted: bool | None,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    clauses = [sql.SQL("scenario_id = %(scenario_id)s::uuid")]
    params: dict[str, Any] = {"scenario_id": scenario_id}
    if zone_id is not None:
        clauses.append(sql.SQL("zone_id = %(zone_id)s"))
        params["zone_id"] = zone_id
    if poi_id is not None:
        clauses.append(sql.SQL("poi_id = %(poi_id)s::uuid"))
        params["poi_id"] = poi_id
    if is_disrupted is not None:
        clauses.append(sql.SQL("is_disrupted = %(is_disrupted)s"))
        params["is_disrupted"] = is_disrupted
    where = sql.SQL(" AND ").join(clauses)
    total = conn.execute(
        sql.SQL("SELECT count(*) AS count FROM travel_times WHERE {where}").format(where=where),
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM travel_times
            WHERE {where}
            ORDER BY calculated_at DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(TRAVEL_COLUMNS), where=where),
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    return total, rows


def insert_travel_times(
    conn: psycopg.Connection,
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    inserted: list[dict[str, Any]] = []
    query = sql.SQL(
        """
        INSERT INTO travel_times (
            calculated_at, scenario_id, zone_id, poi_id, travel_minutes, is_disrupted
        )
        VALUES (
            COALESCE(%(calculated_at)s, now()),
            %(scenario_id)s::uuid,
            %(zone_id)s,
            %(poi_id)s::uuid,
            %(travel_minutes)s,
            %(is_disrupted)s
        )
        RETURNING {columns}
        """
    ).format(columns=sql.SQL(TRAVEL_COLUMNS))
    for row in rows:
        inserted_row = conn.execute(query, row).fetchone()
        assert inserted_row is not None
        inserted.append(inserted_row)
    return inserted
