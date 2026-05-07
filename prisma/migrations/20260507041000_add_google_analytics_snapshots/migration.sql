-- CreateTable
CREATE TABLE "GoogleAnalyticsDailySnapshot" (
    "id" SERIAL NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "activeUsers" INTEGER,
    "sessions" INTEGER,
    "engagedSessions" INTEGER,
    "screenPageViews" INTEGER,
    "conversions" DECIMAL(18,6),
    "totalRevenue" DECIMAL(18,6),
    "engagementRate" DECIMAL(18,6),
    "averageSessionDuration" DECIMAL(18,6),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAnalyticsDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAnalyticsDailySnapshot_propertyId_snapshotDate_key" ON "GoogleAnalyticsDailySnapshot"("propertyId", "snapshotDate");

-- CreateIndex
CREATE INDEX "GoogleAnalyticsDailySnapshot_propertyId_snapshotDate_idx" ON "GoogleAnalyticsDailySnapshot"("propertyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "GoogleAnalyticsDailySnapshot_pulledAt_idx" ON "GoogleAnalyticsDailySnapshot"("pulledAt" DESC);
