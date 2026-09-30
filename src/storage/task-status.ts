// Shared task-status vocabulary, used by both the stores and the UI so the API
// and rendering agree on the allowed set (mirrors the VALID_COMMS_PANEL_IDS /
// resolveWindowKey guard pattern used elsewhere).

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);

// The stored key stays "done" (existing rows and the completedAt logic depend
// on it); only the label the user sees is "Completed".
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Completed",
};

// The next phase a task moves to, for the board's one-click advance control.
// "done" is terminal, so it has no next phase.
export const TASK_NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: "in_progress",
  in_progress: "done",
  done: null,
};

// Narrows an arbitrary string to a known status, falling back to "todo" so a
// stray value from a form post can never persist an unknown status.
export function resolveTaskStatus(value: unknown): TaskStatus {
  return typeof value === "string" && TASK_STATUS_SET.has(value)
    ? (value as TaskStatus)
    : "todo";
}
