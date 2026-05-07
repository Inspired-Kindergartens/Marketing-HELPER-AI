-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" SERIAL NOT NULL,
    "metaAdAccountId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "accountStatus" INTEGER,
    "currency" TEXT,
    "timezoneName" TEXT,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" SERIAL NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "metaAdAccountId" TEXT NOT NULL,
    "centreKey" INTEGER,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "objective" TEXT,
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSet" (
    "id" SERIAL NOT NULL,
    "metaAdSetId" TEXT NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "metaAdAccountId" TEXT NOT NULL,
    "centreKey" INTEGER,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "optimizationGoal" TEXT,
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id" SERIAL NOT NULL,
    "metaAdId" TEXT NOT NULL,
    "metaAdSetId" TEXT,
    "metaCampaignId" TEXT,
    "metaAdAccountId" TEXT NOT NULL,
    "centreKey" INTEGER,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInsightSnapshot" (
    "id" SERIAL NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "insightDate" TIMESTAMP(3) NOT NULL,
    "level" TEXT NOT NULL,
    "metaAdAccountId" TEXT NOT NULL,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaAdId" TEXT,
    "centreKey" INTEGER,
    "campaignName" TEXT,
    "adSetName" TEXT,
    "adName" TEXT,
    "impressions" INTEGER,
    "reach" INTEGER,
    "clicks" INTEGER,
    "spend" DECIMAL(18,6),
    "cpc" DECIMAL(18,6),
    "cpm" DECIMAL(18,6),
    "ctr" DECIMAL(18,6),
    "frequency" DECIMAL(18,6),
    "rawActions" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaInsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_metaAdAccountId_key" ON "MetaAdAccount"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_metaAdAccountId_idx" ON "MetaAdAccount"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_pulledAt_idx" ON "MetaAdAccount"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_metaCampaignId_key" ON "MetaCampaign"("metaCampaignId");

-- CreateIndex
CREATE INDEX "MetaCampaign_metaAdAccountId_idx" ON "MetaCampaign"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaCampaign_metaCampaignId_idx" ON "MetaCampaign"("metaCampaignId");

-- CreateIndex
CREATE INDEX "MetaCampaign_centreKey_idx" ON "MetaCampaign"("centreKey");

-- CreateIndex
CREATE INDEX "MetaCampaign_pulledAt_idx" ON "MetaCampaign"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSet_metaAdSetId_key" ON "MetaAdSet"("metaAdSetId");

-- CreateIndex
CREATE INDEX "MetaAdSet_metaAdAccountId_idx" ON "MetaAdSet"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaAdSet_metaCampaignId_idx" ON "MetaAdSet"("metaCampaignId");

-- CreateIndex
CREATE INDEX "MetaAdSet_metaAdSetId_idx" ON "MetaAdSet"("metaAdSetId");

-- CreateIndex
CREATE INDEX "MetaAdSet_centreKey_idx" ON "MetaAdSet"("centreKey");

-- CreateIndex
CREATE INDEX "MetaAdSet_pulledAt_idx" ON "MetaAdSet"("pulledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAd_metaAdId_key" ON "MetaAd"("metaAdId");

-- CreateIndex
CREATE INDEX "MetaAd_metaAdAccountId_idx" ON "MetaAd"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaAd_metaCampaignId_idx" ON "MetaAd"("metaCampaignId");

-- CreateIndex
CREATE INDEX "MetaAd_metaAdSetId_idx" ON "MetaAd"("metaAdSetId");

-- CreateIndex
CREATE INDEX "MetaAd_metaAdId_idx" ON "MetaAd"("metaAdId");

-- CreateIndex
CREATE INDEX "MetaAd_centreKey_idx" ON "MetaAd"("centreKey");

-- CreateIndex
CREATE INDEX "MetaAd_pulledAt_idx" ON "MetaAd"("pulledAt" DESC);

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_metaAdAccountId_idx" ON "MetaInsightSnapshot"("metaAdAccountId");

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_metaCampaignId_idx" ON "MetaInsightSnapshot"("metaCampaignId");

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_metaAdSetId_idx" ON "MetaInsightSnapshot"("metaAdSetId");

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_metaAdId_idx" ON "MetaInsightSnapshot"("metaAdId");

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_centreKey_idx" ON "MetaInsightSnapshot"("centreKey");

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_pulledAt_idx" ON "MetaInsightSnapshot"("pulledAt" DESC);

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_insightDate_idx" ON "MetaInsightSnapshot"("insightDate" DESC);

-- CreateIndex
CREATE INDEX "MetaInsightSnapshot_level_insightDate_idx" ON "MetaInsightSnapshot"("level", "insightDate" DESC);

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_metaAdAccountId_fkey" FOREIGN KEY ("metaAdAccountId") REFERENCES "MetaAdAccount"("metaAdAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_metaAdAccountId_fkey" FOREIGN KEY ("metaAdAccountId") REFERENCES "MetaAdAccount"("metaAdAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_metaCampaignId_fkey" FOREIGN KEY ("metaCampaignId") REFERENCES "MetaCampaign"("metaCampaignId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_metaAdAccountId_fkey" FOREIGN KEY ("metaAdAccountId") REFERENCES "MetaAdAccount"("metaAdAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_metaCampaignId_fkey" FOREIGN KEY ("metaCampaignId") REFERENCES "MetaCampaign"("metaCampaignId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_metaAdSetId_fkey" FOREIGN KEY ("metaAdSetId") REFERENCES "MetaAdSet"("metaAdSetId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightSnapshot" ADD CONSTRAINT "MetaInsightSnapshot_metaAdAccountId_fkey" FOREIGN KEY ("metaAdAccountId") REFERENCES "MetaAdAccount"("metaAdAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightSnapshot" ADD CONSTRAINT "MetaInsightSnapshot_metaCampaignId_fkey" FOREIGN KEY ("metaCampaignId") REFERENCES "MetaCampaign"("metaCampaignId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightSnapshot" ADD CONSTRAINT "MetaInsightSnapshot_metaAdSetId_fkey" FOREIGN KEY ("metaAdSetId") REFERENCES "MetaAdSet"("metaAdSetId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightSnapshot" ADD CONSTRAINT "MetaInsightSnapshot_metaAdId_fkey" FOREIGN KEY ("metaAdId") REFERENCES "MetaAd"("metaAdId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightSnapshot" ADD CONSTRAINT "MetaInsightSnapshot_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;
