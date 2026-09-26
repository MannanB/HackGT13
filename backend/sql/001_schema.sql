-- MARTA impact simulator.
-- PostgreSQL holds the network, PostGIS holds geography, TimescaleDB holds results.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    lines TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT stations_lines_known CHECK (
        lines <@ ARRAY['Red', 'Gold', 'Blue', 'Green']::TEXT[]
    )
);

CREATE INDEX IF NOT EXISTS stations_location_gix ON stations USING GIST (location);
CREATE INDEX IF NOT EXISTS stations_lines_gin ON stations USING GIN (lines);

CREATE TABLE IF NOT EXISTS transit_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_station TEXT NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    to_station TEXT NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    travel_minutes DOUBLE PRECISION NOT NULL,
    line TEXT NOT NULL,
    frequency_minutes DOUBLE PRECISION NOT NULL,
    CONSTRAINT transit_edges_travel_nonnegative CHECK (travel_minutes >= 0),
    CONSTRAINT transit_edges_frequency_positive CHECK (frequency_minutes > 0),
    CONSTRAINT transit_edges_line_known CHECK (line IN ('Red', 'Gold', 'Blue', 'Green')),
    CONSTRAINT transit_edges_distinct_stations CHECK (from_station <> to_station)
);

CREATE INDEX IF NOT EXISTS transit_edges_from_idx ON transit_edges (from_station);
CREATE INDEX IF NOT EXISTS transit_edges_to_idx ON transit_edges (to_station);
CREATE INDEX IF NOT EXISTS transit_edges_line_idx ON transit_edges (line);

CREATE TABLE IF NOT EXISTS residential_zones (
    id TEXT PRIMARY KEY,
    name TEXT,
    geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    centroid GEOGRAPHY(POINT, 4326) NOT NULL,
    population INTEGER NOT NULL DEFAULT 0,
    median_income INTEGER,
    CONSTRAINT residential_zones_population_nonnegative CHECK (population >= 0),
    CONSTRAINT residential_zones_income_nonnegative CHECK (median_income IS NULL OR median_income >= 0)
);

CREATE INDEX IF NOT EXISTS residential_zones_geometry_gix
    ON residential_zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS residential_zones_centroid_gix
    ON residential_zones USING GIST (centroid);

CREATE TABLE IF NOT EXISTS points_of_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    source TEXT,
    source_id TEXT,
    jobs_count INTEGER,
    enrollment INTEGER,
    CONSTRAINT pois_jobs_nonnegative CHECK (jobs_count IS NULL OR jobs_count >= 0),
    CONSTRAINT pois_enrollment_nonnegative CHECK (enrollment IS NULL OR enrollment >= 0)
);

CREATE INDEX IF NOT EXISTS pois_location_gix ON points_of_interest USING GIST (location);
CREATE INDEX IF NOT EXISTS pois_category_idx ON points_of_interest (category);
CREATE UNIQUE INDEX IF NOT EXISTS pois_source_record_idx
    ON points_of_interest (source, source_id)
    WHERE source IS NOT NULL AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_type TEXT NOT NULL,
    location_id TEXT NOT NULL,
    station_id TEXT NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    walking_minutes DOUBLE PRECISION NOT NULL,
    CONSTRAINT access_edges_location_type CHECK (location_type IN ('zone', 'poi')),
    CONSTRAINT access_edges_walking_nonnegative CHECK (walking_minutes >= 0),
    CONSTRAINT access_edges_unique_link UNIQUE (location_type, location_id, station_id)
);

CREATE INDEX IF NOT EXISTS access_edges_location_idx
    ON access_edges (location_type, location_id);
CREATE INDEX IF NOT EXISTS access_edges_station_idx ON access_edges (station_id);

CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_stations TEXT[] NOT NULL DEFAULT '{}',
    description TEXT
);

CREATE INDEX IF NOT EXISTS scenarios_created_at_idx ON scenarios (created_at DESC);

-- Partition column must be part of the primary key for a Timescale hypertable.
CREATE TABLE IF NOT EXISTS travel_times (
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scenario_id UUID NOT NULL REFERENCES scenarios (id) ON DELETE CASCADE,
    zone_id TEXT NOT NULL REFERENCES residential_zones (id) ON DELETE CASCADE,
    poi_id UUID NOT NULL REFERENCES points_of_interest (id) ON DELETE CASCADE,
    travel_minutes DOUBLE PRECISION NOT NULL,
    is_disrupted BOOLEAN NOT NULL,
    PRIMARY KEY (calculated_at, scenario_id, zone_id, poi_id, is_disrupted),
    CONSTRAINT travel_times_minutes_nonnegative CHECK (travel_minutes >= 0)
);

SELECT create_hypertable('travel_times', 'calculated_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS travel_times_scenario_idx
    ON travel_times (scenario_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS travel_times_latest_idx
    ON travel_times (scenario_id, zone_id, poi_id, is_disrupted, calculated_at DESC);
