CREATE TABLE "MetaEmailContent" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "headingText" TEXT NOT NULL DEFAULT '',
    "primaryText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaEmailContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaEmailContent_centreKey_key" ON "MetaEmailContent"("centreKey");
CREATE INDEX "MetaEmailContent_updatedAt_idx" ON "MetaEmailContent"("updatedAt" DESC);

ALTER TABLE "MetaEmailContent" ADD CONSTRAINT "MetaEmailContent_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;
