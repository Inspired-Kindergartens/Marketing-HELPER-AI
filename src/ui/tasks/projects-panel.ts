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

function renderProjectListItem(project: ProjectListItem, selectedId: number | null): string {
  const target = formatDate(project.targetDate);
  const href = `/tasks?panel=projects&project=${project.id}`;
  return `
    <a class="project-list__item text-body flex flex-col gap-4${project.id === selectedId ? " project-list__item--active" : ""}" href="${href}">
      <span class="project-list__name text-strong font-strong">${escapeHtml(project.name)}</span>
      <span class="project-list__meta flex flex-wrap gap-8 text-ghost text-small">
        <span class="project-list__status text-small project-list__status--${escapeHtml(project.status)}">${escapeHtml(PROJECT_STATUS_LABELS[project.status] ?? project.status)}</span>
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
      <div class="gantt flex flex-col gap-6 gantt--empty">
        <p class="gantt__fallback text-empty text-small">No scheduled dates yet. Add due dates to tasks (or a project start/target) to see the timeline.</p>
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
            return `<span class="gantt__bar nowrap text-small gantt__bar--unscheduled" title="${escapeHtml(task.title)} (unscheduled)">${escapeHtml(task.title)}</span>`;
          }
          const due = new Date(task.dueDate).getTime();
          const left = Math.max(0, Math.min(100, ((due - (rangeStart as number)) / span) * 100));
          return `
            <span
              class="gantt__bar nowrap text-small gantt__bar--${escapeHtml(task.status)}"
              data-position="${left.toFixed(1)}"
              title="${escapeHtml(task.title)} — due ${escapeHtml(formatDate(task.dueDate) ?? "")}"
            >${escapeHtml(task.title)}</span>
          `;
        })
        .join("");
      return `
        <div class="gantt__row items-center grid gap-8">
          <span class="gantt__lane-label text-ghost text-small">${escapeHtml(lane.name)}</span>
          <div class="gantt__track">${bars || `<span class="gantt__lane-empty text-empty text-small">No tasks</span>`}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="gantt flex flex-col gap-6">
      <div class="gantt__axis flex justify-between text-ghost text-small">
        <span>${escapeHtml(startLabel ?? "")}</span>
        <span>${escapeHtml(endLabel ?? "")}</span>
      </div>
      ${laneRows || `<p class="gantt__fallback text-empty text-small">No tasks in this project yet.</p>`}
    </div>
  `;
}

function renderStatusBreakdown(groups: ProjectGroupView[]): string {
  const totals: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0 };
  for (const group of groups) {
    for (const status of Object.keys(totals) as TaskStatus[]) {
      totals[status] += group.statusCounts[status];
    }
  }
  const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
  if (total === 0) return "";
  return `
    <div class="gantt__breakdown flex flex-wrap gap-6">
      ${(Object.keys(totals) as TaskStatus[])
        .filter((status) => totals[status] > 0)
        .map(
          (status) =>
            `<span class="gantt__breakdown-item text-small gantt__bar--${status}">${escapeHtml(TASK_STATUS_LABELS[status])}: ${totals[status]}</span>`,
        )
        .join("")}
    </div>
  `;
}

function renderGroup(group: ProjectGroupView): string {
  const tasks = group.tasks
    .map(
      (task) => `
        <li class="project-group__task items-center flex justify-between text-small project-group__task--${escapeHtml(task.status)}">
          <a href="/tasks?task=${task.id}">${escapeHtml(task.title)}</a>
          <span class="project-group__task-status text-ghost">${escapeHtml(TASK_STATUS_LABELS[task.status])}</span>
        </li>
      `,
    )
    .join("");
  return `
    <section class="project-group">
      <h4 class="project-group__name text-strong text-small">${escapeHtml(group.name)} <span class="project-group__count text-ghost">${group.tasks.length}</span></h4>
      <ul class="project-group__tasks flex flex-col gap-4">${tasks || `<li class="project-group__empty text-empty text-small">No tasks</li>`}</ul>
    </section>
  `;
}

function renderProjectDetail(rollup: ProjectRollup, members: MemberView[]): string {
  const assignableMembers = members.filter(
    (member) => member.active && !rollup.members.some((pm) => pm.memberId === member.id),
  );
  const memberRows = rollup.members
    .map(
      (member) => `
        <li class="project-member items-center flex justify-between text-small text-body">
          <span class="project-member__name">${escapeHtml(member.name)}${member.projectRole ? ` <span class="project-member__role text-ghost">${escapeHtml(member.projectRole)}</span>` : ""}</span>
          <button type="button" class="project-member__remove button-remove" data-project-action="member-remove" data-member-id="${member.memberId}" aria-label="Remove member"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>
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
            statusCounts: { todo: 0, in_progress: 0, done: 0 },
          } as ProjectGroupView,
        ]
      : []),
  ];

  return `
    <div class="project-detail" data-project-detail data-project-id="${rollup.id}">
      <header class="project-detail__header items-center flex gap-10">
        <h3 class="project-detail__name text-strong">${escapeHtml(rollup.name)}</h3>
        <span class="project-detail__status text-small project-list__status--${escapeHtml(rollup.status)}">${escapeHtml(PROJECT_STATUS_LABELS[rollup.status] ?? rollup.status)}</span>
        <button type="button" class="project-detail__delete button-sm" data-project-action="delete"><i class="bi bi-trash ui-icon" aria-hidden="true"></i><span>Delete</span></button>
      </header>
      ${rollup.description ? `<p class="project-detail__description text-ghost text-small">${escapeHtml(rollup.description)}</p>` : ""}
      <p class="project-detail__summary text-ghost text-small">${rollup.doneCount}/${rollup.taskCount} tasks done${rollup.centreName ? ` · ${escapeHtml(rollup.centreName)}` : ""}</p>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title subheading">Timeline</h4>
        ${renderGantt(rollup)}
      </section>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title subheading">Members</h4>
        <ul class="project-members flex flex-col gap-4">${memberRows || `<li class="project-member__empty text-empty text-small">No members yet</li>`}</ul>
        ${assignableMembers.length
          ? `
            <form class="project-detail__add-member flex flex-wrap gap-8 items-center" data-project-add-member>
              <select class="form-control form-control--sm" name="memberId" aria-label="Member to add">
                ${assignableMembers.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("")}
              </select>
              <input class="form-control form-control--sm" type="text" name="projectRole" placeholder="Role (optional)" maxlength="100" />
              <button class="button-sm" type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add member</span></button>
            </form>
          `
          : `<p class="project-detail__hint text-ghost text-small">All active members are already on this project (or none exist yet — add them in the Members panel).</p>`}
      </section>

      <section class="project-detail__section">
        <h4 class="project-detail__section-title subheading">Groups &amp; tasks</h4>
        <div class="project-groups flex flex-col gap-12">${groups.map((group) => renderGroup(group)).join("")}</div>
        <form class="project-detail__add-group flex flex-wrap gap-8 items-center" data-project-add-group>
          <input class="form-control form-control--sm" type="text" name="name" placeholder="New group name…" maxlength="100" />
          <button class="button-sm" type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add group</span></button>
        </form>
      </section>
    </div>
  `;
}

export type ProjectsPanelOptions = {
  projects: ProjectListItem[];
  selectedProject: ProjectRollup | null;
  members: MemberView[];
};

export function renderProjectsPanel(options: ProjectsPanelOptions): string {
  const { projects, selectedProject, members } = options;
  const selectedId = selectedProject?.id ?? null;

  return `
    <div class="projects-panel" data-projects-panel>
      <div class="projects-panel__layout grid gap-16">
        <aside class="projects-panel__list">
          <form class="project-create flex flex-wrap gap-8 items-center" data-project-create>
            <input class="form-control form-control--sm" type="text" name="name" placeholder="New project…" maxlength="120" required />
            <button class="button-sm" type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
          </form>
          <div class="project-list flex flex-col gap-6">
            ${projects.length
              ? projects.map((project) => renderProjectListItem(project, selectedId)).join("")
              : `<p class="project-list__empty text-empty text-small">No projects yet.</p>`}
          </div>
        </aside>
        <div class="projects-panel__detail">
          ${selectedProject
            ? renderProjectDetail(selectedProject, members)
            : `<p class="projects-panel__placeholder text-empty text-small">Select a project to see its consolidated tasks, members, and timeline.</p>`}
        </div>
      </div>
    </div>
  `;
}
