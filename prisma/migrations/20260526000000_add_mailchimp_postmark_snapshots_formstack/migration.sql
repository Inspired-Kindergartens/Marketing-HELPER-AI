-- CreateTable
CREATE TABLE "PostmarkOutboundSnapshot" (
    "id" SERIAL NOT NULL,
    "serverToken" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "rangeStartDate" TIMESTAMP(3) NOT NULL,
    "rangeEndDate" TIMESTAMP(3) NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "spamComplained" INTEGER NOT NULL DEFAULT 0,
    "suppressed" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostmarkOutboundSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostmarkOutboundSnapshotByTag" (
    "id" SERIAL NOT NULL,
    "serverToken" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "centreKey" INTEGER,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "rangeStartDate" TIMESTAMP(3) NOT NULL,
    "rangeEndDate" TIMESTAMP(3) NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "spamComplained" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostmarkOutboundSnapshotByTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailchimpCampaign" (
    "id" SERIAL NOT NULL,
    "mailchimpId" TEXT NOT NULL,
    "serverPrefix" TEXT NOT NULL,
    "listId" TEXT,
    "centreKey" INTEGER,
    "subject" TEXT NOT NULL DEFAULT '',
    "previewText" TEXT NOT NULL DEFAULT '',
    "status" TEXT,
    "type" TEXT,
    "archiveUrl" TEXT,
    "sendTime" TIMESTAMP(3),
    "emailsSent" INTEGER NOT NULL DEFAULT 0,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailchimpCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailchimpCampaignReport" (
    "id" SERIAL NOT NULL,
    "mailchimpId" TEXT NOT NULL,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpens" INTEGER NOT NULL DEFAULT 0,
    "openRate" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "clickRate" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unsubscribes" INTEGER NOT NULL DEFAULT 0,
    "bounces" INTEGER NOT NULL DEFAULT 0,
    "abuseReports" INTEGER NOT NULL DEFAULT 0,
    "forwardCount" INTEGER NOT NULL DEFAULT 0,
    "sendTime" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailchimpCampaignReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailchimpListGrowthSnapshot" (
    "id" SERIAL NOT NULL,
    "serverPrefix" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "subscribed" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "cleaned" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailchimpListGrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormstackForm" (
    "id" SERIAL NOT NULL,
    "formstackId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "folder" TEXT,
    "centreKey" INTEGER,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER,
    "lastSubmissionAt" TIMESTAMP(3),
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormstackForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormstackSubmission" (
    "id" SERIAL NOT NULL,
    "formstackId" TEXT NOT NULL,
    "formFormstackId" TEXT NOT NULL,
    "centreKey" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "syncCursor" TEXT,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormstackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostmarkOutboundSnapshot_serverToken_snapshotDate_idx" ON "PostmarkOutboundSnapshot"("serverToken", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "PostmarkOutboundSnapshot_pulledAt_idx" ON "PostmarkOutboundSnapshot"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PostmarkOutboundSnapshot_serverToken_rangeStartDate_rangeEn_key" ON "PostmarkOutboundSnapshot"("serverToken", "rangeStartDate", "rangeEndDate");

-- CreateIndex
CREATE INDEX "PostmarkOutboundSnapshotByTag_serverToken_tag_snapshotDate_idx" ON "PostmarkOutboundSnapshotByTag"("serverToken", "tag", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "PostmarkOutboundSnapshotByTag_centreKey_snapshotDate_idx" ON "PostmarkOutboundSnapshotByTag"("centreKey", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "PostmarkOutboundSnapshotByTag_pulledAt_idx" ON "PostmarkOutboundSnapshotByTag"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PostmarkOutboundSnapshotByTag_serverToken_tag_rangeStartDat_key" ON "PostmarkOutboundSnapshotByTag"("serverToken", "tag", "rangeStartDate", "rangeEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "MailchimpCampaign_mailchimpId_key" ON "MailchimpCampaign"("mailchimpId");

-- CreateIndex
CREATE INDEX "MailchimpCampaign_serverPrefix_sendTime_idx" ON "MailchimpCampaign"("serverPrefix", "sendTime" DESC);

-- CreateIndex
CREATE INDEX "MailchimpCampaign_centreKey_sendTime_idx" ON "MailchimpCampaign"("centreKey", "sendTime" DESC);

-- CreateIndex
CREATE INDEX "MailchimpCampaign_listId_sendTime_idx" ON "MailchimpCampaign"("listId", "sendTime" DESC);

-- CreateIndex
CREATE INDEX "MailchimpCampaign_pulledAt_idx" ON "MailchimpCampaign"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MailchimpCampaignReport_mailchimpId_key" ON "MailchimpCampaignReport"("mailchimpId");

-- CreateIndex
CREATE INDEX "MailchimpCampaignReport_sendTime_idx" ON "MailchimpCampaignReport"("sendTime" DESC);

-- CreateIndex
CREATE INDEX "MailchimpCampaignReport_fetchedAt_idx" ON "MailchimpCampaignReport"("fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "MailchimpListGrowthSnapshot_listId_snapshotDate_idx" ON "MailchimpListGrowthSnapshot"("listId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "MailchimpListGrowthSnapshot_pulledAt_idx" ON "MailchimpListGrowthSnapshot"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MailchimpListGrowthSnapshot_serverPrefix_listId_snapshotDat_key" ON "MailchimpListGrowthSnapshot"("serverPrefix", "listId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "FormstackForm_formstackId_key" ON "FormstackForm"("formstackId");

-- CreateIndex
CREATE INDEX "FormstackForm_centreKey_lastSubmissionAt_idx" ON "FormstackForm"("centreKey", "lastSubmissionAt" DESC);

-- CreateIndex
CREATE INDEX "FormstackForm_folder_idx" ON "FormstackForm"("folder");

-- CreateIndex
CREATE INDEX "FormstackForm_pulledAt_idx" ON "FormstackForm"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FormstackSubmission_formstackId_key" ON "FormstackSubmission"("formstackId");

-- CreateIndex
CREATE INDEX "FormstackSubmission_formFormstackId_submittedAt_idx" ON "FormstackSubmission"("formFormstackId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "FormstackSubmission_centreKey_submittedAt_idx" ON "FormstackSubmission"("centreKey", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "FormstackSubmission_submittedAt_idx" ON "FormstackSubmission"("submittedAt" DESC);

-- CreateIndex
CREATE INDEX "FormstackSubmission_pulledAt_idx" ON "FormstackSubmission"("pulledAt" DESC);

-- AddForeignKey
ALTER TABLE "PostmarkOutboundSnapshotByTag" ADD CONSTRAINT "PostmarkOutboundSnapshotByTag_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailchimpCampaign" ADD CONSTRAINT "MailchimpCampaign_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailchimpCampaignReport" ADD CONSTRAINT "MailchimpCampaignReport_mailchimpId_fkey" FOREIGN KEY ("mailchimpId") REFERENCES "MailchimpCampaign"("mailchimpId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormstackForm" ADD CONSTRAINT "FormstackForm_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormstackSubmission" ADD CONSTRAINT "FormstackSubmission_formFormstackId_fkey" FOREIGN KEY ("formFormstackId") REFERENCES "FormstackForm"("formstackId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormstackSubmission" ADD CONSTRAINT "FormstackSubmission_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "GaDaily_property_range_idx" RENAME TO "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rang_idx";

-- RenameIndex
ALTER INDEX "GaDaily_property_range_key" RENAME TO "GoogleAnalyticsDailySnapshot_propertyId_rangeStartDate_rang_key";

-- RenameIndex
ALTER INDEX "GaPage_property_range_idx" RENAME TO "GoogleAnalyticsPageSnapshot_propertyId_rangeStartDate_range_idx";

-- RenameIndex
ALTER INDEX "PostmarkMessageEvent_serverToken_messageId_eventType_occurredAt" RENAME TO "PostmarkMessageEvent_serverToken_messageId_eventType_occurr_key";
