import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.common import PageLimit, PageOffset, page, require_known_stations
from app.deps import get_db
from app.repositories import simulations as simulation_repo
from app.schemas import ImpactReport, Page, Scenario, ScenarioCreate, ScenarioUpdate

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


@router.get("", response_model=Page[Scenario])
def list_scenarios(
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    total, items = simulation_repo.list_scenarios(conn, limit=limit, offset=offset)
    return page(items, total, limit, offset)


@router.post("", response_model=Scenario, status_code=201)
def create_scenario(
    payload: ScenarioCreate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    require_known_stations(conn, payload.closed_stations)
    return simulation_repo.create_scenario(conn, payload.model_dump(mode="json"))


@router.get("/{scenario_id}", response_model=Scenario)
def get_scenario(scenario_id: str, conn: psycopg.Connection = Depends(get_db)) -> dict:
    row = simulation_repo.get_scenario(conn, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return row


@router.patch("/{scenario_id}", response_model=Scenario)
def update_scenario(
    scenario_id: str,
    payload: ScenarioUpdate,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if "closed_stations" in changes:
        require_known_stations(conn, changes["closed_stations"])
    row = simulation_repo.update_scenario(conn, scenario_id, changes)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return row


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: str, conn: psycopg.Connection = Depends(get_db)) -> Response:
    if not simulation_repo.delete_scenario(conn, scenario_id):
        raise HTTPException(status_code=404, detail="Scenario not found")
    return Response(status_code=204)


@router.get("/{scenario_id}/impact", response_model=ImpactReport)
def scenario_impact(
    scenario_id: str,
    poi_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    """Zones ordered by added travel time between the normal and disrupted runs."""
    if simulation_repo.get_scenario(conn, scenario_id) is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    results = simulation_repo.impact(
        conn,
        scenario_id=scenario_id,
        poi_id=poi_id,
        limit=limit,
    )
    return {"scenario_id": scenario_id, "results": results}
