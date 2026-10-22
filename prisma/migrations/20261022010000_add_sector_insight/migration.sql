-- Sector Insight: competitor / ECE centres, their promotions, and the crawl runs that refresh them.
CREATE TABLE IF NOT EXISTS "SectorCentre" (
    "id" SERIAL NOT NULL,
    "eceId" INTEGER,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT '',
    "serviceType" TEXT NOT NULL DEFAULT '',
    "authority" TEXT NOT NULL DEFAULT '',
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT NOT NULL DEFAULT '',
    "suburb" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "promotionUrl" TEXT NOT NULL DEFAULT '',
    "licensedPlaces" INTEGER,
    "under2Places" INTEGER,
    "roll" INTEGER,
    "rollDate" TIMESTAMP(3),
    "twentyHoursEce" BOOLEAN,
    "meals" TEXT NOT NULL DEFAULT '',
    "providesMeals" BOOLEAN,
    "transport" TEXT NOT NULL DEFAULT '',
    "providesTransport" BOOLEAN,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "inDirectory" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SectorCentre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SectorCentre_eceId_key" ON "SectorCentre"("eceId");
CREATE INDEX IF NOT EXISTS "SectorCentre_city_idx" ON "SectorCentre"("city");
CREATE INDEX IF NOT EXISTS "SectorCentre_operator_idx" ON "SectorCentre"("operator");

CREATE TABLE IF NOT EXISTS "SectorPromotion" (
    "id" SERIAL NOT NULL,
    "centreId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT 'crawl',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SectorPromotion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SectorPromotion_centreId_fkey" FOREIGN KEY ("centreId")
        REFERENCES "SectorCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SectorPromotion_centreId_text_key" ON "SectorPromotion"("centreId", "text");
CREATE INDEX IF NOT EXISTS "SectorPromotion_active_idx" ON "SectorPromotion"("active");

CREATE TABLE IF NOT EXISTS "SectorCrawlRun" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "centresAdded" INTEGER NOT NULL DEFAULT 0,
    "centresUpdated" INTEGER NOT NULL DEFAULT 0,
    "centresClosed" INTEGER NOT NULL DEFAULT 0,
    "sitesChecked" INTEGER NOT NULL DEFAULT 0,
    "sitesFailed" INTEGER NOT NULL DEFAULT 0,
    "promotionsAdded" INTEGER NOT NULL DEFAULT 0,
    "promotionsEnded" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SectorCrawlRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SectorCrawlRun_startedAt_idx" ON "SectorCrawlRun"("startedAt");
