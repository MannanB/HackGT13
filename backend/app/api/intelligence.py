import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.gemini import gemini_is_exhausted, interpret_event as interpret_with_gemini
from app.openai import interpret_event as interpret_with_openai

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
    if not settings.openai_api_key:
        get_settings.cache_clear()
        settings = get_settings()
    use_openai = (
        payload.provider == "openai"
        or gemini_is_exhausted()
        or not settings.gemini_api_key
    )
    if use_openai:
        return interpret_with_openai(event, stations)
    try:
        return interpret_with_gemini(event, stations)
    except HTTPException as gemini_error:
        if not settings.openai_api_key:
            raise
        logger.warning("Gemini unavailable, falling back to OpenAI: %s", gemini_error.detail)
        return interpret_with_openai(event, stations)
