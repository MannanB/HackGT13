ALTER TABLE residential_zones
    ADD COLUMN IF NOT EXISTS median_income INTEGER;

ALTER TABLE residential_zones
    DROP CONSTRAINT IF EXISTS residential_zones_income_nonnegative;

ALTER TABLE residential_zones
    ADD CONSTRAINT residential_zones_income_nonnegative
    CHECK (median_income IS NULL OR median_income >= 0);
