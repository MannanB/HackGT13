from fastapi import APIRouter

from app.api import access, health, intelligence, network, pois, scenarios, stations, transit, travel_times, v1, zones

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(v1.router)
api_router.include_router(intelligence.router)
api_router.include_router(stations.router)
api_router.include_router(transit.router)
api_router.include_router(zones.router)
api_router.include_router(pois.router)
api_router.include_router(access.router)
api_router.include_router(network.router)
api_router.include_router(scenarios.router)
api_router.include_router(travel_times.router)
api_router.include_router(live.router)
api_router.include_router(experimental.router)
