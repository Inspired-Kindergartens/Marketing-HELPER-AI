CREATE TABLE "MetaRecommendationNote" (
    "id" SERIAL NOT NULL,
    "notificationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaRecommendationNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaRecommendationNote_notificationId_submittedAt_idx" ON "MetaRecommendationNote"("notificationId", "submittedAt" DESC);
CREATE INDEX "MetaRecommendationNote_deletedAt_idx" ON "MetaRecommendationNote"("deletedAt");
