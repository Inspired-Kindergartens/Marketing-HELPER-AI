import type { TaskView } from "../../storage/task-store.js";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "../../storage/task-status.js";
import type { ProjectListItem, ProjectRollup } from "../../storage/project-store.js";
import type { EmailContactSuggestion, MemberView } from "../../storage/member-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(total: number): string {
  if (total < 1024) return `${total} B`;
  const units = ["KB", "MB", "GB"];
  let value = total / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDueDateShort(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export type TaskDetailPanelOptions = {
  task: TaskView | null;
  projects: ProjectListItem[];
  members: MemberView[];
  // Groups for the task's current project (so the group picker is populated).
  projectRollup: ProjectRollup | null;
  // Member + centre contacts used to autocomplete a new "To" address.
  contactSuggestions: EmailContactSuggestion[];
};

// Timestamped progress notes, newest first (the store orders them). Each note
// is editable in place and commits on blur, matching the checklist's pattern.
function renderNotesSection(task: TaskView): string {
  const notes = task.notes
    .map(
      (note) => `
        <li class="task-notes__item" data-note-id="${note.id}">
          <div class="task-notes__meta">
            <span class="task-notes__timestamp">${escapeHtml(formatTimestamp(note.createdAt))}</span>
            ${note.updatedAt !== note.createdAt ? `<span class="task-notes__edited">edited</span>` : ""}
            <button type="button" class="task-notes__remove" data-task-action="note-delete" data-note-id="${note.id}" data-arm-label="Confirm remove" aria-label="Remove note">
              <span>Remove</span>
            </button>
          </div>
          <form class="task-notes__edit" data-note-edit data-note-id="${note.id}">
            <textarea name="body" rows="3" aria-label="Edit note" data-task-autogrow>${escapeHtml(note.body)}</textarea>
          </form>
        </li>`,
    )
    .join("");

  return `
    <section class="task-detail__section task-notes" data-task-notes>
      <h3 class="task-detail__section-title">Notes <span class="task-detail__section-count">${task.notes.length}</span></h3>
      <form class="task-notes__add" data-note-add>
        <textarea name="body" rows="3" placeholder="Add a note…" aria-label="New note" data-task-autogrow data-note-draft>${escapeHtml(task.noteDraft ?? "")}</textarea>
        <div class="task-notes__add-actions">
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add note</span></button>
          <span class="task-notes__draft-status" data-note-draft-status role="status" aria-live="polite">${task.noteDraft ? "Unsaved draft restored" : ""}</span>
        </div>
      </form>
      ${notes ? `<ol class="task-notes__list">${notes}</ol>` : `<p class="task-notes__empty">No notes yet.</p>`}
    </section>
  `;
}

function renderAttachmentSection(task: TaskView): string {
  const attachments = task.attachments
    .map(
      (attachment) => `
        <li class="task-attachments__item" data-attachment-id="${attachment.id}">
          <a class="task-attachments__link" href="/api/tasks/${task.id}/attachments/${attachment.id}/download">
            <i class="bi bi-paperclip ui-icon" aria-hidden="true"></i>
            <span>${escapeHtml(attachment.originalName)}</span>
          </a>
          <span class="task-attachments__meta">${escapeHtml(formatBytes(attachment.sizeBytes))}</span>
          <button type="button" class="task-attachments__remove" data-task-action="attachment-delete" data-attachment-id="${attachment.id}" aria-label="Remove attachment">
            <i class="bi bi-x-lg ui-icon" aria-hidden="true"></i>
          </button>
        </li>`,
    )
    .join("");

  return `
    <section class="task-detail__section task-attachments">
      <h3 class="task-detail__section-title">Attachments <span class="task-detail__section-count">${task.attachments.length}</span></h3>
      ${attachments ? `<ul class="task-attachments__list">${attachments}</ul>` : `<p class="task-attachments__empty">No files attached.</p>`}
      <form class="task-attachments__upload" data-task-attachment-upload enctype="multipart/form-data">
        <input type="file" name="attachment" required />
        <button type="submit"><i class="bi bi-upload ui-icon" aria-hidden="true"></i><span>Attach file</span></button>
      </form>
    </section>
  `;
}

function renderEmailSection(task: TaskView, contactSuggestions: EmailContactSuggestion[]): string {
  // Most-recently-used recipient seeds the placeholder; if the user opens the
  // editor and sends without retyping, this address is used (and persists).
  const lastRecipient = task.emailRecipients[0] ?? null;
  const placeholder = lastRecipient
    ? lastRecipient.name
      ? `${lastRecipient.name} <${lastRecipient.email}>`
      : lastRecipient.email
    : "name@example.com";

  // Quick-select chips: addresses already used on this task.
  const chips = task.emailRecipients
    .map(
      (recipient) => `
        <button type="button" class="task-email__chip" data-email-recipient="${escapeHtml(recipient.email)}" data-email-name="${escapeHtml(recipient.name ?? "")}" title="${escapeHtml(recipient.email)}">
          <i class="bi bi-person ui-icon" aria-hidden="true"></i><span>${escapeHtml(recipient.name ?? recipient.email)}</span>
        </button>`,
    )
    .join("");

  // Datalist of searchable contacts (members + centre list) for new addresses.
  const datalist = contactSuggestions
    .map((contact) => {
      const label = contact.name ? `${contact.name} — ${contact.email}` : contact.email;
      return `<option value="${escapeHtml(contact.email)}" label="${escapeHtml(label)}"></option>`;
    })
    .join("");

  const subject = task.emailSubject ?? "";
  const body = task.emailBody ?? "";

  return `
    <section class="task-detail__section task-email" data-task-email>
      <h3 class="task-detail__section-title">Email</h3>
      <p class="task-email__hint">Compose a message, then open it in your mail app (Outlook). The draft saves itself as you go, so the subject, body, and recipient are remembered for next time.</p>
      ${chips ? `<div class="task-email__chips" role="group" aria-label="Previous recipients">${chips}</div>` : ""}
      <label class="task-field">
        <span class="task-field__label">To</span>
        <input type="text" name="to" list="task-email-contacts" placeholder="${escapeHtml(placeholder)}" data-email-to autocomplete="off" />
        <datalist id="task-email-contacts">${datalist}</datalist>
      </label>
      <label class="task-field">
        <span class="task-field__label">Subject</span>
        <input type="text" name="emailSubject" value="${escapeHtml(subject)}" maxlength="300" data-email-subject />
      </label>
      <label class="task-field">
        <span class="task-field__label">Body</span>
        <textarea name="emailBody" rows="6" placeholder="Write your message…" data-email-body>${escapeHtml(body)}</textarea>
      </label>
      <div class="task-email__actions">
        <button type="button" class="task-email__open" data-task-action="email-open"><i class="bi bi-envelope-arrow-up ui-icon" aria-hidden="true"></i><span>Open in Outlook</span></button>
        <span class="task-email__status" data-email-status role="status" aria-live="polite"></span>
      </div>
    </section>
  `;
}

export function renderTaskDetailPanel(options: TaskDetailPanelOptions): string {
  const { task, projects, members, projectRollup, contactSuggestions } = options;

  if (!task) {
    return `
      <div class="task-detail task-detail--empty">
        <p class="task-detail__empty-text">Select a task from the board to see its details, notes, and checklist.</p>
        <a class="panel-action-link" href="/tasks"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to Tasks</span></a>
      </div>
    `;
  }

  const activeMembers = members.filter((member) => member.active);
  const statusOptions = TASK_STATUSES.map(
    (status) =>
      `<option value="${status}"${status === task.status ? " selected" : ""}>${escapeHtml(TASK_STATUS_LABELS[status])}</option>`,
  ).join("");
  const projectOptions = projects
    .map(
      (project) =>
        `<option value="${project.id}"${project.id === task.projectId ? " selected" : ""}>${escapeHtml(project.name)}</option>`,
    )
    .join("");
  const groupOptions = (projectRollup?.groups ?? [])
    .map(
      (group) =>
        `<option value="${group.id}"${group.id === task.taskGroupId ? " selected" : ""}>${escapeHtml(group.name)}</option>`,
    )
    .join("");
  const memberOptions = activeMembers
    .map(
      (member) =>
        `<option value="${member.id}"${member.id === task.assigneeId ? " selected" : ""}>${escapeHtml(member.name)}</option>`,
    )
    .join("");

  const checklist = task.checklist
    .map(
      (item) => `
        <li class="task-checklist__item${item.done ? " task-checklist__item--done" : ""}${item.overdue ? " task-checklist__item--overdue" : ""}" data-checklist-item="${item.id}">
          <label class="task-checklist__label">
            <input type="checkbox" data-task-action="checklist-toggle" data-item-id="${item.id}"${item.done ? " checked" : ""} />
          </label>
          <form class="task-checklist__edit" data-checklist-edit data-item-id="${item.id}">
            <input type="text" name="label" value="${escapeHtml(item.label)}" maxlength="200" aria-label="Edit checklist item" />
            <span class="date-combo task-checklist__due">
              <input type="text" name="dueDate" value="${toDateInputValue(item.dueDate)}" placeholder="No deadline" inputmode="numeric" aria-label="Checklist item deadline" data-date-text />
              <button type="button" class="date-combo__button" data-open-date-picker title="Choose deadline" aria-label="Choose deadline"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
              <input type="date" class="date-combo__picker" value="${toDateInputValue(item.dueDate)}" tabindex="-1" aria-hidden="true" data-date-picker />
            </span>
          </form>
          <span class="task-checklist__timestamp"${item.dueDate ? ` title="Added ${escapeHtml(formatTimestamp(item.createdAt))}"` : ""}>${item.dueDate ? `${item.overdue ? "Overdue " : "Due "}${escapeHtml(formatDueDateShort(item.dueDate))}` : escapeHtml(formatTimestamp(item.createdAt))}</span>
          <button type="button" class="task-checklist__remove" data-task-action="checklist-delete" data-item-id="${item.id}" aria-label="Remove checklist item"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>
        </li>
      `,
    )
    .join("");

  return `
    <div class="task-detail" data-task-detail data-task-id="${task.id}">
      <form class="task-detail__form" data-task-edit>
        <label class="task-field task-field--block">
          <span class="task-field__label">Title</span>
          <input type="text" name="title" value="${escapeHtml(task.title)}" maxlength="200" required />
        </label>
        <label class="task-field task-field--block">
          <span class="task-field__label">Description</span>
          <textarea name="description" rows="8" placeholder="Describe the task…" data-task-autogrow>${escapeHtml(task.description ?? "")}</textarea>
        </label>
        <div class="task-field-row">
          <label class="task-field">
            <span class="task-field__label">Status</span>
            <select name="status" data-task-action="status">${statusOptions}</select>
          </label>
          <label class="task-field">
            <span class="task-field__label">Due date</span>
            <span class="date-combo">
              <input type="text" name="dueDate" value="${toDateInputValue(task.dueDate)}" placeholder="YYYY-MM-DD" inputmode="numeric" data-date-text />
              <button type="button" class="date-combo__button" data-open-date-picker title="Choose due date" aria-label="Choose due date"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
              <input type="date" class="date-combo__picker" value="${toDateInputValue(task.dueDate)}" tabindex="-1" aria-hidden="true" data-date-picker />
            </span>
          </label>
        </div>
        <div class="task-field-row">
          <label class="task-field">
            <span class="task-field__label">Project</span>
            <select name="projectId">
              <option value="">No project</option>
              ${projectOptions}
            </select>
          </label>
          <label class="task-field">
            <span class="task-field__label">Group</span>
            <select name="taskGroupId"${task.projectId == null ? " disabled" : ""}>
              <option value="">No group</option>
              ${groupOptions}
            </select>
          </label>
          <label class="task-field">
            <span class="task-field__label">Assignee</span>
            <select name="assigneeId">
              <option value="">Unassigned</option>
              ${memberOptions}
            </select>
          </label>
        </div>
      </form>

      <section class="task-detail__section">
        <h3 class="task-detail__section-title">Checklist <span class="task-detail__section-count">${task.checklistDone}/${task.checklistTotal}</span></h3>
        <ul class="task-checklist">${checklist}</ul>
        <form class="task-checklist__add" data-checklist-add>
          <input type="text" name="label" placeholder="Add checklist item…" maxlength="200" />
          <span class="date-combo task-checklist__due">
            <input type="text" name="dueDate" placeholder="Deadline (optional)" inputmode="numeric" aria-label="New checklist item deadline" data-date-text />
            <button type="button" class="date-combo__button" data-open-date-picker title="Choose deadline" aria-label="Choose deadline"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="date-combo__picker" tabindex="-1" aria-hidden="true" data-date-picker />
          </span>
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>
      </section>

      ${renderNotesSection(task)}

      ${renderAttachmentSection(task)}

      ${renderEmailSection(task, contactSuggestions)}
    </div>
  `;
}

// Rendered into the panel header's actions slot so the task's controls sit on
// the same row as the panel title, matching the /jd and /wiki panels.
export function renderTaskDetailActions(task: TaskView | null): string | undefined {
  if (!task) return undefined;
  return `
    <a class="panel-action-link" href="/tasks"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to Tasks</span></a>
    <button type="button" class="panel-action-link" data-task-action="delete" data-task-id="${task.id}"><i class="bi bi-trash ui-icon" aria-hidden="true"></i><span>Delete</span></button>
  `;
}
