-- CreateTable
CREATE TABLE "ManualCentreCapacity" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "licensedCapacity" INTEGER NOT NULL,
    "maxU2" INTEGER,
    "maxO2" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualCentreCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualCentreCapacity_centreKey_key" ON "ManualCentreCapacity"("centreKey");

-- AddForeignKey
ALTER TABLE "ManualCentreCapacity" ADD CONSTRAINT "ManualCentreCapacity_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;
