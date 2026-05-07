-- CreateTable
CREATE TABLE "GoogleAnalyticsPageSnapshot" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageTitle" TEXT,
    "activeUsers" INTEGER,
    "sessions" INTEGER,
    "screenPageViews" INTEGER,
    "engagementRate" DECIMAL(18,6),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAnalyticsPageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAnalyticsPageSnapshot_snapshotId_pagePath_key" ON "GoogleAnalyticsPageSnapshot"("snapshotId", "pagePath");

-- CreateIndex
CREATE INDEX "GoogleAnalyticsPageSnapshot_propertyId_snapshotDate_idx" ON "GoogleAnalyticsPageSnapshot"("propertyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "GoogleAnalyticsPageSnapshot_snapshotId_screenPageViews_idx" ON "GoogleAnalyticsPageSnapshot"("snapshotId", "screenPageViews" DESC);

-- AddForeignKey
ALTER TABLE "GoogleAnalyticsPageSnapshot" ADD CONSTRAINT "GoogleAnalyticsPageSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GoogleAnalyticsDailySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
