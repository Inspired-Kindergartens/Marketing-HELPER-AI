-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "emailBody" TEXT,
ADD COLUMN     "emailSubject" TEXT;

-- CreateTable
CREATE TABLE "TaskEmailRecipient" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEmailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEmailRecipient_taskId_lastUsedAt_idx" ON "TaskEmailRecipient"("taskId", "lastUsedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TaskEmailRecipient_taskId_email_key" ON "TaskEmailRecipient"("taskId", "email");

-- AddForeignKey
ALTER TABLE "TaskEmailRecipient" ADD CONSTRAINT "TaskEmailRecipient_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
