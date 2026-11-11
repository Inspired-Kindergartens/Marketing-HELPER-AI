-- Enrolment Quality: operating capacity entered as morning and afternoon places.
-- capacity stays the busier of the two; older entries keep am/pm empty.
ALTER TABLE "CentreOperatingCapacity" ADD COLUMN IF NOT EXISTS "amCapacity" INTEGER;
ALTER TABLE "CentreOperatingCapacity" ADD COLUMN IF NOT EXISTS "pmCapacity" INTEGER;
