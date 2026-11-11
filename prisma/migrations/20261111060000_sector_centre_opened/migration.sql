-- Sector Insight: when each centre opened, as near as ERO's pages tell.
ALTER TABLE "SectorCentre" ADD COLUMN "openedYear" INTEGER;
ALTER TABLE "SectorCentre" ADD COLUMN "openedMonth" INTEGER;
ALTER TABLE "SectorCentre" ADD COLUMN "openedBasis" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SectorCentre" ADD COLUMN "openedEvidence" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SectorCentre" ADD COLUMN "eroCheckedAt" TIMESTAMP(3);
