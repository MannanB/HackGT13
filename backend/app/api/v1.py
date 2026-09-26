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
    "/api/v1/poi-critical-cache/{fingerprint}",
    "/api/v1/intelligence/events",
    "/api/v1/live/trains",
    "/api/v1/experimental/context",
    "/api/v1/hospital-choice/model",
    "/api/v1/activity/model",
    "/api/v1/build/stations",
]


@router.get("", response_model=ApiRoot)
def api_root() -> ApiRoot:
    return ApiRoot(resources=RESOURCES)
