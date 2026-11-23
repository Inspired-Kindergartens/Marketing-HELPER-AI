-- Info Sheets: the task raised to get a new team photo after a staff change,
-- and when staff changes were last acted on.
ALTER TABLE "OnePager" ADD COLUMN "staffPhotoTaskId" INTEGER;
ALTER TABLE "OnePager" ADD COLUMN "staffPhotoCheckedAt" TIMESTAMP(3);
