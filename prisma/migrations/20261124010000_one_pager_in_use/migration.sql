-- Info Sheets: the "In use" tick on a kindergarten. One that is not in use
-- is not asked for a new team photo.
ALTER TABLE "OnePager" ADD COLUMN "inUse" BOOLEAN NOT NULL DEFAULT true;
