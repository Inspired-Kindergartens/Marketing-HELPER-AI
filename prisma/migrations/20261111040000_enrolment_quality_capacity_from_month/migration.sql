-- Enrolment Quality: every am / pm places entry has a From month again (it
-- applies from that month onwards). Saves stay as history rows, so the old
-- one-per-month unique index is not restored.
UPDATE "CentreOperatingCapacity" SET "effectiveFrom" = to_char("createdAt", 'YYYY-MM') WHERE "effectiveFrom" IS NULL;
ALTER TABLE "CentreOperatingCapacity" ALTER COLUMN "effectiveFrom" SET NOT NULL;
DROP INDEX IF EXISTS "CentreOperatingCapacity_centreKey_createdAt_idx";
CREATE INDEX IF NOT EXISTS "CentreOperatingCapacity_centreKey_effectiveFrom_idx" ON "CentreOperatingCapacity"("centreKey", "effectiveFrom");
