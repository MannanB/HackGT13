"""SQL for census zones and destinations."""

import json
from typing import Any

import psycopg
from psycopg import sql

from app.repositories.jsonutil import with_json

ZONE_COLUMNS = """
    id,
    name,
    ST_AsGeoJSON(geometry)::json AS geometry,
    json_build_object(
        'lon', ST_X(centroid::geometry),
        'lat', ST_Y(centroid::geometry)
    ) AS centroid,
    population,
    median_income
"""

POI_COLUMNS = """
    id,
    name,
    category,
    json_build_object(
        'lon', ST_X(location::geometry),
        'lat', ST_Y(location::geometry)
    ) AS location,
    source,
    source_id,
    jobs_count,
    enrollment
"""


def zone_exists(conn: psycopg.Connection, zone_id: str) -> bool:
    return conn.execute("SELECT 1 FROM residential_zones WHERE id = %s", (zone_id,)).fetchone() is not None


def poi_exists(conn: psycopg.Connection, poi_id: str) -> bool:
    return (
        conn.execute("SELECT 1 FROM points_of_interest WHERE id = %s::uuid", (poi_id,)).fetchone()
        is not None
    )


def list_zones(
    conn: psycopg.Connection,
    *,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    total = conn.execute("SELECT count(*) AS count FROM residential_zones").fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM residential_zones
            ORDER BY id
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(ZONE_COLUMNS)),
        {"limit": limit, "offset": offset},
    ).fetchall()
    return total, [with_json(row, "geometry", "centroid") for row in rows]


def get_zone(conn: psycopg.Connection, zone_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        sql.SQL("SELECT {columns} FROM residential_zones WHERE id = %(id)s").format(
            columns=sql.SQL(ZONE_COLUMNS)
        ),
        {"id": zone_id},
    ).fetchone()
    return with_json(row, "geometry", "centroid")


def create_zone(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    geometry = json.dumps(payload["geometry"])
    conn.execute(
        """
        INSERT INTO residential_zones (id, name, geometry, centroid, population)
        VALUES (
            %(id)s,
            %(name)s,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326)),
            ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326))::geography,
            %(population)s
        )
        """,
        {
            "id": payload["id"],
            "name": payload["name"],
            "geometry": geometry,
            "population": payload["population"],
        },
    )
    created = get_zone(conn, payload["id"])
    assert created is not None
    return created


def delete_zone(conn: psycopg.Connection, zone_id: str) -> bool:
    conn.execute(
        "DELETE FROM access_edges WHERE location_type = 'zone' AND location_id = %s",
        (zone_id,),
    )
    row = conn.execute(
        "DELETE FROM residential_zones WHERE id = %s RETURNING id",
        (zone_id,),
    ).fetchone()
    return row is not None


def list_pois(
    conn: psycopg.Connection,
    *,
    category: str | None,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    clauses: list[sql.Composable] = [sql.SQL("TRUE")]
    params: dict[str, Any] = {}
    if category is not None:
        clauses.append(sql.SQL("category = %(category)s"))
        params["category"] = category
    where = sql.SQL(" AND ").join(clauses)
    total = conn.execute(
        sql.SQL("SELECT count(*) AS count FROM points_of_interest WHERE {where}").format(where=where),
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        sql.SQL(
            """
            SELECT {columns}
            FROM points_of_interest
            WHERE {where}
            ORDER BY name, id
            LIMIT %(limit)s OFFSET %(offset)s
            """
        ).format(columns=sql.SQL(POI_COLUMNS), where=where),
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    return total, [with_json(row, "location") for row in rows]


def get_poi(conn: psycopg.Connection, poi_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        sql.SQL("SELECT {columns} FROM points_of_interest WHERE id = %(id)s::uuid").format(
            columns=sql.SQL(POI_COLUMNS)
        ),
        {"id": poi_id},
    ).fetchone()
    return with_json(row, "location")


def create_poi(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    location = payload["location"]
    row = conn.execute(
        sql.SQL(
            """
            INSERT INTO points_of_interest (name, category, location)
            VALUES (
                %(name)s,
                %(category)s,
                ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography
            )
            RETURNING {columns}
            """
        ).format(columns=sql.SQL(POI_COLUMNS)),
        {"name": payload["name"], "category": payload["category"], "lon": location["lon"], "lat": location["lat"]},
    ).fetchone()
    assert row is not None
    return with_json(row, "location")


def delete_poi(conn: psycopg.Connection, poi_id: str) -> bool:
    conn.execute(
        "DELETE FROM access_edges WHERE location_type = 'poi' AND location_id = %s",
        (poi_id,),
    )
    row = conn.execute(
        "DELETE FROM points_of_interest WHERE id = %s::uuid RETURNING id",
        (poi_id,),
    ).fetchone()
    return row is not None
