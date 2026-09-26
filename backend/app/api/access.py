import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.common import PageLimit, PageOffset, page
from app.deps import get_db
from app.repositories import access as access_repo
from app.repositories import places as place_repo
from app.repositories import stations as station_repo
from app.schemas import AccessEdge, AccessEdgeCreate, LocationType, Page

router = APIRouter(prefix="/api/v1/access-edges", tags=["access-edges"])


@router.get("", response_model=Page[AccessEdge])
def list_access_edges(
    location_type: LocationType | None = None,
    location_id: str | None = None,
    station_id: str | None = None,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    """Walking links from a zone or POI to one or more stations."""
    total, items = access_repo.list_edges(
        conn,
        location_type=location_type.value if location_type else None,
        location_id=location_id,
        station_id=station_id,
        limit=limit,
        offset=offset,
    )
    return page(items, total, limit, offset)


@router.post("", response_model=AccessEdge, status_code=201)
def create_access_edge(
    payload: AccessEdgeCreate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    if not station_repo.exists(conn, payload.station_id):
        raise HTTPException(status_code=400, detail="Station does not exist")
    if payload.location_type == LocationType.ZONE:
        if not place_repo.zone_exists(conn, payload.location_id):
            raise HTTPException(status_code=400, detail="Zone does not exist")
    elif not place_repo.poi_exists(conn, payload.location_id):
        raise HTTPException(status_code=400, detail="POI does not exist")
    return access_repo.create_edge(conn, payload.model_dump(mode="json"))


@router.delete("/{edge_id}", status_code=204)
def delete_access_edge(
    edge_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> Response:
    if not access_repo.delete_edge(conn, edge_id):
        raise HTTPException(status_code=404, detail="Access edge not found")
    return Response(status_code=204)
