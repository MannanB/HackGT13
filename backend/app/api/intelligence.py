import logging
from collections.abc import Callable
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.gemini import gemini_is_exhausted, interpret_event as interpret_with_gemini
from app.openai import interpret_event as interpret_with_openai
from app.xai import interpret_event as interpret_with_xai

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/intelligence", tags=["intelligence"])


class StationCatalogItem(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    lines: list[str] = []


class InterpretRequest(BaseModel):
    event: str = Field(min_length=3, max_length=4000)
    stations: list[StationCatalogItem]
    provider: Literal["gemini", "openai"] = "gemini"
    context: str = Field(default="", max_length=8000)


@router.post("/events")
def interpret_urban_event(payload: InterpretRequest) -> dict:
    if not payload.stations:
        raise HTTPException(status_code=400, detail="Station catalog is required")
    stations = [item.model_dump() for item in payload.stations]
    event = payload.event
    if payload.context.strip():
        event = f"Current simulator state:\n{payload.context.strip()}\n\nUser message:\n{payload.event}"
    settings = get_settings()
    if not (settings.openai_api_key and settings.xai_api_key):
        get_settings.cache_clear()
        settings = get_settings()
    attempts: list[tuple[str, Callable[[str, list[dict[str, Any]]], dict[str, Any]]]] = []
    if settings.gemini_api_key and not gemini_is_exhausted():
        attempts.append(("Gemini", interpret_with_gemini))
    if settings.xai_api_key:
        attempts.append(("Grok", interpret_with_xai))
    if settings.openai_api_key:
        attempts.append(("ChatGPT", interpret_with_openai))
    if not attempts:
        raise HTTPException(status_code=503, detail="No intelligence model is configured")
    last_error = HTTPException(status_code=502, detail="No intelligence model responded")
    for index, (name, interpret) in enumerate(attempts):
        try:
            return interpret(event, stations)
        except HTTPException as exc:
            last_error = exc
            if index < len(attempts) - 1:
                logger.warning("%s unavailable, trying the next model: %s", name, exc.detail)
    raise last_error
