import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_db
from app.repositories import critical as critical_repo
from app.schemas import PoiCriticalCache, PoiCriticalCacheWrite

router = APIRouter(prefix="/api/v1/poi-critical-cache", tags=["poi-critical-cache"])


@router.get("/{fingerprint}", response_model=PoiCriticalCache)
def get_poi_critical_cache(
    fingerprint: str,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    row = critical_repo.get(conn, fingerprint)
    if row is None:
        raise HTTPException(status_code=404, detail="Cache miss")
    return row


@router.put("/{fingerprint}", response_model=PoiCriticalCache)
def put_poi_critical_cache(
    fingerprint: str,
    payload: PoiCriticalCacheWrite,
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    return critical_repo.upsert(conn, fingerprint, payload.snapshot)
