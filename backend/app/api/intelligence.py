import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.gemini import interpret_event as interpret_with_gemini
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


@router.post("/events")
def interpret_urban_event(payload: InterpretRequest) -> dict:
    if not payload.stations:
        raise HTTPException(status_code=400, detail="Station catalog is required")
    stations = [item.model_dump() for item in payload.stations]
    if payload.provider == "openai":
        return interpret_with_openai(payload.event, stations)
    try:
        return interpret_with_gemini(payload.event, stations)
    except HTTPException as gemini_error:
        if not get_settings().openai_api_key:
            raise
        logger.warning("Gemini unavailable, falling back to OpenAI: %s", gemini_error.detail)
    return interpret_with_openai(payload.event, stations)
