-- The cloud badge ("Extended hours available!") is gone from the info sheet
-- template: only Avenues used it (the user, 2026-11-17).
ALTER TABLE "OnePager" DROP COLUMN IF EXISTS "callout";
