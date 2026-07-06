import type { AiChatMessage } from "./client.js";
import { sanitizeChatHistory, type AiChatHistoryMessageInput } from "./chat.js";
import type { TaskView } from "../storage/task-store.js";
import type { ProjectListItem } from "../storage/project-store.js";
import type { MemberDirectoryData } from "../storage/member-store.js";

export type TasksAiContextInput = {
  tasks: TaskView[];
  projects: ProjectListItem[];
  members: MemberDirectoryData;
};

export function buildTasksAiDashboardContext(input: TasksAiContextInput) {
  const tasks = input.tasks;
  const projects = input.projects;
  const members = input.members.members;

  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.overdue);
  const loggedMinutes = tasks.reduce((total, task) => total + task.loggedMinutes, 0);
  const runningTimers = tasks.filter((task) => task.timerRunning).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      taskCount: tasks.length,
      openCount: openTasks.length,
      doneCount: tasks.length - openTasks.length,
      overdueCount: overdueTasks.length,
      runningTimers,
      totalLoggedMinutes: loggedMinutes,
      projectCount: projects.length,
      memberCount: members.length,
      activeMemberCount: input.members.activeCount,
    },
    tasks: tasks.slice(0, 50).map((task) => ({
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      overdue: task.overdue,
      estimatedMinutes: task.estimatedMinutes,
      loggedMinutes: task.loggedMinutes,
      timerRunning: task.timerRunning,
      projectName: task.projectName,
      taskGroupName: task.taskGroupName,
      centreName: task.centreName,
      assigneeName: task.assigneeName,
      checklistDone: task.checklistDone,
      checklistTotal: task.checklistTotal,
    })),
    projects: projects.slice(0, 30).map((project) => ({
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      targetDate: project.targetDate,
      taskCount: project.taskCount,
      doneCount: project.doneCount,
      memberCount: project.memberCount,
    })),
    members: members.slice(0, 30).map((member) => ({
      name: member.name,
      role: member.role,
      active: member.active,
      projectCount: member.projectCount,
      assignedTaskCount: member.assignedTaskCount,
    })),
  };
}

export type TasksAiDashboardContext = ReturnType<typeof buildTasksAiDashboardContext>;

export function buildTasksSystemPrompt() {
  return [
    "You are Beep Beep, the assistant inside the Tasks & Projects dashboard.",
    "Answer only from the supplied tasks, projects and members context.",
    "Tasks have a status, optional due date, time estimate, logged time, and may link to a project, group, centre, or assignee.",
    "If a requested detail is missing, say it is unavailable in the current data.",
    "Keep answers concise and name the specific task, project, or member supporting the answer.",
  ].join("\n");
}

export function buildTasksAiChatMessages(
  context: TasksAiDashboardContext,
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
): AiChatMessage[] {
  return [
    { role: "system", content: buildTasksSystemPrompt() },
    {
      role: "user",
      content: `Current Tasks & Projects dashboard context JSON:\n${JSON.stringify(context)}\nUse only this context as evidence.`,
    },
    ...sanitizeChatHistory(history),
    { role: "user", content: prompt },
  ];
}

export function buildBuiltinTasksAnswer(context: TasksAiDashboardContext, prompt: string) {
  if (/overdue/i.test(prompt)) {
    return `There ${context.summary.overdueCount === 1 ? "is" : "are"} ${context.summary.overdueCount} overdue task${context.summary.overdueCount === 1 ? "" : "s"} out of ${context.summary.openCount} open tasks.`;
  }

  if (/project/i.test(prompt)) {
    return `There are ${context.summary.projectCount} projects and ${context.summary.taskCount} tasks in total (${context.summary.doneCount} done, ${context.summary.openCount} open).`;
  }

  if (/member|assign|who/i.test(prompt)) {
    return `There are ${context.summary.memberCount} members (${context.summary.activeMemberCount} active) across the workspace.`;
  }

  return `There are ${context.summary.taskCount} tasks (${context.summary.openCount} open, ${context.summary.overdueCount} overdue) across ${context.summary.projectCount} projects, with ${context.summary.totalLoggedMinutes} minutes logged so far.`;
}
