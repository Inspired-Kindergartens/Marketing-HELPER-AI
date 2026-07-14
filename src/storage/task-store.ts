import { prisma } from "../db.js";
import {
  resolveTaskStatus,
  taskTimeMinutes,
  type TaskStatus,
} from "./task-status.js";

// Tasks: progress status, time tracking (estimate + logged + running timer),
// checklists, due dates, and optional links to a project/group/centre/assignee.

export type ChecklistItemView = {
  id: number;
  label: string;
  done: boolean;
  position: number;
  createdAt: string;
};

// A recipient previously used when emailing from this task — most-recently-used
// first. The first entry seeds the compose editor's "To" placeholder.
export type TaskEmailRecipientView = {
  email: string;
  name: string | null;
};

export type TaskAttachmentView = {
  id: number;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedAt: string;
};

export type TaskView = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  overdue: boolean;
  estimatedMinutes: number | null;
  loggedMinutes: number;
  timerRunning: boolean;
  timerStartedAt: string | null;
  projectId: number | null;
  projectName: string | null;
  taskGroupId: number | null;
  taskGroupName: string | null;
  centreKey: number | null;
  centreName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  position: number;
  completedAt: string | null;
  checklistTotal: number;
  checklistDone: number;
  checklist: ChecklistItemView[];
  emailSubject: string | null;
  emailBody: string | null;
  emailRecipients: TaskEmailRecipientView[];
  attachments: TaskAttachmentView[];
};

export type TaskReminderView = {
  id: number;
  title: string;
  status: TaskStatus;
  dueDate: string;
  daysUntilDue: number; // negative when overdue
  assigneeName: string | null;
  projectName: string | null;
};

export type TaskReminderFeed = {
  overdue: TaskReminderView[];
  dueSoon: TaskReminderView[];
  total: number;
};

export type TaskListFilter = {
  projectId?: number;
  taskGroupId?: number;
  assigneeId?: number;
  includeDone?: boolean;
};

export type TaskInput = {
  title: string;
  description?: string | null;
  status?: string;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  projectId?: number | null;
  taskGroupId?: number | null;
  centreKey?: number | null;
  assigneeId?: number | null;
};

const TASK_INCLUDE = {
  project: { select: { name: true } },
  group: { select: { name: true } },
  centre: { select: { name: true } },
  assignee: { select: { name: true } },
  checklistItems: { orderBy: { position: "asc" } as const },
  emailRecipients: { orderBy: { lastUsedAt: "desc" } as const },
  attachments: { orderBy: { uploadedAt: "desc" } as const },
} as const;

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMinutes(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Math.floor(Number(value));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Shape returned by a findMany/findUnique with TASK_INCLUDE applied.
type IncludedTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  estimatedMinutes: number | null;
  loggedMinutes: number;
  timerStartedAt: Date | null;
  projectId: number | null;
  taskGroupId: number | null;
  centreKey: number | null;
  assigneeId: number | null;
  position: number;
  completedAt: Date | null;
  emailSubject: string | null;
  emailBody: string | null;
  project: { name: string } | null;
  group: { name: string } | null;
  centre: { name: string } | null;
  assignee: { name: string } | null;
  checklistItems: {
    id: number;
    label: string;
    done: boolean;
    position: number;
    createdAt: Date;
  }[];
  emailRecipients: {
    email: string;
    name: string | null;
  }[];
  attachments: {
    id: number;
    originalName: string;
    mimeType: string | null;
    sizeBytes: number;
    uploadedAt: Date;
  }[];
};

function toTaskView(task: IncludedTask, now: Date = new Date()): TaskView {
  const checklistDone = task.checklistItems.filter((item) => item.done).length;
  const overdue =
    task.status !== "done" && task.dueDate != null && task.dueDate.getTime() < now.getTime();

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: resolveTaskStatus(task.status),
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    overdue,
    estimatedMinutes: task.estimatedMinutes,
    loggedMinutes: taskTimeMinutes(task, now),
    timerRunning: task.timerStartedAt != null,
    timerStartedAt: task.timerStartedAt ? task.timerStartedAt.toISOString() : null,
    projectId: task.projectId,
    projectName: task.project?.name ?? null,
    taskGroupId: task.taskGroupId,
    taskGroupName: task.group?.name ?? null,
    centreKey: task.centreKey,
    centreName: task.centre?.name ?? null,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    position: task.position,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    checklistTotal: task.checklistItems.length,
    checklistDone,
    checklist: task.checklistItems.map((item) => ({
      id: item.id,
      label: item.label,
      done: item.done,
      position: item.position,
      createdAt: item.createdAt.toISOString(),
    })),
    emailSubject: task.emailSubject,
    emailBody: task.emailBody,
    emailRecipients: task.emailRecipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
    })),
    attachments: task.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      uploadedAt: attachment.uploadedAt.toISOString(),
    })),
  };
}

