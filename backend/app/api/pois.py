import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.common import PageLimit, PageOffset, page
from app.deps import get_db
from app.repositories import places as place_repo
from app.schemas import Page, PointOfInterest, PointOfInterestCreate

router = APIRouter(prefix="/api/v1/pois", tags=["pois"])


@router.get("", response_model=Page[PointOfInterest])
def list_pois(
    category: str | None = None,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = place_repo.list_pois(conn, category=category, limit=limit, offset=offset)
    return page(items, total, limit, offset)


@router.get("/{poi_id}", response_model=PointOfInterest)
def get_poi(poi_id: str, conn: psycopg.Connection = Depends(get_db)) -> dict:
    row = place_repo.get_poi(conn, poi_id)
    if row is None:
        raise HTTPException(status_code=404, detail="POI not found")
    return row


@router.post("", response_model=PointOfInterest, status_code=201)
def create_poi(
    payload: PointOfInterestCreate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    return place_repo.create_poi(conn, payload.model_dump(mode="json"))


@router.delete("/{poi_id}", status_code=204)
def delete_poi(poi_id: str, conn: psycopg.Connection = Depends(get_db)) -> Response:
    if not place_repo.delete_poi(conn, poi_id):
        raise HTTPException(status_code=404, detail="POI not found")
    return Response(status_code=204)
