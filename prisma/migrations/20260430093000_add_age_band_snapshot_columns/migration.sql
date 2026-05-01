ALTER TABLE "ServiceAnalyticsSnapshot"
ADD COLUMN "enrolledUnder2Count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "enrolledOver2Count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "licensedUnder2Capacity" INTEGER,
ADD COLUMN "licensedOver2Capacity" INTEGER;
