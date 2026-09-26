import psycopg
from fastapi import APIRouter, Depends

from app.deps import get_db
from app.repositories import stations as station_repo
from app.repositories import transit as transit_repo
from app.schemas import Network

router = APIRouter(prefix="/api/v1/network", tags=["network"])


@router.get("", response_model=Network)
def get_network(conn: psycopg.Connection = Depends(get_db)) -> dict:
    """Stations and transit edges for building the routing graph."""
    return {
        "stations": station_repo.list_for_network(conn),
        "transit_edges": transit_repo.list_for_network(conn),
    }
