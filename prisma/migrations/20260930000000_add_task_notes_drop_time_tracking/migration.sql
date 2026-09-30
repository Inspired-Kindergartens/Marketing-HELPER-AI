-- Task notes replace time tracking on the Task panel.
--
-- Notes are timestamped, append-only progress updates shown newest-first, so
-- the history is the record rather than a single editable field.
CREATE TABLE "TaskNote" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskNote_taskId_createdAt_idx" ON "TaskNote"("taskId", "createdAt" DESC);

ALTER TABLE "TaskNote" ADD CONSTRAINT "TaskNote_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Time tracking is removed: the timer, the logged/estimated minute totals and
-- the TimeEntry audit trail all go. This drops recorded time permanently.
DROP TABLE "TimeEntry";

ALTER TABLE "Task" DROP COLUMN "estimatedMinutes";
ALTER TABLE "Task" DROP COLUMN "loggedMinutes";
ALTER TABLE "Task" DROP COLUMN "timerStartedAt";
