-- Meta advert reviews: each centre advert run's roll and waitlist before/after.
CREATE TABLE IF NOT EXISTS "MetaAdvertReview" (
    "id" SERIAL NOT NULL,
    "reviewId" TEXT NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "adSetNames" TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(18,6),
    "clicks" INTEGER,
    "rollBeforeMonth" TEXT,
    "rollBefore" DOUBLE PRECISION,
    "rollAfterMonth" TEXT,
    "rollAfter" DOUBLE PRECISION,
    "networkChange" DOUBLE PRECISION,
    "waitlistBeforeAt" TIMESTAMP(3),
    "waitlistBefore" INTEGER,
    "waitlistAfterAt" TIMESTAMP(3),
    "waitlistAfter" INTEGER,
    "verdict" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdvertReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaAdvertReview_reviewId_key" ON "MetaAdvertReview"("reviewId");
CREATE INDEX IF NOT EXISTS "MetaAdvertReview_centreKey_endDate_idx" ON "MetaAdvertReview"("centreKey", "endDate");
