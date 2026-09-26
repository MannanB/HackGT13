import psycopg
from fastapi import APIRouter, Body, Depends, Query

from app.deps import get_db
from app.repositories import simulations as simulation_repo
from app.schemas import Page, TravelTime, TravelTimeCreate

router = APIRouter(prefix="/api/v1/travel-times", tags=["travel-times"])


@router.get("", response_model=Page[TravelTime])
def list_travel_times(
    scenario_id: str,
    zone_id: str | None = None,
    poi_id: str | None = None,
    is_disrupted: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = simulation_repo.list_travel_times(
        conn,
        scenario_id=scenario_id,
        zone_id=zone_id,
        poi_id=poi_id,
        is_disrupted=is_disrupted,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("", response_model=list[TravelTime], status_code=201)
def create_travel_times(
    payload: list[TravelTimeCreate] = Body(min_length=1, max_length=1000),
    conn: psycopg.Connection = Depends(get_db),
) -> list[dict]:
    """Store a batch of routing results. TimescaleDB keeps them by calculated_at."""
    rows = [item.model_dump(mode="json") for item in payload]
    return simulation_repo.insert_travel_times(conn, rows)
