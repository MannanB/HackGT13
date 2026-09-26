from typing import Annotated, Any

import psycopg
from fastapi import HTTPException, Query

from app.repositories import stations as station_repo

PageLimit = Annotated[int, Query(ge=1, le=200)]
PageOffset = Annotated[int, Query(ge=0)]


def page(items: list[Any], total: int, limit: int, offset: int) -> dict[str, Any]:
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def require_known_stations(conn: psycopg.Connection, station_ids: list[str]) -> None:
    missing = station_repo.missing_ids(conn, station_ids)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown stations: {', '.join(missing)}",
        )
