from fastapi import APIRouter

<<<<<<< HEAD
from app.api import access, critical, health, network, pois, scenarios, stations, transit, travel_times, v1, zones
=======
from app.api import (
    access,
    experimental,
    health,
    intelligence,
    live,
    network,
    pois,
    scenarios,
    stations,
    transit,
    travel_times,
    v1,
    zones,
)
>>>>>>> e0b3acb7d56a4a115a667784874273a883388135

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
<<<<<<< HEAD
api_router.include_router(critical.router)
=======
api_router.include_router(live.router)
api_router.include_router(experimental.router)
>>>>>>> e0b3acb7d56a4a115a667784874273a883388135
