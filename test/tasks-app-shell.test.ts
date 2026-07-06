import assert from "node:assert/strict";
import test from "node:test";

import { renderTaskDetailPanel } from "../src/ui/tasks/task-detail-panel.js";
import type { TaskView } from "../src/storage/task-store.js";

function buildTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 2,
    title: "Review campaign brief",
    description: null,
    status: "todo",
    dueDate: null,
    overdue: false,
    estimatedMinutes: null,
    loggedMinutes: 0,
    timerRunning: false,
    timerStartedAt: null,
    projectId: null,
    projectName: null,
    taskGroupId: null,
    taskGroupName: null,
    centreKey: null,
    centreName: null,
    assigneeId: null,
    assigneeName: null,
    position: 0,
    completedAt: null,
    checklistTotal: 0,
    checklistDone: 0,
    checklist: [],
    emailSubject: null,
    emailBody: null,
    emailRecipients: [],
    attachments: [],
    ...overrides,
  };
}

test("task detail panel renders file attachment controls and rows", () => {
  const html = renderTaskDetailPanel({
    task: buildTask({
      attachments: [{
        id: 7,
        originalName: "campaign-brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        uploadedAt: "2026-06-19T00:00:00.000Z",
      }],
    }),
    projects: [],
    members: [],
    projectRollup: null,
    contactSuggestions: [],
    demo: false,
  });

  assert.match(html, /Attachments <span class="task-detail__section-count">1<\/span>/);
  assert.match(html, /data-task-attachment-upload/);
  assert.match(html, /type="file" name="attachment"/);
  assert.match(html, /href="\/api\/tasks\/2\/attachments\/7\/download"/);
  assert.match(html, /data-task-action="attachment-delete" data-attachment-id="7"/);
  assert.match(html, /campaign-brief\.pdf/);
});
