// Shared task-status vocabulary and time math, used by both the stores and the
// UI so the API and rendering agree on the allowed set (mirrors the
// VALID_COMMS_PANEL_IDS / resolveWindowKey guard pattern used elsewhere).

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

// Narrows an arbitrary string to a known status, falling back to "todo" so a
// stray value from a form post can never persist an unknown status.
export function resolveTaskStatus(value: unknown): TaskStatus {
  return typeof value === "string" && TASK_STATUS_SET.has(value)
    ? (value as TaskStatus)
    : "todo";
}

// Minutes logged against a task, including the live elapsed time of a running
// timer. Reading this never writes — the running timer is folded into
// loggedMinutes only when it is stopped.
export function taskTimeMinutes(
  task: { loggedMinutes: number; timerStartedAt: Date | null },
  now: Date = new Date(),
): number {
  const running = task.timerStartedAt
    ? Math.max(0, Math.floor((now.getTime() - task.timerStartedAt.getTime()) / 60000))
    : 0;
  return task.loggedMinutes + running;
}
