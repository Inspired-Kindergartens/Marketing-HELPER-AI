import type { ProjectListItem, ProjectRollup, ProjectGroupView } from "../../storage/project-store.js";
import type { MemberView } from "../../storage/member-store.js";
import type { TaskView } from "../../storage/task-store.js";
import { TASK_STATUS_LABELS, type TaskStatus } from "../../storage/task-status.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function renderProjectListItem(project: ProjectListItem, selectedId: number | null, demo: boolean): string {
  const target = formatDate(project.targetDate);
  const href = `/tasks?panel=projects&project=${project.id}${demo ? "&demo=1" : ""}`;
  return `
    <a class="project-list__item${project.id === selectedId ? " project-list__item--active" : ""}" href="${href}">
      <span class="project-list__name">${escapeHtml(project.name)}</span>
      <span class="project-list__meta">
        <span class="project-list__status project-list__status--${escapeHtml(project.status)}">${escapeHtml(PROJECT_STATUS_LABELS[project.status] ?? project.status)}</span>
        <span>${project.doneCount}/${project.taskCount} done</span>
        ${target ? `<span>${escapeHtml(target)}</span>` : ""}
      </span>
    </a>
  `;
}

// Inline CSS/SVG-free timeline: each scheduled task is a horizontal bar
// positioned across the project's date range by its due date, grouped by
// TaskGroup rows and coloured by status. Tasks without a due date fall into an
// "Unscheduled" lane. Falls back to a status breakdown when no dates exist.
function renderGantt(rollup: ProjectRollup): string {
  const rangeStart = rollup.rangeStart ? new Date(rollup.rangeStart).getTime() : null;
  const rangeEnd = rollup.rangeEnd ? new Date(rollup.rangeEnd).getTime() : null;
  const hasRange = rangeStart != null && rangeEnd != null && rangeEnd > rangeStart;

  const lanes: { name: string; tasks: TaskView[] }[] = [
    ...rollup.groups.map((group) => ({ name: group.name, tasks: group.tasks })),
    ...(rollup.ungrouped.length ? [{ name: "Ungrouped", tasks: rollup.ungrouped }] : []),
  ];

  if (!hasRange) {
    return `
      <div class="gantt gantt--empty">
        <p class="gantt__fallback">No scheduled dates yet. Add due dates to tasks (or a project start/target) to see the timeline.</p>
        ${renderStatusBreakdown(rollup.groups)}
      </div>
    `;
  }

  const span = (rangeEnd as number) - (rangeStart as number);
  const startLabel = formatDate(rollup.rangeStart);
  const endLabel = formatDate(rollup.rangeEnd);

  const laneRows = lanes
    .map((lane) => {
      const bars = lane.tasks
        .map((task) => {
          if (!task.dueDate) {
            return `<span class="gantt__bar gantt__bar--unscheduled" title="${escapeHtml(task.title)} (unscheduled)">${escapeHtml(task.title)}</span>`;
          }
          const due = new Date(task.dueDate).getTime();
          const left = Math.max(0, Math.min(100, ((due - (rangeStart as number)) / span) * 100));
          return `
            <span
              class="gantt__bar gantt__bar--${escapeHtml(task.status)}"
              style="left: ${left.toFixed(1)}%;"
              title="${escapeHtml(task.title)} — due ${escapeHtml(formatDate(task.dueDate) ?? "")}"
            >${escapeHtml(task.title)}</span>
          `;
        })
        .join("");
      return `
        <div class="gantt__row">
          <span class="gantt__lane-label">${escapeHtml(lane.name)}</span>
          <div class="gantt__track">${bars || `<span class="gantt__lane-empty">No tasks</span>`}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="gantt">
      <div class="gantt__axis">
        <span>${escapeHtml(startLabel ?? "")}</span>
        <span>${escapeHtml(endLabel ?? "")}</span>
      </div>
      ${laneRows || `<p class="gantt__fallback">No tasks in this project yet.</p>`}
    </div>
  `;
}

function renderStatusBreakdown(groups: ProjectGroupView[]): string {
  const totals: Record<TaskStatus, number> = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const group of groups) {
    for (const status of Object.keys(totals) as TaskStatus[]) {
      totals[status] += group.statusCounts[status];
    }
  }
  const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
  if (total === 0) return "";
  return `
    <div class="gantt__breakdown">
      ${(Object.keys(totals) as TaskStatus[])
        .filter((status) => totals[status] > 0)
        .map(
          (status) =>
            `<span class="gantt__breakdown-item gantt__bar--${status}">${escapeHtml(TASK_STATUS_LABELS[status])}: ${totals[status]}</span>`,
        )
        .join("")}
    </div>
  `;
}

function renderGroup(group: ProjectGroupView, demo: boolean): string {
  const tasks = group.tasks
    .map(
      (task) => `
        <li class="project-group__task project-group__task--${escapeHtml(task.status)}">
          <a href="/tasks?panel=task-detail&task=${task.id}${demo ? "&demo=1" : ""}">${escapeHtml(task.title)}</a>
          <span class="project-group__task-status">${escapeHtml(TASK_STATUS_LABELS[task.status])}</span>
        </li>
      `,
    )
    .join("");
  return `
    <section class="project-group">
      <h4 class="project-group__name">${escapeHtml(group.name)} <span class="project-group__count">${group.tasks.length}</span></h4>
      <ul class="project-group__tasks">${tasks || `<li class="project-group__empty">No tasks</li>`}</ul>
    </section>
  `;
}

function renderProjectDetail(rollup: ProjectRollup, members: MemberView[], demo: boolean): string {
  const assignableMembers = members.filter(
    (member) => member.active && !rollup.members.some((pm) => pm.memberId === member.id),
  );
  const memberRows = rollup.members
    .map(
      (member) => `
        <li class="project-member">
          <span class="project-member__name">${escapeHtml(member.name)}${member.projectRole ? ` <span class="project-member__role">${escapeHtml(member.projectRole)}</span>` : ""}</span>
          <button type="button" class="project-member__remove" data-project-action="member-remove" data-member-id="${member.memberId}" aria-label="Remove member"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>
        </li>
      `,
    )
    .join("");
  const groups = [
    ...rollup.groups,
    ...(rollup.ungrouped.length
      ? [
          {
            id: 0,
            name: "Ungrouped",
            position: 9999,
            tasks: rollup.ungrouped,
            statusCounts: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
          } as ProjectGroupView,
        ]
      : []),
  ];

  return `
    <div class="project-detail" data-project-detail data-project-id="${rollup.id}"${demo ? ` data-demo="1"` : ""}>
      <header class="project-detail__header">
        <h3 class="project-detail__name">${escapeHtml(rollup.name)}</h3>
        <span class="project-detail__status project-list__status--${escapeHtml(rollup.status)}">${escapeHtml(PROJECT_STATUS_LABELS[rollup.status] ?? rollup.status)}</span>
        <button type="button" class="project-detail__delete" data-project-action="delete"><i class="bi bi-trash ui-icon" aria-hidden="true"></i><span>Delete</span></button>
      </header>
      ${rollup.description ? `<p class="project-detail__description">${escapeHtml(rollup.description)}</p>` : ""}
      <p class="project-detail__summary">${rollup.doneCount}/${rollup.taskCount} tasks done${rollup.centreName ? ` · ${escapeHtml(rollup.centreName)}` : ""}</p>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title">Timeline</h4>
        ${renderGantt(rollup)}
      </section>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title">Members</h4>
        <ul class="project-members">${memberRows || `<li class="project-member__empty">No members yet</li>`}</ul>
        ${assignableMembers.length
          ? `
            <form class="project-detail__add-member" data-project-add-member>
              <select name="memberId" aria-label="Member to add">
                ${assignableMembers.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("")}
              </select>
              <input type="text" name="projectRole" placeholder="Role (optional)" maxlength="100" />
              <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add member</span></button>
            </form>
          `
          : `<p class="project-detail__hint">All active members are already on this project (or none exist yet — add them in the Members panel).</p>`}
      </section>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title">Groups &amp; tasks</h4>
        <div class="project-groups">${groups.map((group) => renderGroup(group, demo)).join("")}</div>
        <form class="project-detail__add-group" data-project-add-group>
          <input type="text" name="name" placeholder="New group name…" maxlength="100" />
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add group</span></button>
        </form>
      </section>
    </div>
  `;
}

export type ProjectsPanelOptions = {
  projects: ProjectListItem[];
  selectedProject: ProjectRollup | null;
  members: MemberView[];
  demo: boolean;
};

export function renderProjectsPanel(options: ProjectsPanelOptions): string {
  const { projects, selectedProject, members, demo } = options;
  const selectedId = selectedProject?.id ?? null;

  return `
    <div class="projects-panel" data-projects-panel${demo ? ` data-demo="1"` : ""}>
      <div class="projects-panel__layout">
        <aside class="projects-panel__list">
          <form class="project-create" data-project-create>
            <input type="text" name="name" placeholder="New project…" maxlength="120" required />
            <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
          </form>
          <div class="project-list">
            ${projects.length
              ? projects.map((project) => renderProjectListItem(project, selectedId, demo)).join("")
              : `<p class="project-list__empty">No projects yet.</p>`}
          </div>
        </aside>
        <div class="projects-panel__detail">
          ${selectedProject
            ? renderProjectDetail(selectedProject, members, demo)
            : `<p class="projects-panel__placeholder">Select a project to see its consolidated tasks, members, and timeline.</p>`}
        </div>
      </div>
    </div>
  `;
}
