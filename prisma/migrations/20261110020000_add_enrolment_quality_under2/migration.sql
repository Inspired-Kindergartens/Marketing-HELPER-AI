-- Enrolment Quality: licensed under-2 places per month, and the under-2 part of an operating capacity.
ALTER TABLE "CentreMonthlyRoll" ADD COLUMN IF NOT EXISTS "avgLicenceU2" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CentreOperatingCapacity" ADD COLUMN IF NOT EXISTS "under2Capacity" INTEGER;
