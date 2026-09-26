import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(psycopg.errors.UniqueViolation)
    async def unique_violation(_request: Request, _exc: psycopg.Error) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": "A record with this key already exists"},
        )

    @app.exception_handler(psycopg.errors.ForeignKeyViolation)
    async def foreign_key(_request: Request, _exc: psycopg.Error) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"detail": "Referenced record does not exist"},
        )

    @app.exception_handler(psycopg.errors.CheckViolation)
    async def check_violation(_request: Request, _exc: psycopg.Error) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": "Value violates a database constraint"},
        )

    @app.exception_handler(psycopg.errors.NotNullViolation)
    async def not_null(_request: Request, _exc: psycopg.Error) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": "A required field is missing"},
        )

    @app.exception_handler(psycopg.errors.DataException)
    async def invalid_data(_request: Request, _exc: psycopg.Error) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": "Invalid column value"})

    @app.exception_handler(psycopg.errors.InternalError_)
    async def internal_error(_request: Request, exc: psycopg.Error) -> JSONResponse:
        message = str(exc).lower()
        if "geojson" in message or "geometry" in message:
            return JSONResponse(status_code=422, content={"detail": "Invalid geometry"})
        logger.exception("Database internal error")
        return JSONResponse(status_code=500, content={"detail": "Database error"})

    @app.exception_handler(psycopg.OperationalError)
    async def operational(_request: Request, exc: psycopg.Error) -> JSONResponse:
        logger.warning("Database unavailable (%s)", exc.__class__.__name__)
        return JSONResponse(status_code=503, content={"detail": "Database unavailable"})

    @app.exception_handler(PoolTimeout)
    async def pool_timeout(_request: Request, _exc: PoolTimeout) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Database unavailable"})
