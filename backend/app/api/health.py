import logging

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg_pool import PoolTimeout

from app.db import ping

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
def health_db() -> dict[str, str]:
    try:
        ping()
    except (psycopg.Error, PoolTimeout) as exc:
        logger.warning("Database health check failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}
