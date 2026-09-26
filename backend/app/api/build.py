"""Permanent network edits: add a rail stop or a destination and persist it.

Unlike the scenario tools, everything here writes to Postgres. A new station is
wired into its line with transit edges in both directions, and walking links
(access_edges) are recomputed so zones and destinations can reach it.
"""

import re
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.api.common import require_known_stations
from app.deps import get_db
from app.repositories import access as access_repo
from app.repositories import places as place_repo
from app.repositories import stations as station_repo
from app.repositories import transit as transit_repo
from app.schemas import (
    PoiBuild,
    PoiBuildResult,
    PoiRemoveResult,
    StationBuild,
    StationBuildResult,
    StationRemoveResult,
)

router = APIRouter(prefix="/api/v1/build", tags=["build"])

# Used when a line has no edges yet to learn from (~33 km/h including dwell).
FALLBACK_KM_PER_MINUTE = 0.55
FALLBACK_FREQUENCY_MINUTES = 12.0
MIN_TRAVEL_MINUTES = 0.5
MANUAL_SOURCE = "manual"


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "stop"


def _unique_station_id(conn: psycopg.Connection, name: str) -> str:
    base = f"custom-{_slug(name)}"[:56]
    candidate = base
    suffix = 2
    while station_repo.exists(conn, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


@router.post("/stations", response_model=StationBuildResult, status_code=201)
def build_station(
    payload: StationBuild,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    neighbor_ids = [item.station_id for item in payload.neighbors]
    require_known_stations(conn, neighbor_ids)
    if payload.id is not None and station_repo.exists(conn, payload.id):
        raise HTTPException(status_code=409, detail=f"Station {payload.id} already exists")

    line = payload.line.value
    defaults = transit_repo.line_defaults(conn, line)
    speed = defaults["km_per_minute"] or FALLBACK_KM_PER_MINUTE
    frequency = payload.frequency_minutes or defaults["frequency_minutes"] or FALLBACK_FREQUENCY_MINUTES
    location = payload.location

    with conn.transaction():
        station_id = payload.id or _unique_station_id(conn, payload.name)
        station = station_repo.create_station(
            conn,
            {
                "id": station_id,
                "name": payload.name,
                "location": {"lon": location.lon, "lat": location.lat},
                "lines": [item.value for item in payload.all_lines],
                "is_active": True,
            },
        )

        removed = 0
        if len(neighbor_ids) == 2:
            removed = transit_repo.delete_between(conn, neighbor_ids[0], neighbor_ids[1], line)

        edges = []
        for neighbor in payload.neighbors:
            minutes = neighbor.travel_minutes
            if minutes is None:
                km = station_repo.distance_km(conn, neighbor.station_id, location.lon, location.lat)
                minutes = max(MIN_TRAVEL_MINUTES, round(km / speed, 2))
            for from_station, to_station in (
                (neighbor.station_id, station_id),
                (station_id, neighbor.station_id),
            ):
                edges.append(
                    transit_repo.create_edge(
                        conn,
                        {
                            "from_station": from_station,
                            "to_station": to_station,
                            "travel_minutes": minutes,
                            "line": line,
                            "frequency_minutes": frequency,
                        },
                    )
                )

        total_access = access_repo.rebuild_all(conn)
        station_access = access_repo.count_for_station(conn, station_id)

    return {
        "station": station,
        "transit_edges": edges,
        "removed_edges": removed,
        "access_edges": station_access,
        "total_access_edges": total_access,
    }


@router.delete("/stations/{station_id}", response_model=StationRemoveResult)
def remove_station(
    station_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    """Delete a stop. Where it sat between two stops on a line, the line is re-joined."""
    station = station_repo.get_station(conn, station_id)
    if station is None:
        raise HTTPException(status_code=404, detail=f"Station {station_id} not found")

    with conn.transaction():
        neighbors = transit_repo.neighbors_of(conn, station_id)
        removed_edges = conn.execute(
            "SELECT count(*) AS count FROM transit_edges WHERE from_station = %(id)s OR to_station = %(id)s",
            {"id": station_id},
        ).fetchone()["count"]
        station_repo.delete_station(conn, station_id)  # cascades transit + access edges

        by_line: dict[str, list[dict]] = {}
        for row in neighbors:
            by_line.setdefault(row["line"], []).append(row)

        bridged = []
        for line, others in by_line.items():
            if len(others) != 2:
                continue
            a, b = others
            if transit_repo.direct_link_exists(conn, a["other"], b["other"], line):
                continue
            minutes = round(float(a["travel_minutes"]) + float(b["travel_minutes"]), 2)
            frequency = (float(a["frequency_minutes"]) + float(b["frequency_minutes"])) / 2
            for from_station, to_station in ((a["other"], b["other"]), (b["other"], a["other"])):
                bridged.append(
                    transit_repo.create_edge(
                        conn,
                        {
                            "from_station": from_station,
                            "to_station": to_station,
                            "travel_minutes": minutes,
                            "line": line,
                            "frequency_minutes": frequency,
                        },
                    )
                )

        total_access = access_repo.rebuild_all(conn)

    return {
        "station": station,
        "removed_edges": removed_edges,
        "bridged_edges": bridged,
        "total_access_edges": total_access,
    }


@router.delete("/pois/{poi_id}", response_model=PoiRemoveResult)
def remove_poi(
    poi_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    try:
        UUID(poi_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"POI {poi_id} not found") from None
    poi = place_repo.get_poi(conn, poi_id)
    if poi is None:
        raise HTTPException(status_code=404, detail=f"POI {poi_id} not found")
    with conn.transaction():
        removed = conn.execute(
            "SELECT count(*) AS count FROM access_edges WHERE location_type = 'poi' AND location_id = %s",
            (poi_id,),
        ).fetchone()["count"]
        place_repo.delete_poi(conn, poi_id)
    return {"poi": poi, "removed_access_edges": removed}


@router.post("/pois", response_model=PoiBuildResult, status_code=201)
def build_poi(
    payload: PoiBuild,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    with conn.transaction():
        poi = place_repo.create_poi(
            conn,
            {
                "name": payload.name,
                "category": payload.category.lower(),
                "location": {"lon": payload.location.lon, "lat": payload.location.lat},
                "source": MANUAL_SOURCE,
                "source_id": None,
                "jobs_count": payload.jobs_count,
                "enrollment": payload.enrollment,
            },
        )
        access = access_repo.rebuild_for_location(conn, "poi", str(poi["id"]))
    return {"poi": poi, "access_edges": access}
