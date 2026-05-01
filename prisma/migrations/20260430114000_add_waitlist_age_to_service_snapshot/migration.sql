ALTER TABLE "ServiceAnalyticsSnapshot"
ADD COLUMN "waitlistOldestEntryDays" INTEGER,
ADD COLUMN "waitlistAverageEntryDays" DECIMAL(8,4);
