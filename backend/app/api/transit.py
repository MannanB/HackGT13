import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.deps import get_db
from app.repositories import stations as station_repo
from app.repositories import transit as transit_repo
from app.schemas import MartaLine, Page, TransitEdge, TransitEdgeCreate

router = APIRouter(prefix="/api/v1/transit-edges", tags=["transit-edges"])


def _require_stations(conn: psycopg.Connection, station_ids: list[str]) -> None:
    missing = station_repo.missing_ids(conn, station_ids)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown stations: {', '.join(missing)}",
        )


@router.get("", response_model=Page[TransitEdge])
def list_transit_edges(
    from_station: str | None = None,
    to_station: str | None = None,
    line: MartaLine | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = transit_repo.list_edges(
        conn,
        from_station=from_station,
        to_station=to_station,
        line=line.value if line else None,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("", response_model=TransitEdge, status_code=201)
def create_transit_edge(
    payload: TransitEdgeCreate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    _require_stations(conn, [payload.from_station, payload.to_station])
    return transit_repo.create_edge(conn, payload.model_dump(mode="json"))


@router.delete("/{edge_id}", status_code=204)
def delete_transit_edge(
    edge_id: str,
    conn: psycopg.Connection = Depends(get_db),
) -> Response:
    if not transit_repo.delete_edge(conn, edge_id):
        raise HTTPException(status_code=404, detail="Transit edge not found")
    return Response(status_code=204)
