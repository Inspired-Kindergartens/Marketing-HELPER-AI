import assert from "node:assert/strict";
import test from "node:test";

import { renderLandingPage } from "../src/ui/landing-page.js";
import type { TaskReminderFeed, TaskReminderView } from "../src/storage/task-store.js";

function buildReminder(overrides: Partial<TaskReminderView> = {}): TaskReminderView {
  return {
    id: 1,
    title: "Follow up with waitlist family",
    status: "todo",
    dueDate: "2026-07-10T00:00:00.000Z",
    daysUntilDue: -4,
    assigneeName: null,
    projectName: null,
    ...overrides,
  };
}

test("landing page hides the reminders section when the feed is empty", () => {
  const html = renderLandingPage({ reminders: { overdue: [], dueSoon: [], total: 0 } });

  assert.doesNotMatch(html, /landing__reminders/);
});

test("landing page hides the reminders section when no feed is provided at all", () => {
  const html = renderLandingPage({});

  assert.doesNotMatch(html, /landing__reminders/);
});

test("landing page renders overdue reminders emphasised ahead of due-soon ones", () => {
  const feed: TaskReminderFeed = {
    overdue: [buildReminder({ id: 1, title: "Overdue task", daysUntilDue: -3 })],
    dueSoon: [buildReminder({ id: 2, title: "Due soon task", dueDate: "2026-07-16T00:00:00.000Z", daysUntilDue: 2 })],
    total: 2,
  };
  const html = renderLandingPage({ reminders: feed });

  assert.match(html, /landing__reminders/);
  assert.match(html, /1 overdue · 2 need attention/);
  assert.match(html, /landing-reminder landing-reminder--overdue" href="\/tasks\?task=1"/);
  assert.match(html, /Overdue by 3 days/);
  assert.match(html, /landing-reminder" href="\/tasks\?task=2"/);
  assert.doesNotMatch(html, /landing-reminder landing-reminder--overdue" href="\/tasks\?task=2"/);
  assert.match(html, /Due in 2 days/);
  assert.ok(html.indexOf("Overdue task") < html.indexOf("Due soon task"));
});

test("landing page reminder heading reads 'due soon' only when nothing is overdue", () => {
  const feed: TaskReminderFeed = {
    overdue: [],
    dueSoon: [buildReminder({ id: 3, title: "Due today task", dueDate: "2026-07-14T00:00:00.000Z", daysUntilDue: 0 })],
    total: 1,
  };
  const html = renderLandingPage({ reminders: feed });

  assert.match(html, /1 due soon/);
  assert.doesNotMatch(html, /overdue ·/);
  assert.match(html, /Due today/);
});

test("landing page reminder item shows project and assignee meta when present", () => {
  const feed: TaskReminderFeed = {
    overdue: [buildReminder({ id: 4, title: "Task with meta", projectName: "Winter enrolment push", assigneeName: "Jenna Fenton" })],
    dueSoon: [],
    total: 1,
  };
  const html = renderLandingPage({ reminders: feed });

  assert.match(html, /landing-reminder__meta">Winter enrolment push · Jenna Fenton<\/span>/);
});

test("landing page still includes the primary Tasks button linking to /tasks", () => {
  const html = renderLandingPage({});

  assert.match(html, /landing-button landing-button--primary" href="\/tasks">/);
  assert.match(html, /landing-button__label">Tasks<\/span>/);
});

test("landing page includes a Job Descriptions tile linking to /jd", () => {
  const html = renderLandingPage({});

  assert.match(html, /href="\/jd">/);
  assert.match(html, /Job Descriptions/);
});

test("landing page surfaces a KTCA expiry reminder alongside task reminders", () => {
  const html = renderLandingPage({
    reminders: { overdue: [], dueSoon: [], total: 0 },
    ktcaReminder: { expired: false, daysUntilExpiry: 45 },
  });

  assert.match(html, /landing__reminders/);
  assert.match(html, /KTCA agreement needs updating/);
  assert.match(html, /Expires in 45 days/);
  assert.match(html, /1 overdue · 1 need attention/);
});

test("landing page KTCA reminder shows 'Expired' wording once the agreement has lapsed", () => {
  const html = renderLandingPage({
    ktcaReminder: { expired: true, daysUntilExpiry: -10 },
  });

  assert.match(html, /Expired 10 days ago/);
});

test("landing page hides the KTCA reminder when the agreement is not close to expiry", () => {
  const html = renderLandingPage({
    reminders: { overdue: [], dueSoon: [], total: 0 },
    ktcaReminder: null,
  });

  assert.doesNotMatch(html, /landing__reminders/);
});
