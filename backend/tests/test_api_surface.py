from app.main import app
from app.migrate import MIGRATIONS, iter_statements

EXPECTED_PATHS = [
    "/api/v1/stations",
    "/api/v1/stations/nearby",
    "/api/v1/stations/{station_id}",
    "/api/v1/transit-edges",
    "/api/v1/transit-edges/{edge_id}",
    "/api/v1/zones",
    "/api/v1/zones/{zone_id}",
    "/api/v1/pois",
    "/api/v1/pois/{poi_id}",
    "/api/v1/access-edges",
    "/api/v1/access-edges/{edge_id}",
    "/api/v1/network",
    "/api/v1/scenarios",
    "/api/v1/scenarios/{scenario_id}",
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

TABLES = [
    "stations",
    "transit_edges",
    "residential_zones",
    "points_of_interest",
    "access_edges",
    "scenarios",
    "travel_times",
    "poi_critical_cache",
]


def test_openapi_covers_schema_resources() -> None:
    paths = app.openapi()["paths"]
    missing = [path for path in EXPECTED_PATHS if path not in paths]
    assert missing == []


def test_schema_defines_tables_hypertable_and_spatial_index() -> None:
    script = "\n".join(
        statement.lower()
        for _, path in MIGRATIONS
        for statement in iter_statements(path.read_text(encoding="utf-8"))
    )
    for table in TABLES:
        assert f"create table if not exists {table}" in script
    assert "create_hypertable('travel_times', 'calculated_at'" in script
    assert "using gist (geometry)" in script
    assert "geography(point, 4326)" in script
