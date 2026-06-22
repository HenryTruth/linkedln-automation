-- Add per-account cap overrides.
-- Empty JSON object = use system defaults.
-- Example: {"connection": 30, "message": 80, "profileView": 150, "searchPage": 20}
ALTER TABLE "Account" ADD COLUMN "maxDailyCaps" JSONB NOT NULL DEFAULT '{}';
