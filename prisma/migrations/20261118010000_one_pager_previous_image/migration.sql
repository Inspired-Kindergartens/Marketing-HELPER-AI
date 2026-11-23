-- Info Sheets: the photo a slot held before its last replacement, kept so
-- Revert can put it back (the user, 2026-11-18). At most one per slot.
CREATE TABLE "OnePagerPreviousImage" (
    "id" SERIAL NOT NULL,
    "onePagerId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnePagerPreviousImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnePagerPreviousImage_storedName_key" ON "OnePagerPreviousImage"("storedName");

CREATE UNIQUE INDEX "OnePagerPreviousImage_onePagerId_slot_key" ON "OnePagerPreviousImage"("onePagerId", "slot");

ALTER TABLE "OnePagerPreviousImage" ADD CONSTRAINT "OnePagerPreviousImage_onePagerId_fkey" FOREIGN KEY ("onePagerId") REFERENCES "OnePager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
