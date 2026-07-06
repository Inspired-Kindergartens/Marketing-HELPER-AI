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

function formatMinutes(total: number): string {
  if (total <= 0) return "0m";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
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
  demo: boolean;
};

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
      <p class="task-email__hint">Compose a message, then open it in your mail app (Outlook). The subject, body, and recipient are remembered for next time.</p>
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
        <button type="button" class="task-email__save" data-task-action="email-save"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save draft</span></button>
      </div>
    </section>
  `;
}

export function renderTaskDetailPanel(options: TaskDetailPanelOptions): string {
  const { task, projects, members, projectRollup, contactSuggestions, demo } = options;

  if (!task) {
    return `
      <div class="task-detail task-detail--empty">
        <p class="task-detail__empty-text">Select a task from the board to see its details, checklist, and time log.</p>
        <a class="task-detail__back" href="/tasks?panel=task-board${demo ? "&demo=1" : ""}"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to board</span></a>
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

  const timeLabel = task.estimatedMinutes
    ? `${formatMinutes(task.loggedMinutes)} logged of ${formatMinutes(task.estimatedMinutes)} estimated`
    : `${formatMinutes(task.loggedMinutes)} logged`;

  const checklist = task.checklist
    .map(
      (item) => `
        <li class="task-checklist__item${item.done ? " task-checklist__item--done" : ""}" data-checklist-item="${item.id}">
          <label class="task-checklist__label">
            <input type="checkbox" data-task-action="checklist-toggle" data-item-id="${item.id}"${item.done ? " checked" : ""} />
            <span>${escapeHtml(item.label)}</span>
          </label>
          <button type="button" class="task-checklist__remove" data-task-action="checklist-delete" data-item-id="${item.id}" aria-label="Remove checklist item"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>
        </li>
      `,
    )
    .join("");

  return `
    <div class="task-detail" data-task-detail data-task-id="${task.id}"${demo ? ` data-demo="1"` : ""}>
      <div class="task-detail__toolbar">
        <a class="task-detail__back" href="/tasks?panel=task-board${demo ? "&demo=1" : ""}"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Board</span></a>
        <button type="button" class="task-detail__delete" data-task-action="delete"><i class="bi bi-trash ui-icon" aria-hidden="true"></i><span>Delete</span></button>
      </div>

      <form class="task-detail__form" data-task-edit>
        <label class="task-field">
          <span class="task-field__label">Title</span>
          <input type="text" name="title" value="${escapeHtml(task.title)}" maxlength="200" required />
        </label>
        <label class="task-field">
          <span class="task-field__label">Description</span>
          <textarea name="description" rows="3" placeholder="Optional notes…">${escapeHtml(task.description ?? "")}</textarea>
        </label>
        <div class="task-field-row">
          <label class="task-field">
            <span class="task-field__label">Status</span>
            <select name="status" data-task-action="status">${statusOptions}</select>
          </label>
          <label class="task-field">
            <span class="task-field__label">Due date</span>
            <input type="date" name="dueDate" value="${toDateInputValue(task.dueDate)}" />
          </label>
          <label class="task-field">
            <span class="task-field__label">Estimate (min)</span>
            <input type="number" name="estimatedMinutes" min="0" step="5" value="${task.estimatedMinutes ?? ""}" />
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
        <button type="submit" class="task-detail__save"><i class="bi bi-check-lg ui-icon" aria-hidden="true"></i><span>Save changes</span></button>
      </form>

      <section class="task-detail__section">
        <h3 class="task-detail__section-title">Time tracking</h3>
        <p class="task-detail__time">${escapeHtml(timeLabel)}</p>
        <div class="task-detail__time-actions">
          ${task.timerRunning
            ? `<button type="button" class="task-detail__timer task-detail__timer--stop" data-task-action="timer-stop"><i class="bi bi-stop-circle ui-icon" aria-hidden="true"></i><span>Stop timer</span></button>`
            : `<button type="button" class="task-detail__timer" data-task-action="timer-start"><i class="bi bi-play-circle ui-icon" aria-hidden="true"></i><span>Start timer</span></button>`}
          <form class="task-detail__log" data-task-log>
            <input type="number" name="minutes" min="1" step="5" placeholder="Log min" aria-label="Minutes to log" />
            <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Log</span></button>
          </form>
        </div>
      </section>

      <section class="task-detail__section">
        <h3 class="task-detail__section-title">Checklist <span class="task-detail__section-count">${task.checklistDone}/${task.checklistTotal}</span></h3>
        <ul class="task-checklist">${checklist}</ul>
        <form class="task-checklist__add" data-checklist-add>
          <input type="text" name="label" placeholder="Add checklist item…" maxlength="200" />
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>
      </section>

      ${renderAttachmentSection(task)}

      ${renderEmailSection(task, contactSuggestions)}
    </div>
  `;
}
