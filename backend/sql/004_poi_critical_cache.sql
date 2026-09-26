-- Cached frontend station-failure index, keyed by a hash of the live network.
CREATE TABLE IF NOT EXISTS poi_critical_cache (
    fingerprint TEXT PRIMARY KEY,
    snapshot JSONB NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
