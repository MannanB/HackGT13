ALTER TABLE points_of_interest
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS source_id TEXT,
    ADD COLUMN IF NOT EXISTS jobs_count INTEGER,
    ADD COLUMN IF NOT EXISTS enrollment INTEGER;

ALTER TABLE points_of_interest
    DROP CONSTRAINT IF EXISTS pois_jobs_nonnegative;
ALTER TABLE points_of_interest
    ADD CONSTRAINT pois_jobs_nonnegative
    CHECK (jobs_count IS NULL OR jobs_count >= 0);

ALTER TABLE points_of_interest
    DROP CONSTRAINT IF EXISTS pois_enrollment_nonnegative;
ALTER TABLE points_of_interest
    ADD CONSTRAINT pois_enrollment_nonnegative
    CHECK (enrollment IS NULL OR enrollment >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS pois_source_record_idx
    ON points_of_interest (source, source_id)
    WHERE source IS NOT NULL AND source_id IS NOT NULL;
