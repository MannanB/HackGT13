import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.deps import get_db
from app.repositories import stations as station_repo
from app.schemas import (
    MartaLine,
    NearbyStations,
    Page,
    Station,
    StationCreate,
    StationUpdate,
)

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])


@router.get("", response_model=Page[Station])
def list_stations(
    line: MartaLine | None = None,
    is_active: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = station_repo.list_stations(
        conn,
        line=line.value if line else None,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/nearby", response_model=NearbyStations)
def nearby_stations(
    lon: float = Query(ge=-180, le=180),
    lat: float = Query(ge=-90, le=90),
    limit: int = Query(5, ge=1, le=50),
    active_only: bool = True,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    """Nearest stations to a point, using the PostGIS geography index."""
    return {
        "items": station_repo.nearby(
            conn, lon=lon, lat=lat, limit=limit, active_only=active_only
        )
    }


@router.get("/{station_id}", response_model=Station)
def get_station(
    station_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    row = station_repo.get_station(conn, station_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return row


@router.post("", response_model=Station, status_code=201)
def create_station(
    payload: StationCreate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    return station_repo.create_station(conn, payload.model_dump(mode="json"))


@router.patch("/{station_id}", response_model=Station)
def update_station(
    station_id: str,
    payload: StationUpdate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    row = station_repo.update_station(
        conn,
        station_id,
        payload.model_dump(mode="json", exclude_unset=True),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return row


@router.delete("/{station_id}", status_code=204)
def delete_station(
    station_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> Response:
    if not station_repo.delete_station(conn, station_id):
        raise HTTPException(status_code=404, detail="Station not found")
    return Response(status_code=204)
