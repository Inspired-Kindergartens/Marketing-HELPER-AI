import type { TaskView } from "../../storage/task-store.js";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_NEXT_STATUS,
  type TaskStatus,
} from "../../storage/task-status.js";
import type { ProjectListItem } from "../../storage/project-store.js";
import type { MemberView } from "../../storage/member-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function renderTaskCard(task: TaskView): string {
  const due = formatDueDate(task.dueDate);
  // One-click advance to the next phase; a completed task has none.
  const nextStatus = TASK_NEXT_STATUS[task.status];
  // A checklist deadline is only useful if it is visible from the board, so the
  // progress badge flags when any item is past its own deadline.
  const overdueChecklistCount = task.checklist.filter((item) => item.overdue).length;
  const meta: string[] = [];
  if (task.projectName) meta.push(escapeHtml(task.projectName));
  if (task.centreName) meta.push(escapeHtml(task.centreName));

  // No panel= here: that would switch the page into single-panel focus mode and
  // hide the board. Just ?task= keeps the board and opens Task Detail beside it.
  const href = `/tasks?task=${task.id}`;

  return `
    <article class="task-card${task.overdue ? " task-card--overdue" : ""}" data-task-id="${task.id}">
      <a class="task-card__main" href="${href}">
        <span class="task-card__title">${escapeHtml(task.title)}</span>
        ${meta.length ? `<span class="task-card__meta">${meta.join(" · ")}</span>` : ""}
      </a>
      <div class="task-card__badges">
        ${due ? `<span class="task-card__badge${task.overdue ? " task-card__badge--overdue" : ""}">${task.overdue ? "Overdue " : ""}${escapeHtml(due)}</span>` : ""}
        ${task.checklistTotal > 0 ? `<span class="task-card__badge${overdueChecklistCount > 0 ? " task-card__badge--overdue" : ""}"${overdueChecklistCount > 0 ? ` title="${overdueChecklistCount} checklist item${overdueChecklistCount === 1 ? "" : "s"} past deadline"` : ""}>${task.checklistDone}/${task.checklistTotal}</span>` : ""}
        ${task.assigneeName ? `<span class="task-card__badge task-card__badge--assignee">${escapeHtml(task.assigneeName)}</span>` : ""}
      </div>
      ${nextStatus
        ? `<div class="task-card__actions">
        <button type="button" class="task-card__advance" data-task-action="advance" data-task-id="${task.id}" data-next-status="${nextStatus}">
          <i class="bi bi-arrow-right-circle ui-icon" aria-hidden="true"></i><span>Move to ${escapeHtml(TASK_STATUS_LABELS[nextStatus])}</span>
        </button>
      </div>`
        : ""}
    </article>
  `;
}

function renderColumn(status: TaskStatus, tasks: TaskView[]): string {
  const columnTasks = tasks.filter((task) => task.status === status);
  return `
    <section class="task-board__column" data-status="${status}">
      <header class="task-board__column-header">
        <span class="task-board__column-title">${escapeHtml(TASK_STATUS_LABELS[status])}</span>
        <span class="task-board__column-count">${columnTasks.length}</span>
      </header>
      <div class="task-board__column-body">
        ${columnTasks.length
          ? columnTasks.map((task) => renderTaskCard(task)).join("")
          : `<p class="task-board__empty">No tasks</p>`}
      </div>
    </section>
  `;
}

export type TaskBoardPanelOptions = {
  tasks: TaskView[];
  projects: ProjectListItem[];
  members: MemberView[];
};

export function renderTaskBoardPanel(options: TaskBoardPanelOptions): string {
  const { tasks, projects, members } = options;
  const activeMembers = members.filter((member) => member.active);

  const projectOptions = projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
    .join("");
  const memberOptions = activeMembers
    .map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`)
    .join("");

  return `
    <div class="task-board" data-task-board>
      <form class="task-create" data-task-create>
        <input type="text" class="task-create__title" name="title" placeholder="Add a task…" maxlength="200" required />
        <span class="date-combo task-create__due">
          <input type="text" name="dueDate" placeholder="YYYY-MM-DD" inputmode="numeric" aria-label="Due date" data-date-text />
          <button type="button" class="date-combo__button" data-open-date-picker title="Choose due date" aria-label="Choose due date"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
          <input type="date" class="date-combo__picker" tabindex="-1" aria-hidden="true" data-date-picker />
        </span>
        <select class="task-create__select" name="projectId" aria-label="Project">
          <option value="">No project</option>
          ${projectOptions}
        </select>
        <select class="task-create__select" name="assigneeId" aria-label="Assignee">
          <option value="">Unassigned</option>
          ${memberOptions}
        </select>
        <button type="submit" class="task-create__submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
      </form>
      <div class="task-board__columns">
        ${TASK_STATUSES.map((status) => renderColumn(status, tasks)).join("")}
      </div>
    </div>
  `;
}
