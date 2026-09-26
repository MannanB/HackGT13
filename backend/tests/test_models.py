import pytest
from pydantic import ValidationError

from app.schemas import (
    AccessEdgeCreate,
    LocationType,
    StationUpdate,
    TransitEdgeCreate,
    ZoneCreate,
)


def test_transit_edge_rejects_self_loop() -> None:
    with pytest.raises(ValidationError):
        TransitEdgeCreate(
            from_station="MIDTOWN",
            to_station="MIDTOWN",
            travel_minutes=3,
            line="Red",
            frequency_minutes=10,
        )


def test_zone_requires_polygonal_geojson() -> None:
    with pytest.raises(ValidationError):
        ZoneCreate(
            id="13121000100",
            geometry={"type": "Point", "coordinates": [-84.3, 33.7]},
        )


def test_poi_access_edge_requires_uuid() -> None:
    with pytest.raises(ValidationError):
        AccessEdgeCreate(
            location_type=LocationType.POI,
            location_id="not-a-uuid",
            station_id="MIDTOWN",
            walking_minutes=8,
        )


def test_station_update_requires_a_field() -> None:
    with pytest.raises(ValidationError):
        StationUpdate()
