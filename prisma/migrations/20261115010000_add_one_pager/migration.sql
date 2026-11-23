-- One Pagers: the one-page PDF for each kindergarten. Shared text in
-- OnePagerTemplate (a single row), each kindergarten's own text in OnePager,
-- its photos and saved versions as files under uploads/one-pager.
CREATE TABLE "OnePagerTemplate" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tagline" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "costText" TEXT NOT NULL,
    "teachersText" TEXT NOT NULL,
    "enrolText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnePagerTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnePager" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "callout" TEXT NOT NULL DEFAULT '',
    "aboutUs" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "costOverride" TEXT NOT NULL DEFAULT '',
    "teachersOverride" TEXT NOT NULL DEFAULT '',
    "enrolOverride" TEXT NOT NULL DEFAULT '',
    "teamCaption" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnePager_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnePagerImage" (
    "id" SERIAL NOT NULL,
    "onePagerId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnePagerImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnePagerVersion" (
    "id" SERIAL NOT NULL,
    "onePagerId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnePagerVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnePager_centreKey_key" ON "OnePager"("centreKey");

CREATE UNIQUE INDEX "OnePagerImage_storedName_key" ON "OnePagerImage"("storedName");

CREATE UNIQUE INDEX "OnePagerImage_onePagerId_slot_key" ON "OnePagerImage"("onePagerId", "slot");

CREATE UNIQUE INDEX "OnePagerVersion_storedName_key" ON "OnePagerVersion"("storedName");

CREATE UNIQUE INDEX "OnePagerVersion_onePagerId_version_key" ON "OnePagerVersion"("onePagerId", "version");

ALTER TABLE "OnePager" ADD CONSTRAINT "OnePager_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnePagerImage" ADD CONSTRAINT "OnePagerImage_onePagerId_fkey" FOREIGN KEY ("onePagerId") REFERENCES "OnePager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnePagerVersion" ADD CONSTRAINT "OnePagerVersion_onePagerId_fkey" FOREIGN KEY ("onePagerId") REFERENCES "OnePager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
