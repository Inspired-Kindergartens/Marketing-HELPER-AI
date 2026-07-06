-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_storedName_key" ON "TaskAttachment"("storedName");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_uploadedAt_idx" ON "TaskAttachment"("taskId", "uploadedAt" DESC);

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
