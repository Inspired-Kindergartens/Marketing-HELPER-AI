import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTaskStatus, TASK_NEXT_STATUS, TASK_STATUSES } from "../src/storage/task-status.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("resolveTaskStatus narrows to the known status set and falls back to todo", () => {
  assert.equal(resolveTaskStatus("todo"), "todo");
  assert.equal(resolveTaskStatus("in_progress"), "in_progress");
  // "blocked" was retired (2026-09); a stray value must never persist.
  assert.equal(resolveTaskStatus("blocked"), "todo");
  assert.equal(resolveTaskStatus("done"), "done");
  assert.equal(resolveTaskStatus("bogus"), "todo");
  assert.equal(resolveTaskStatus(undefined), "todo");
  assert.equal(resolveTaskStatus(42), "todo");
});

test("status set is To do, In progress, Completed, and each advances one phase", () => {
  assert.deepEqual([...TASK_STATUSES], ["todo", "in_progress", "done"]);
  assert.deepEqual(TASK_NEXT_STATUS, { todo: "in_progress", in_progress: "done", done: null });
});

test("setTaskStatus stamps completedAt when moving to done and clears it otherwise", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(
    store,
    /completedAt:\s*resolved === "done" \? new Date\(\) : null/,
  );
});

test("getDueAndOverdueTasks excludes done tasks and partitions overdue vs due-soon by dueDate", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(store, /status:\s*\{\s*not:\s*"done"\s*\}/);
  assert.match(store, /if\s*\(due\.getTime\(\) < today\.getTime\(\)\)\s*\{\s*\n\s*overdue\.push\(view\);/);
  assert.match(store, /}\s*else\s*\{\s*\n\s*dueSoon\.push\(view\);/);
  assert.match(store, /total:\s*overdue\.length \+ dueSoon\.length/);
});

test("getDueAndOverdueTasks includes today's horizon day and is backed by the status+dueDate index", () => {
  const store = source("../src/storage/task-store.ts");
  const schema = source("../prisma/schema.prisma");

  assert.match(store, /horizon\.setDate\(horizon\.getDate\(\) \+ horizonDays \+ 1\)/);
  assert.match(schema, /@@index\(\[status, dueDate\]\)/);
});
