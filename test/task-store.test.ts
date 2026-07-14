import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTaskStatus, taskTimeMinutes } from "../src/storage/task-status.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("resolveTaskStatus narrows to the known status set and falls back to todo", () => {
  assert.equal(resolveTaskStatus("todo"), "todo");
  assert.equal(resolveTaskStatus("in_progress"), "in_progress");
  assert.equal(resolveTaskStatus("blocked"), "blocked");
  assert.equal(resolveTaskStatus("done"), "done");
  assert.equal(resolveTaskStatus("bogus"), "todo");
  assert.equal(resolveTaskStatus(undefined), "todo");
  assert.equal(resolveTaskStatus(42), "todo");
});

test("taskTimeMinutes folds a running timer's elapsed minutes without mutating loggedMinutes", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  assert.equal(
    taskTimeMinutes({ loggedMinutes: 30, timerStartedAt: null }, now),
    30,
  );

  const startedAt = new Date("2026-07-14T11:45:00Z"); // 15 minutes ago
  assert.equal(
    taskTimeMinutes({ loggedMinutes: 30, timerStartedAt: startedAt }, now),
    45,
  );
});

test("taskTimeMinutes never returns negative elapsed time for a clock skewed start", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const startedAt = new Date("2026-07-14T12:05:00Z"); // starts "in the future"

  assert.equal(
    taskTimeMinutes({ loggedMinutes: 10, timerStartedAt: startedAt }, now),
    10,
  );
});

test("setTaskStatus stamps completedAt when moving to done and clears it otherwise", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(
    store,
    /completedAt:\s*resolved === "done" \? new Date\(\) : null/,
  );
});

test("stopTaskTimer folds elapsed minutes into loggedMinutes and writes a TimeEntry audit row", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(store, /timerStartedAt:\s*null,\s*\n\s*loggedMinutes:\s*\{\s*increment:\s*minutes\s*\}/);
  assert.match(store, /prisma\.timeEntry\.create/);
  assert.match(store, /Math\.floor\(\(endedAt\.getTime\(\) - startedAt\.getTime\(\)\) \/ 60000\)/);
});

test("stopTaskTimer is a no-op when no timer is running and skips a zero-minute TimeEntry", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(store, /if \(!task\?\.timerStartedAt\) return;/);
  assert.match(store, /\.\.\.\(minutes > 0\s*\n\s*\?\s*\[/);
});

test("startTaskTimer only starts when no timer is already running", () => {
  const store = source("../src/storage/task-store.ts");

  assert.match(store, /updateMany\(\{\s*\n\s*where:\s*\{\s*id,\s*timerStartedAt:\s*null\s*\}/);
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
