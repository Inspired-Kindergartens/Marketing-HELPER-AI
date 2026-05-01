-- CreateTable
CREATE TABLE "CentreReference" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "openStatus" TEXT NOT NULL,
    "licenseNumber" INTEGER,
    "regionName" TEXT,
    "areaName" TEXT,
    "subgroupName" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshotRun" (
    "id" SERIAL NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAnalyticsSnapshot" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "serviceName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "enrolledCount" INTEGER NOT NULL,
    "licensedCapacity" INTEGER NOT NULL,
    "enrolmentRatio" DECIMAL(8,4) NOT NULL,
    "waitlistCount" INTEGER NOT NULL,
    "knownLeavingCount" INTEGER NOT NULL,
    "agedOutCount" INTEGER NOT NULL,
    "approachingFiveCount" INTEGER NOT NULL,
    "replacementPressure" INTEGER NOT NULL,
    "waitlistCoverRatio" DECIMAL(8,4) NOT NULL,
    "urgencyScore" DECIMAL(8,4) NOT NULL,
    "urgencyBand" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentreReference_centreKey_key" ON "CentreReference"("centreKey");

-- CreateIndex
CREATE INDEX "CentreReference_ignored_openStatus_name_idx" ON "CentreReference"("ignored", "openStatus", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshotRun_runDate_key" ON "AnalyticsSnapshotRun"("runDate");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshotRun_runDate_idx" ON "AnalyticsSnapshotRun"("runDate" DESC);

-- CreateIndex
CREATE INDEX "ServiceAnalyticsSnapshot_runId_urgencyScore_idx" ON "ServiceAnalyticsSnapshot"("runId", "urgencyScore" DESC);

-- CreateIndex
CREATE INDEX "ServiceAnalyticsSnapshot_centreKey_date_idx" ON "ServiceAnalyticsSnapshot"("centreKey", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAnalyticsSnapshot_runId_centreKey_key" ON "ServiceAnalyticsSnapshot"("runId", "centreKey");

-- AddForeignKey
ALTER TABLE "ServiceAnalyticsSnapshot" ADD CONSTRAINT "ServiceAnalyticsSnapshot_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAnalyticsSnapshot" ADD CONSTRAINT "ServiceAnalyticsSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalyticsSnapshotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
