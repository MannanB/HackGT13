from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.gemini import interpret_event

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


@router.post("/events")
def interpret_urban_event(payload: InterpretRequest) -> dict:
    if not payload.stations:
        raise HTTPException(status_code=400, detail="Station catalog is required")
    return interpret_event(
        payload.event,
        [item.model_dump() for item in payload.stations],
    )
