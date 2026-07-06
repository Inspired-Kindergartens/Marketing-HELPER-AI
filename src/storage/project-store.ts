import { prisma } from "../db.js";
import { resolveTaskStatus, type TaskStatus } from "./task-status.js";
import type { TaskView } from "./task-store.js";

// Projects consolidate tasks by group and carry a member roster drawn from the
// members directory. The roll-up shape feeds both the projects panel and the
// Gantt/timeline view.

export type ProjectListItem = {
  id: number;
  name: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  taskCount: number;
  doneCount: number;
  memberCount: number;
};

export type ProjectMemberView = {
  memberId: number;
  name: string;
  email: string | null;
  projectRole: string | null;
  active: boolean;
};

export type ProjectGroupView = {
  id: number;
  name: string;
  position: number;
  tasks: TaskView[];
  statusCounts: Record<TaskStatus, number>;
};

export type ProjectRollup = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  centreKey: number | null;
  centreName: string | null;
  members: ProjectMemberView[];
  groups: ProjectGroupView[];
  ungrouped: TaskView[]; // tasks on the project but not in any group
  taskCount: number;
  doneCount: number;
  // Date span across all scheduled tasks, for the timeline axis.
  rangeStart: string | null;
  rangeEnd: string | null;
};

export type ProjectInput = {
  name: string;
  description?: string | null;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
  centreKey?: number | null;
};

const PROJECT_STATUSES = new Set(["active", "on_hold", "completed", "archived"]);

function resolveProjectStatus(value: unknown): string {
  return typeof value === "string" && PROJECT_STATUSES.has(value) ? value : "active";
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emptyStatusCounts(): Record<TaskStatus, number> {
  return { todo: 0, in_progress: 0, blocked: 0, done: 0 };
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const rows = await prisma.project.findMany({
    orderBy: [{ status: "asc" }, { targetDate: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { members: true } },
      tasks: { select: { status: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    taskCount: row.tasks.length,
    doneCount: row.tasks.filter((task) => task.status === "done").length,
    memberCount: row._count.members,
  }));
}

export async function createProject(input: ProjectInput): Promise<number> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Project name is required");
  }
  const project = await prisma.project.create({
    data: {
      name,
      description: emptyToNull(input.description),
      status: resolveProjectStatus(input.status ?? "active"),
      startDate: parseDate(input.startDate),
      targetDate: parseDate(input.targetDate),
      centreKey: input.centreKey ?? null,
    },
    select: { id: true },
  });
  return project.id;
}

export async function updateProject(id: number, input: ProjectInput): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Project name is required");
  }
  await prisma.project.update({
    where: { id },
    data: {
      name,
      description: emptyToNull(input.description),
      status: resolveProjectStatus(input.status ?? "active"),
      startDate: parseDate(input.startDate),
      targetDate: parseDate(input.targetDate),
      centreKey: input.centreKey ?? null,
    },
  });
}

export async function deleteProject(id: number): Promise<void> {
  // TaskGroup and ProjectMember cascade; Task.projectId / taskGroupId are
  // SetNull, so the project's tasks survive as unassigned tasks.
  await prisma.project.delete({ where: { id } });
}

// --- Groups --------------------------------------------------------------

export async function createTaskGroup(projectId: number, name: string): Promise<number> {
  const text = name.trim();
  if (text.length === 0) {
    throw new Error("Group name is required");
  }
  const last = await prisma.taskGroup.findFirst({
    where: { projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const group = await prisma.taskGroup.create({
    data: { projectId, name: text, position: (last?.position ?? -1) + 1 },
    select: { id: true },
  });
  return group.id;
}

export async function renameTaskGroup(groupId: number, name: string): Promise<void> {
  const text = name.trim();
  if (text.length === 0) {
    throw new Error("Group name is required");
  }
  await prisma.taskGroup.update({ where: { id: groupId }, data: { name: text } });
}

export async function deleteTaskGroup(groupId: number): Promise<void> {
  // Task.taskGroupId is SetNull, so tasks fall back to the project's ungrouped
  // lane rather than being deleted.
  await prisma.taskGroup.delete({ where: { id: groupId } });
}

// --- Members -------------------------------------------------------------

export async function addProjectMember(
  projectId: number,
  memberId: number,
  projectRole?: string | null,
): Promise<void> {
  await prisma.projectMember.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId, projectRole: emptyToNull(projectRole) },
    update: { projectRole: emptyToNull(projectRole) },
  });
}

export async function removeProjectMember(
  projectId: number,
  memberId: number,
): Promise<void> {
  await prisma.projectMember.deleteMany({ where: { projectId, memberId } });
}

// --- Roll-up -------------------------------------------------------------

export async function getProjectRollup(id: number): Promise<ProjectRollup | null> {
  const { listTasks } = await import("./task-store.js");

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      centre: { select: { name: true } },
      members: {
        include: { member: true },
        orderBy: { createdAt: "asc" },
      },
      taskGroups: { orderBy: { position: "asc" } },
    },
  });
  if (!project) return null;

  // One query for all the project's tasks (including done), then partition in
  // memory by group so each TaskView is built once via the task-store mapper.
  const tasks = await listTasks({ projectId: id, includeDone: true });

  const byGroup = new Map<number, TaskView[]>();
  const ungrouped: TaskView[] = [];
  for (const task of tasks) {
    if (task.taskGroupId == null) {
      ungrouped.push(task);
    } else {
      const list = byGroup.get(task.taskGroupId) ?? [];
      list.push(task);
      byGroup.set(task.taskGroupId, list);
    }
  }

  const groups: ProjectGroupView[] = project.taskGroups.map((group) => {
    const groupTasks = byGroup.get(group.id) ?? [];
    const statusCounts = emptyStatusCounts();
    for (const task of groupTasks) {
      statusCounts[resolveTaskStatus(task.status)] += 1;
    }
    return {
      id: group.id,
      name: group.name,
      position: group.position,
      tasks: groupTasks,
      statusCounts,
    };
  });

  // Timeline span from scheduled tasks (those with a due date), widened to the
  // project's own start/target if set.
  const dates: number[] = [];
  if (project.startDate) dates.push(project.startDate.getTime());
  if (project.targetDate) dates.push(project.targetDate.getTime());
  for (const task of tasks) {
    if (task.dueDate) dates.push(new Date(task.dueDate).getTime());
  }
  const rangeStart = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  const rangeEnd = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: project.startDate ? project.startDate.toISOString() : null,
    targetDate: project.targetDate ? project.targetDate.toISOString() : null,
    centreKey: project.centreKey,
    centreName: project.centre?.name ?? null,
    members: project.members.map((pm) => ({
      memberId: pm.memberId,
      name: pm.member.name,
      email: pm.member.email,
      projectRole: pm.projectRole,
      active: pm.member.active,
    })),
    groups,
    ungrouped,
    taskCount: tasks.length,
    doneCount: tasks.filter((task) => task.status === "done").length,
    rangeStart,
    rangeEnd,
  };
}
