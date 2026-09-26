"""Postgres connection pool.

The pool is created on first use so the API can boot without a live database.
Callers should use get_db() from app.deps rather than touching the pool directly.
"""

from __future__ import annotations

import logging

from psycopg_pool import ConnectionPool

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=get_settings().database_url,
            min_size=1,
            max_size=5,
            timeout=10,
            open=True,
            kwargs={"connect_timeout": 5},
        )
        logger.info("Postgres connection pool opened")
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        logger.info("Postgres connection pool closed")


def ping() -> None:
    with get_pool().connection() as conn:
        conn.execute("SELECT 1")