export async function listTasks(filter: TaskListFilter = {}): Promise<TaskView[]> {
  const now = new Date();
  const rows = await prisma.task.findMany({
    where: {
      ...(filter.projectId != null ? { projectId: filter.projectId } : {}),
      ...(filter.taskGroupId != null ? { taskGroupId: filter.taskGroupId } : {}),
      ...(filter.assigneeId != null ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.includeDone ? {} : { status: { not: "done" } }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: TASK_INCLUDE,
  });
  return rows.map((row) => toTaskView(row as IncludedTask, now));
}

export async function getTask(id: number): Promise<TaskView | null> {
  const row = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  return row ? toTaskView(row as IncludedTask) : null;
}

export async function createTask(input: TaskInput): Promise<number> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error("Task title is required");
  }
  const status = resolveTaskStatus(input.status ?? "todo");
  const task = await prisma.task.create({
    data: {
      title,
      description: emptyToNull(input.description),
      status,
      dueDate: parseDate(input.dueDate),
      estimatedMinutes: parseMinutes(input.estimatedMinutes),
      projectId: input.projectId ?? null,
      taskGroupId: input.taskGroupId ?? null,
      centreKey: input.centreKey ?? null,
      assigneeId: input.assigneeId ?? null,
      completedAt: status === "done" ? new Date() : null,
    },
    select: { id: true },
  });
  return task.id;
}

export async function updateTask(id: number, input: TaskInput): Promise<void> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error("Task title is required");
  }
  await prisma.task.update({
    where: { id },
    data: {
      title,
      description: emptyToNull(input.description),
      dueDate: parseDate(input.dueDate),
      estimatedMinutes: parseMinutes(input.estimatedMinutes),
      projectId: input.projectId ?? null,
      taskGroupId: input.taskGroupId ?? null,
      centreKey: input.centreKey ?? null,
      assigneeId: input.assigneeId ?? null,
    },
  });
}

// Status change also maintains completedAt: stamped when moving to done,
// cleared when moving back out of done.
export async function setTaskStatus(id: number, status: string): Promise<void> {
  const resolved = resolveTaskStatus(status);
  await prisma.task.update({
    where: { id },
    data: {
      status: resolved,
      completedAt: resolved === "done" ? new Date() : null,
    },
  });
}

export async function deleteTask(id: number): Promise<void> {
  // ChecklistItem and TimeEntry rows cascade.
  await prisma.task.delete({ where: { id } });
}

// --- Time tracking -------------------------------------------------------

// Starts the running timer. No-op if a timer is already running so a double
// click doesn't lose the earlier start time.
export async function startTaskTimer(id: number): Promise<void> {
  await prisma.task.updateMany({
    where: { id, timerStartedAt: null },
    data: { timerStartedAt: new Date() },
  });
}

// Stops the running timer: folds elapsed whole minutes into loggedMinutes,
// writes a TimeEntry for the audit trail, and clears the running flag. No-op if
// no timer is running.
export async function stopTaskTimer(id: number): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { timerStartedAt: true },
  });
  if (!task?.timerStartedAt) return;

  const startedAt = task.timerStartedAt;
  const endedAt = new Date();
  const minutes = Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000),
  );

  await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: {
        timerStartedAt: null,
        loggedMinutes: { increment: minutes },
      },
    }),
    ...(minutes > 0
      ? [
          prisma.timeEntry.create({
            data: { taskId: id, minutes, startedAt, endedAt, note: "Timer" },
          }),
        ]
      : []),
  ]);
}

// Manual time log: adds minutes to the cached total and records an entry.
export async function logTaskTime(
  id: number,
  minutes: number,
  note?: string | null,
): Promise<void> {
  const amount = parseMinutes(minutes);
  if (!amount || amount <= 0) {
    throw new Error("Logged minutes must be a positive number");
  }
  await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: { loggedMinutes: { increment: amount } },
    }),
    prisma.timeEntry.create({
      data: { taskId: id, minutes: amount, note: emptyToNull(note) },
    }),
  ]);
}

// --- Checklist -----------------------------------------------------------

