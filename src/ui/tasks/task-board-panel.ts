import type { TaskView } from "../../storage/task-store.js";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "../../storage/task-status.js";
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

function formatMinutes(total: number): string {
  if (total <= 0) return "0m";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function renderTaskCard(task: TaskView): string {
  const due = formatDueDate(task.dueDate);
  const timeLabel = task.estimatedMinutes
    ? `${formatMinutes(task.loggedMinutes)} / ${formatMinutes(task.estimatedMinutes)}`
    : formatMinutes(task.loggedMinutes);
  const meta: string[] = [];
  if (task.projectName) meta.push(escapeHtml(task.projectName));
  if (task.centreName) meta.push(escapeHtml(task.centreName));

  const href = `/tasks?panel=task-detail&task=${task.id}`;

  return `
    <article class="task-card${task.overdue ? " task-card--overdue" : ""}" data-task-id="${task.id}">
      <a class="task-card__main" href="${href}">
        <span class="task-card__title">${escapeHtml(task.title)}</span>
        ${meta.length ? `<span class="task-card__meta">${meta.join(" · ")}</span>` : ""}
      </a>
      <div class="task-card__badges">
        ${due ? `<span class="task-card__badge${task.overdue ? " task-card__badge--overdue" : ""}">${task.overdue ? "Overdue " : ""}${escapeHtml(due)}</span>` : ""}
        <span class="task-card__badge">${escapeHtml(timeLabel)}</span>
        ${task.checklistTotal > 0 ? `<span class="task-card__badge">${task.checklistDone}/${task.checklistTotal}</span>` : ""}
        ${task.assigneeName ? `<span class="task-card__badge task-card__badge--assignee">${escapeHtml(task.assigneeName)}</span>` : ""}
      </div>
      <div class="task-card__actions">
        ${task.timerRunning
          ? `<button type="button" class="task-card__timer task-card__timer--stop" data-task-action="timer-stop" data-task-id="${task.id}"><i class="bi bi-stop-circle ui-icon" aria-hidden="true"></i><span>Stop</span></button>`
          : `<button type="button" class="task-card__timer" data-task-action="timer-start" data-task-id="${task.id}"><i class="bi bi-play-circle ui-icon" aria-hidden="true"></i><span>Start</span></button>`}
      </div>
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
        <input type="date" class="task-create__due" name="dueDate" aria-label="Due date" />
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
