from fastapi import APIRouter

from app.schemas import ApiRoot

router = APIRouter(prefix="/api/v1", tags=["v1"])

RESOURCES = [
    "/api/v1/stations",
    "/api/v1/stations/nearby",
    "/api/v1/transit-edges",
    "/api/v1/zones",
    "/api/v1/pois",
    "/api/v1/access-edges",
    "/api/v1/network",
    "/api/v1/scenarios",
    "/api/v1/scenarios/{scenario_id}/impact",
    "/api/v1/travel-times",
    "/api/v1/intelligence/events",
]


@router.get("", response_model=ApiRoot)
def api_root() -> ApiRoot:
    return ApiRoot(resources=RESOURCES)