export async function addChecklistItem(taskId: number, label: string): Promise<void> {
  const text = label.trim();
  if (text.length === 0) {
    throw new Error("Checklist item is required");
  }
  const last = await prisma.checklistItem.findFirst({
    where: { taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.checklistItem.create({
    data: { taskId, label: text, position: (last?.position ?? -1) + 1 },
  });
}

export async function updateChecklistItem(itemId: number, label: string): Promise<void> {
  const text = label.trim();
  if (text.length === 0) {
    throw new Error("Checklist item is required");
  }
  await prisma.checklistItem.updateMany({
    where: { id: itemId },
    data: { label: text },
  });
}

export async function toggleChecklistItem(itemId: number): Promise<void> {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { done: true },
  });
  if (!item) return;
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { done: !item.done },
  });
}

export async function deleteChecklistItem(itemId: number): Promise<void> {
  await prisma.checklistItem.delete({ where: { id: itemId } });
}

// --- Email draft ---------------------------------------------------------

export type TaskEmailDraftInput = {
  to?: string | null;
  toName?: string | null;
  subject?: string | null;
  body?: string | null;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  // Light validation only — Outlook is the real arbiter. We just need a single
  // address that looks plausible so we don't store garbage as a "contact".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

// Remembers the last composed email for a task: stores the subject/body on the
// task and upserts the recipient (bumping lastUsedAt so it sorts to the front of
// the quick-select list and becomes the next placeholder). The recipient is
// optional — saving subject/body alone is allowed (e.g. drafting before the
// address is known).
export async function saveTaskEmailDraft(
  taskId: number,
  input: TaskEmailDraftInput,
): Promise<void> {
  const email = normalizeEmail(input.to);
  const name = emptyToNull(input.toName);

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        emailSubject: emptyToNull(input.subject),
        emailBody: emptyToNull(input.body),
      },
    });

    if (email) {
      await tx.taskEmailRecipient.upsert({
        where: { taskId_email: { taskId, email } },
        update: { name, lastUsedAt: new Date() },
        create: { taskId, email, name },
      });
    }
  });
}

// --- File attachments ----------------------------------------------------

export type TaskAttachmentInput = {
  originalName: string;
  storedName: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes: number;
};

export type TaskAttachmentRecord = TaskAttachmentInput & {
  id: number;
  taskId: number;
};

export async function createTaskAttachment(
  taskId: number,
  input: TaskAttachmentInput,
): Promise<number> {
  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      originalName: input.originalName.trim() || "attachment",
      storedName: input.storedName,
      storagePath: input.storagePath,
      mimeType: emptyToNull(input.mimeType),
      sizeBytes: input.sizeBytes,
    },
    select: { id: true },
  });
  return attachment.id;
}

export async function getTaskAttachment(
  taskId: number,
  attachmentId: number,
): Promise<TaskAttachmentRecord | null> {
  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    select: {
      id: true,
      taskId: true,
      originalName: true,
      storedName: true,
      storagePath: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  return attachment;
}

export async function deleteTaskAttachment(
  taskId: number,
  attachmentId: number,
): Promise<TaskAttachmentRecord | null> {
  const attachment = await getTaskAttachment(taskId, attachmentId);
  if (!attachment) return null;
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  return attachment;
}

// --- Project / group attachment -----------------------------------------

export async function attachTaskToProject(
  taskId: number,
  projectId: number | null,
  taskGroupId: number | null,
): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { projectId, taskGroupId: projectId == null ? null : taskGroupId },
  });
}

// --- Reminders -----------------------------------------------------------

// The landing-page reminder feed: not-done tasks with a due date, partitioned
// into overdue (due before today) and due-soon (due within horizonDays).
// Backed by the @@index([status, dueDate]).
export async function getDueAndOverdueTasks(
  now: Date = new Date(),
  horizonDays = 7,
): Promise<TaskReminderFeed> {
  const today = startOfDay(now);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays + 1); // inclusive of horizon day

  const rows = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      dueDate: { not: null, lt: horizon },
    },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      assignee: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  const overdue: TaskReminderView[] = [];
  const dueSoon: TaskReminderView[] = [];

  for (const row of rows) {
    if (!row.dueDate) continue;
    const due = row.dueDate;
    const daysUntilDue = Math.round(
      (startOfDay(due).getTime() - today.getTime()) / 86400000,
    );
    const view: TaskReminderView = {
      id: row.id,
      title: row.title,
      status: resolveTaskStatus(row.status),
      dueDate: due.toISOString(),
      daysUntilDue,
      assigneeName: row.assignee?.name ?? null,
      projectName: row.project?.name ?? null,
    };
    if (due.getTime() < today.getTime()) {
      overdue.push(view);
    } else {
      dueSoon.push(view);
    }
  }

  return { overdue, dueSoon, total: overdue.length + dueSoon.length };
}
