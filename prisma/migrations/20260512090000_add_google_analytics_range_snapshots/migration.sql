ALTER TABLE "GoogleAnalyticsDailySnapshot"
ADD COLUMN IF NOT EXISTS "rangeStartDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rangeEndDate" TIMESTAMP(3);

UPDATE "GoogleAnalyticsDailySnapshot"
SET
  "rangeStartDate" = ("snapshotDate" - INTERVAL '30 days'),
  "rangeEndDate" = "snapshotDate"
WHERE "rangeStartDate" IS NULL OR "rangeEndDate" IS NULL;

ALTER TABLE "GoogleAnalyticsDailySnapshot"
ALTER COLUMN "rangeStartDate" SET NOT NULL,
ALTER COLUMN "rangeEndDate" SET NOT NULL;

ALTER TABLE "GoogleAnalyticsPageSnapshot"
ADD COLUMN IF NOT EXISTS "rangeStartDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rangeEndDate" TIMESTAMP(3);

UPDATE "GoogleAnalyticsPageSnapshot" page
SET
  "rangeStartDate" = snapshot."rangeStartDate",
  "rangeEndDate" = snapshot."rangeEndDate"
FROM "GoogleAnalyticsDailySnapshot" snapshot
WHERE page."snapshotId" = snapshot."id"
  AND (page."rangeStartDate" IS NULL OR page."rangeEndDate" IS NULL);

ALTER TABLE "GoogleAnalyticsPageSnapshot"
ALTER COLUMN "rangeStartDate" SET NOT NULL,
ALTER COLUMN "rangeEndDate" SET NOT NULL;

DROP INDEX IF EXISTS "GoogleAnalyticsDailySnapshot_propertyId_snapshotDate_key";
DROP INDEX IF EXISTS "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rangeEnd";
DROP INDEX IF EXISTS "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rangeEndDate_key";
DROP INDEX IF EXISTS "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rangeEndDate_idx";
DROP INDEX IF EXISTS "GoogleAnalyticsPageSnapshot_propertyId_rangeStartDate_rangeEndDate_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "GaDaily_property_range_key"
ON "GoogleAnalyticsDailySnapshot"("propertyId", "rangeStartDate", "rangeEndDate");

CREATE INDEX IF NOT EXISTS "GaDaily_property_range_idx"
ON "GoogleAnalyticsDailySnapshot"("propertyId", "rangeStartDate", "rangeEndDate");

CREATE INDEX IF NOT EXISTS "GaPage_property_range_idx"
ON "GoogleAnalyticsPageSnapshot"("propertyId", "rangeStartDate", "rangeEndDate");
