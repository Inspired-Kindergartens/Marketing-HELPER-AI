ALTER TABLE "ServiceAnalyticsSnapshot"
ADD COLUMN "bookedAverageDailyCount" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "bookedUtilisationRatio" DECIMAL(8,4) NOT NULL DEFAULT 0;
