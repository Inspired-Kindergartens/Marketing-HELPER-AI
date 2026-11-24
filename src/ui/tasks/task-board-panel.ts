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
    <article class="task-card flex flex-col gap-6 card card--quiet${task.overdue ? " task-card--overdue" : ""}" data-task-id="${task.id}">
      <a class="task-card__main text-body flex flex-col" href="${href}">
        <span class="task-card__title text-strong font-strong">${escapeHtml(task.title)}</span>
        ${meta.length ? `<span class="task-card__meta text-ghost text-small">${meta.join(" · ")}</span>` : ""}
      </a>
      <div class="task-card__badges flex flex-wrap gap-4">
        ${due ? `<span class="task-card__badge badge${task.overdue ? " task-card__badge--overdue badge--warning" : ""}">${task.overdue ? "Overdue " : ""}${escapeHtml(due)}</span>` : ""}
        ${task.checklistTotal > 0 ? `<span class="task-card__badge badge${overdueChecklistCount > 0 ? " task-card__badge--overdue badge--warning" : ""}"${overdueChecklistCount > 0 ? ` title="${overdueChecklistCount} checklist item${overdueChecklistCount === 1 ? "" : "s"} past deadline"` : ""}>${task.checklistDone}/${task.checklistTotal}</span>` : ""}
        ${task.assigneeName ? `<span class="task-card__badge badge task-card__badge--assignee badge--accent">${escapeHtml(task.assigneeName)}</span>` : ""}
      </div>
      ${nextStatus
        ? `<div class="task-card__actions flex flex-wrap gap-6">
        <button type="button" class="task-card__advance button-sm" data-task-action="advance" data-task-id="${task.id}" data-next-status="${nextStatus}">
          <i class="bi bi-arrow-right-circle ui-icon" aria-hidden="true"></i><span>Move to ${escapeHtml(TASK_STATUS_LABELS[nextStatus])}</span>
        </button>
      </div>`
        : ""}
    </article>
  `;
}

/** How many task cards one board column shows per page. */
export const TASK_BOARD_PAGE_SIZE = 10;

function renderColumn(status: TaskStatus, tasks: TaskView[]): string {
  const columnTasks = tasks.filter((task) => task.status === status);
  const pageCount = Math.ceil(columnTasks.length / TASK_BOARD_PAGE_SIZE);
  // Every card is in the page; the ones past the first page start hidden and
  // the column's Previous/Next buttons swap which ten are shown.
  const cards = columnTasks
    .map((task, index) => {
      const card = renderTaskCard(task);
      return index < TASK_BOARD_PAGE_SIZE ? card : card.replace("<article ", "<article hidden ");
    })
    .join("");
  return `
    <section class="task-board__column flex flex-col" data-status="${status}">
      <header class="task-board__column-header items-center flex justify-between">
        <span class="task-board__column-title text-strong font-strong text-small">${escapeHtml(TASK_STATUS_LABELS[status])}</span>
        <span class="task-board__column-count text-ghost text-small">${columnTasks.length}</span>
      </header>
      <div class="task-board__column-body flex flex-col gap-8">
        ${columnTasks.length ? cards : `<p class="task-board__empty text-empty text-small">No tasks</p>`}
      </div>
      ${pageCount > 1
        ? `<nav class="task-board__pagination comms-pagination items-center flex flex-wrap gap-8 justify-center" aria-label="${escapeHtml(TASK_STATUS_LABELS[status])} task pages" data-task-board-pagination data-page-count="${pageCount}">
        <button type="button" data-task-board-page="prev" disabled>Previous</button>
        <span data-task-board-page-label>Page 1 of ${pageCount}</span>
        <button type="button" data-task-board-page="next">Next</button>
      </nav>`
        : ""}
    </section>
  `;
}

// Pages each column on its own. The page a column is on is remembered for the
// browser tab, because most actions on the board reload the page and would
// otherwise send every column back to page 1.
function renderPaginationScript(): string {
  return `
    <script>
      (function() {
        var pageSize = ${TASK_BOARD_PAGE_SIZE};
        Array.prototype.forEach.call(document.querySelectorAll("[data-task-board-pagination]"), function(nav) {
          var column = nav.closest(".task-board__column");
          if (!column) return;
          var key = "task-board-page-" + column.getAttribute("data-status");
          var pageCount = Number(nav.getAttribute("data-page-count")) || 1;
          var cards = Array.prototype.slice.call(column.querySelectorAll(".task-card"));
          var prev = nav.querySelector('[data-task-board-page="prev"]');
          var next = nav.querySelector('[data-task-board-page="next"]');
          var label = nav.querySelector("[data-task-board-page-label]");
          var page = 1;
          try { page = Number(window.sessionStorage.getItem(key)) || 1; } catch (error) {}
          page = Math.min(Math.max(1, page), pageCount);

          function show() {
            cards.forEach(function(card, index) {
              card.hidden = index < (page - 1) * pageSize || index >= page * pageSize;
            });
            prev.disabled = page <= 1;
            next.disabled = page >= pageCount;
            label.textContent = "Page " + page + " of " + pageCount;
            try { window.sessionStorage.setItem(key, String(page)); } catch (error) {}
          }

          prev.addEventListener("click", function() { if (page > 1) { page -= 1; show(); } });
          next.addEventListener("click", function() { if (page < pageCount) { page += 1; show(); } });
          show();
        });
      })();
    </script>
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
      <form class="task-create flex flex-wrap gap-8 items-center" data-task-create>
        <input type="text" class="task-create__title form-control form-control--sm" name="title" placeholder="Add a task…" maxlength="200" required />
        <span class="date-combo task-create__due">
          <input class="form-control form-control--sm" type="text" name="dueDate" placeholder="YYYY-MM-DD" inputmode="numeric" aria-label="Due date" data-date-text />
          <button type="button" class="date-combo__button" data-open-date-picker title="Choose due date" aria-label="Choose due date"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
          <input type="date" class="date-combo__picker" tabindex="-1" aria-hidden="true" data-date-picker />
        </span>
        <select class="task-create__select form-control form-control--sm" name="projectId" aria-label="Project">
          <option value="">No project</option>
          ${projectOptions}
        </select>
        <select class="task-create__select form-control form-control--sm" name="assigneeId" aria-label="Assignee">
          <option value="">Unassigned</option>
          ${memberOptions}
        </select>
        <button type="submit" class="task-create__submit button-sm"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
      </form>
      <div class="task-board__columns grid gap-12">
        ${TASK_STATUSES.map((status) => renderColumn(status, tasks)).join("")}
      </div>
      ${renderPaginationScript()}
    </div>
  `;
}
