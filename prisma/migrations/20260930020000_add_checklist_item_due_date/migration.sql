-- Optional per-item deadline on a checklist item, independent of the parent
-- task's due date, so a single task can track several dated sub-steps.
ALTER TABLE "ChecklistItem" ADD COLUMN "dueDate" TIMESTAMP(3);
