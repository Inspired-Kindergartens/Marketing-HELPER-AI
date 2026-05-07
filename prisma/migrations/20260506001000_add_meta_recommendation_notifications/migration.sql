CREATE TABLE "MetaRecommendationNotification" (
    "id" SERIAL NOT NULL,
    "notificationId" TEXT NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "centreName" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "openPlaces" INTEGER NOT NULL,
    "actionableWaitlist" INTEGER NOT NULL,
    "waitlistCount" INTEGER NOT NULL,
    "replacementPressure" INTEGER NOT NULL,
    "activeCampaignCount" INTEGER NOT NULL,
    "spend30d" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaRecommendationNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaRecommendationNotification_notificationId_key" ON "MetaRecommendationNotification"("notificationId");
CREATE INDEX "MetaRecommendationNotification_centreKey_lastSeenAt_idx" ON "MetaRecommendationNotification"("centreKey", "lastSeenAt" DESC);
CREATE INDEX "MetaRecommendationNotification_dismissedAt_idx" ON "MetaRecommendationNotification"("dismissedAt");
CREATE INDEX "MetaRecommendationNotification_lastSeenAt_idx" ON "MetaRecommendationNotification"("lastSeenAt" DESC);
