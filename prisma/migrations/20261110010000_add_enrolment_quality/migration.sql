-- Enrolment Quality: monthly roll summaries per centre and user-set operating capacities.
CREATE TABLE IF NOT EXISTS "CentreMonthlyRoll" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "openDays" INTEGER NOT NULL,
    "avgPlacements" DOUBLE PRECISION NOT NULL,
    "avgAm" DOUBLE PRECISION NOT NULL,
    "avgPm" DOUBLE PRECISION NOT NULL,
    "avgLicence" DOUBLE PRECISION NOT NULL,
    "contactStaff" INTEGER,
    "sessional" BOOLEAN NOT NULL DEFAULT false,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentreMonthlyRoll_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CentreMonthlyRoll_centreKey_month_key" ON "CentreMonthlyRoll"("centreKey", "month");
CREATE INDEX IF NOT EXISTS "CentreMonthlyRoll_month_idx" ON "CentreMonthlyRoll"("month");

ALTER TABLE "CentreMonthlyRoll" ADD CONSTRAINT "CentreMonthlyRoll_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CentreOperatingCapacity" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreOperatingCapacity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CentreOperatingCapacity_centreKey_effectiveFrom_key" ON "CentreOperatingCapacity"("centreKey", "effectiveFrom");

ALTER TABLE "CentreOperatingCapacity" ADD CONSTRAINT "CentreOperatingCapacity_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;
