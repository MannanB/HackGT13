from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")


class MartaLine(str, Enum):
    RED = "Red"
    GOLD = "Gold"
    BLUE = "Blue"
    GREEN = "Green"


class LocationType(str, Enum):
    ZONE = "zone"
    POI = "poi"


class LonLat(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class Station(BaseModel):
    id: str
    name: str
    location: LonLat
    lines: list[MartaLine]
    is_active: bool


class StationCreate(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    location: LonLat
    lines: list[MartaLine] = []
    is_active: bool = True


class StationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: LonLat | None = None
    lines: list[MartaLine] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> StationUpdate:
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self


class StationNearby(Station):
    distance_meters: float


class NearbyStations(BaseModel):
    items: list[StationNearby]


class TransitEdge(BaseModel):
    id: UUID
    from_station: str
    to_station: str
    travel_minutes: float
    line: MartaLine
    frequency_minutes: float


class TransitEdgeCreate(BaseModel):
    from_station: str = Field(min_length=1, max_length=64)
    to_station: str = Field(min_length=1, max_length=64)
    travel_minutes: float = Field(ge=0)
    line: MartaLine
    frequency_minutes: float = Field(gt=0)

    @model_validator(mode="after")
    def stations_differ(self) -> TransitEdgeCreate:
        if self.from_station == self.to_station:
            raise ValueError("from_station and to_station must differ")
        return self


class Zone(BaseModel):
    id: str
    name: str | None
    geometry: dict[str, Any]
    centroid: LonLat
    population: int
    median_income: int | None = None


class ZoneCreate(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    name: str | None = Field(default=None, max_length=200)
    geometry: dict[str, Any]
    population: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def geometry_is_polygonal(self) -> ZoneCreate:
        kind = self.geometry.get("type")
        if kind not in {"Polygon", "MultiPolygon"}:
            raise ValueError("geometry type must be Polygon or MultiPolygon")
        if "coordinates" not in self.geometry:
            raise ValueError("geometry.coordinates is required")
        return self


class PointOfInterest(BaseModel):
    id: UUID
    name: str
    category: str
    location: LonLat
    source: str | None = None
    source_id: str | None = None
    jobs_count: int | None = None
    enrollment: int | None = None


class PointOfInterestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=64)
    location: LonLat
    source: str | None = Field(default=None, max_length=64)
    source_id: str | None = Field(default=None, max_length=128)
    jobs_count: int | None = Field(default=None, ge=0)
    enrollment: int | None = Field(default=None, ge=0)


class AccessEdge(BaseModel):
    id: UUID
    location_type: LocationType
    location_id: str
    station_id: str
    walking_minutes: float


class AccessEdgeCreate(BaseModel):
    location_type: LocationType
    location_id: str = Field(min_length=1, max_length=64)
    station_id: str = Field(min_length=1, max_length=64)
    walking_minutes: float = Field(ge=0)

    @model_validator(mode="after")
    def poi_id_is_uuid(self) -> AccessEdgeCreate:
        if self.location_type == LocationType.POI:
            UUID(self.location_id)
        return self


class Scenario(BaseModel):
    id: UUID
    created_at: datetime
    closed_stations: list[str]
    description: str | None


class ScenarioCreate(BaseModel):
    closed_stations: list[str] = []
    description: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def dedupe_stations(self) -> ScenarioCreate:
        self.closed_stations = list(dict.fromkeys(self.closed_stations))
        return self


class ScenarioUpdate(BaseModel):
    closed_stations: list[str] | None = None
    description: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_a_change(self) -> ScenarioUpdate:
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        if self.closed_stations is not None:
            self.closed_stations = list(dict.fromkeys(self.closed_stations))
        return self


class TravelTime(BaseModel):
    calculated_at: datetime
    scenario_id: UUID
    zone_id: str
    poi_id: UUID
    travel_minutes: float
    is_disrupted: bool


class TravelTimeCreate(BaseModel):
    scenario_id: UUID
    zone_id: str = Field(min_length=1, max_length=32)
    poi_id: UUID
    travel_minutes: float = Field(ge=0)
    is_disrupted: bool
    calculated_at: datetime | None = None


class ImpactRow(BaseModel):
    zone_id: str
    zone_name: str | None
    poi_id: UUID
    poi_name: str
    normal_time: float
    disrupted_time: float
    delay: float


class ImpactReport(BaseModel):
    scenario_id: UUID
    results: list[ImpactRow]


class Network(BaseModel):
    stations: list[Station]
    transit_edges: list[TransitEdge]


class StationNeighbor(BaseModel):
    """An existing station the new stop connects to on its line."""

    station_id: str = Field(min_length=1, max_length=64)
    travel_minutes: float | None = Field(default=None, gt=0)


class StationBuild(BaseModel):
    """Permanently add a rail stop, wire it into the line, and refresh walking links."""

    id: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=200)
    location: LonLat
    line: MartaLine
    extra_lines: list[MartaLine] = []
    neighbors: list[StationNeighbor] = Field(default_factory=list, max_length=2)
    frequency_minutes: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def neighbors_differ(self) -> StationBuild:
        ids = [item.station_id for item in self.neighbors]
        if len(set(ids)) != len(ids):
            raise ValueError("neighbors must be distinct stations")
        if self.id is not None and self.id in ids:
            raise ValueError("a station cannot neighbor itself")
        return self

    @property
    def all_lines(self) -> list[MartaLine]:
        return list(dict.fromkeys([self.line, *self.extra_lines]))


class StationBuildResult(BaseModel):
    station: Station
    transit_edges: list[TransitEdge]
    removed_edges: int
    access_edges: int
    total_access_edges: int


class StationRemoveResult(BaseModel):
    station: Station
    removed_edges: int
    bridged_edges: list[TransitEdge]
    total_access_edges: int


class PoiCriticalCache(BaseModel):
    fingerprint: str
    snapshot: dict[str, Any]
    calculated_at: datetime


class PoiCriticalCacheWrite(BaseModel):
    snapshot: dict[str, Any]


class ApiRoot(BaseModel):
    service: Literal["hackgt13"] = "hackgt13"
    version: Literal["v1"] = "v1"
    resources: list[str]
