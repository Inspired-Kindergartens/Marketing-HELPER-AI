-- DropIndex
DROP INDEX "AnalyticsSnapshotRun_runDate_key";

-- DropIndex
DROP INDEX "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rang_key";

-- DropIndex
DROP INDEX "MailchimpCampaignReport_mailchimpId_key";

-- DropIndex
DROP INDEX "MailchimpListGrowthSnapshot_serverPrefix_listId_snapshotDat_key";

-- DropIndex
DROP INDEX "PostmarkOutboundSnapshot_serverToken_rangeStartDate_rangeEn_key";

-- DropIndex
DROP INDEX "PostmarkOutboundSnapshotByTag_serverToken_tag_rangeStartDat_key";

-- CreateTable
CREATE TABLE "ExternalApiCapture" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "httpStatus" INTEGER,
    "outcome" TEXT NOT NULL,
    "requestContext" JSONB,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalApiCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalApiCapture_source_receivedAt_idx" ON "ExternalApiCapture"("source", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "ExternalApiCapture_operation_receivedAt_idx" ON "ExternalApiCapture"("operation", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "ExternalApiCapture_outcome_receivedAt_idx" ON "ExternalApiCapture"("outcome", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "MailchimpCampaignReport_mailchimpId_fetchedAt_idx" ON "MailchimpCampaignReport"("mailchimpId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "MailchimpListGrowthSnapshot_serverPrefix_listId_snapshotDat_idx" ON "MailchimpListGrowthSnapshot"("serverPrefix", "listId", "snapshotDate" DESC);
