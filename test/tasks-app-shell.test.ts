import assert from "node:assert/strict";
import test from "node:test";

import {
  renderTasksAppShell,
  resolveTasksFocusPanelId,
  VALID_TASKS_PANEL_IDS,
} from "../src/ui/tasks-app-shell.js";
import { renderTaskDetailPanel } from "../src/ui/tasks/task-detail-panel.js";
import { renderProjectsPanel } from "../src/ui/tasks/projects-panel.js";
import type { TaskView } from "../src/storage/task-store.js";
import type { ProjectRollup } from "../src/storage/project-store.js";

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
  });

  assert.match(html, /Attachments <span class="task-detail__section-count">1<\/span>/);
  assert.match(html, /data-task-attachment-upload/);
  assert.match(html, /type="file" name="attachment"/);
  assert.match(html, /href="\/api\/tasks\/2\/attachments\/7\/download"/);
  assert.match(html, /data-task-action="attachment-delete" data-attachment-id="7"/);
  assert.match(html, /campaign-brief\.pdf/);
});

function baseShellOptions() {
  return {
    tasks: [buildTask()],
    projects: [],
    members: { members: [], activeCount: 0 },
    selectedTask: null,
    selectedProject: null,
    selectedTaskProject: null,
    contactSuggestions: [],
  };
}

test("resolveTasksFocusPanelId accepts only known panel ids and otherwise returns null", () => {
  assert.equal(resolveTasksFocusPanelId("task-board"), "task-board");
  assert.equal(resolveTasksFocusPanelId("projects"), "projects");
  assert.equal(resolveTasksFocusPanelId("members"), "members");
  assert.equal(resolveTasksFocusPanelId("chat"), "chat");
  assert.equal(resolveTasksFocusPanelId("not-a-panel"), null);
  assert.equal(resolveTasksFocusPanelId(undefined), null);
  assert.equal(resolveTasksFocusPanelId(null), null);
});

test("VALID_TASKS_PANEL_IDS matches the shell's own panel definitions", () => {
  assert.deepEqual(
    [...VALID_TASKS_PANEL_IDS].sort(),
    ["chat", "members", "projects", "task-board", "task-detail"].sort(),
  );
});

test("tasks shell falls back to the full accordion layout for an unknown focus panel id", () => {
  const html = renderTasksAppShell({ ...baseShellOptions(), focusPanelId: "not-a-panel" });

  assert.match(html, /id="panel-task-board"/);
  assert.match(html, /id="panel-task-detail"/);
  assert.match(html, /id="panel-projects"/);
  assert.match(html, /id="panel-members"/);
  assert.match(html, /id="panel-chat"/);
  assert.doesNotMatch(html, /app-shell--focus/);
});

test("tasks shell focus mode renders only the focused panel", () => {
  const html = renderTasksAppShell({ ...baseShellOptions(), focusPanelId: "task-board" });

  assert.match(html, /app-shell--focus/);
  assert.match(html, /id="panel-task-board"/);
  assert.doesNotMatch(html, /id="panel-task-detail"/);
  assert.doesNotMatch(html, /id="panel-projects"/);
  assert.doesNotMatch(html, /id="panel-members"/);
  assert.doesNotMatch(html, /id="panel-chat"/);
});

test("tasks shell nav rail marks Tasks as the current page", () => {
  const html = renderTasksAppShell(baseShellOptions());

  assert.match(html, /href="\/"[^>]*aria-label="Back to landing"/);
  assert.match(html, /href="\/tasks"[^>]*aria-current="page"/);
});

// --- Gantt bar positioning -------------------------------------------------

function buildRollup(overrides: Partial<ProjectRollup> = {}): ProjectRollup {
  return {
    id: 1,
    name: "Winter enrolment push",
    description: null,
    status: "active",
    startDate: null,
    targetDate: null,
    centreKey: null,
    centreName: null,
    members: [],
    groups: [],
    ungrouped: [],
    taskCount: 0,
    doneCount: 0,
    rangeStart: null,
    rangeEnd: null,
    ...overrides,
  };
}

test("gantt positions a scheduled task's bar proportionally between rangeStart and rangeEnd", () => {
  const scheduled = buildTask({
    id: 10,
    title: "Send enrolment reminder",
    dueDate: "2026-07-11T00:00:00.000Z", // 25% through a 16-day range
  });
  const rollup = buildRollup({
    groups: [
      { id: 1, name: "Comms", position: 0, tasks: [scheduled], statusCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 } },
    ],
    rangeStart: "2026-07-07T00:00:00.000Z",
    rangeEnd: "2026-07-23T00:00:00.000Z",
  });

  const html = renderProjectsPanel({ projects: [], selectedProject: rollup, members: [] });

  assert.match(html, /class="gantt__bar gantt__bar--todo"\s*\n\s*style="left: 25\.0%;"/);
  assert.match(html, /Send enrolment reminder/);
  assert.doesNotMatch(html, /gantt--empty/);
});

test("gantt puts a task with no due date in the unscheduled lane instead of positioning it", () => {
  const unscheduled = buildTask({ id: 11, title: "Draft social copy", dueDate: null });
  const rollup = buildRollup({
    groups: [
      { id: 1, name: "Comms", position: 0, tasks: [unscheduled], statusCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 } },
    ],
    rangeStart: "2026-07-07T00:00:00.000Z",
    rangeEnd: "2026-07-23T00:00:00.000Z",
  });

  const html = renderProjectsPanel({ projects: [], selectedProject: rollup, members: [] });

  assert.match(html, /gantt__bar gantt__bar--unscheduled" title="Draft social copy \(unscheduled\)"/);
  assert.doesNotMatch(html, /gantt__bar--unscheduled"[^>]*style="left:/);
});

test("gantt falls back to a status breakdown when the project has no usable date range", () => {
  const task = buildTask({ id: 12, title: "Untitled task", dueDate: null });
  const rollup = buildRollup({
    groups: [
      { id: 1, name: "Comms", position: 0, tasks: [task], statusCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 } },
    ],
    rangeStart: null,
    rangeEnd: null,
  });

  const html = renderProjectsPanel({ projects: [], selectedProject: rollup, members: [] });

  assert.match(html, /gantt--empty/);
  assert.match(html, /No scheduled dates yet/);
  assert.match(html, /gantt__breakdown-item gantt__bar--todo">To do: 1/);
});
