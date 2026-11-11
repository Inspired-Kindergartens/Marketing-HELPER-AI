-- Enrolment Quality: am / pm places are a user-only history (no "From month").
-- Each save is a new row; the newest applies to every month. effectiveFrom is
-- kept, nullable, so earlier entries are not lost.
DROP INDEX IF EXISTS "CentreOperatingCapacity_centreKey_effectiveFrom_key";
ALTER TABLE "CentreOperatingCapacity" ALTER COLUMN "effectiveFrom" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "CentreOperatingCapacity_centreKey_createdAt_idx" ON "CentreOperatingCapacity"("centreKey", "createdAt");
