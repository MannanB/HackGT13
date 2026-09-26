import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.common import PageLimit, PageOffset, page
from app.deps import get_db
from app.repositories import places as place_repo
from app.schemas import Page, Zone, ZoneCreate

router = APIRouter(prefix="/api/v1/zones", tags=["zones"])


@router.get("", response_model=Page[Zone])
def list_zones(
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = place_repo.list_zones(conn, limit=limit, offset=offset)
    return page(items, total, limit, offset)


@router.get("/{zone_id}", response_model=Zone)
def get_zone(zone_id: str, conn: psycopg.Connection = Depends(get_db)) -> dict:
    row = place_repo.get_zone(conn, zone_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Zone not found")
    return row


@router.post("", response_model=Zone, status_code=201)
def create_zone(payload: ZoneCreate, conn: psycopg.Connection = Depends(get_db)) -> dict:
    return place_repo.create_zone(conn, payload.model_dump(mode="json"))


@router.delete("/{zone_id}", status_code=204)
def delete_zone(zone_id: str, conn: psycopg.Connection = Depends(get_db)) -> Response:
    if not place_repo.delete_zone(conn, zone_id):
        raise HTTPException(status_code=404, detail="Zone not found")
    return Response(status_code=204)
