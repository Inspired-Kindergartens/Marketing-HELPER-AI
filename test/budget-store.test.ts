import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  financialYearLabel,
  financialYearOf,
  financialYearOfMonth,
  nzMonthOf,
  parseBudgetMoney,
  resolveBudgetExpenseSource,
  resolveBudgetFrequency,
  resolveBudgetFutureStatus,
  resolveBudgetSubscriptionStatus,
} from "../src/storage/budget-store.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("financial years run 1 July - 30 June and are keyed by their start year", () => {
  assert.equal(financialYearOfMonth("2026-06"), 2025);
  assert.equal(financialYearOfMonth("2026-07"), 2026);
  assert.equal(financialYearOfMonth("2027-01"), 2026);
  assert.equal(financialYearLabel(2026), "2026-27");
  assert.equal(financialYearLabel(2099), "2099-00");
});

test("months are NZ calendar months", () => {
  // 30 June 13:00 UTC is 1 July 01:00 in NZ (NZST, +12).
  assert.equal(nzMonthOf(new Date("2026-06-30T13:00:00Z")), "2026-07");
  assert.equal(financialYearOf(new Date("2026-06-30T13:00:00Z")), 2026);
  assert.equal(nzMonthOf(new Date("2026-06-30T11:00:00Z")), "2026-06");
});

test("money reads typed amounts and rejects anything else", () => {
  assert.equal(parseBudgetMoney("$1,234.50"), 1234.5);
  assert.equal(parseBudgetMoney(" 19.999 "), 20);
  assert.equal(parseBudgetMoney(42), 42);
  assert.equal(parseBudgetMoney(""), null);
  assert.equal(parseBudgetMoney("abc"), null);
  assert.equal(parseBudgetMoney(Number.NaN), null);
});

test("stored codes are narrowed to the known sets", () => {
  assert.equal(resolveBudgetFrequency("Fortnight"), "fortnight");
  assert.equal(resolveBudgetFrequency("daily"), "month");
  assert.equal(resolveBudgetSubscriptionStatus("ended"), "ended");
  assert.equal(resolveBudgetSubscriptionStatus("paused"), "active");
  assert.equal(resolveBudgetExpenseSource("meta"), "meta");
  assert.equal(resolveBudgetExpenseSource(undefined), "manual");
  assert.equal(resolveBudgetFutureStatus("TBC"), "tbc");
  assert.equal(resolveBudgetFutureStatus("whatever"), "planned");
});

test("budget schema keeps renames linked and Meta rows one per month", () => {
  const schema = source("../prisma/schema.prisma");
  assert.match(schema, /model BudgetSubscriptionYear[\s\S]*@@unique\(\[subscriptionId, budgetYearId\]\)/);
  assert.match(schema, /model BudgetExpense[\s\S]*@@unique\(\[source, sourceMonth\]\)/);
  assert.match(schema, /model BudgetReminderDismissal[\s\S]*month\s+String\s+@unique/);
  assert.match(schema, /model BudgetYear[\s\S]*thresholdPercent\s+Decimal\s+@default\(2\)/);
});

test("budget store never edits Meta rows and only types the budget in", () => {
  const store = source("../src/storage/budget-store.ts");
  assert.match(store, /updateBudgetExpense[\s\S]*?source: \{ not: "meta" \}/);
  assert.match(store, /deleteBudgetExpense[\s\S]*?source: \{ not: "meta" \}/);
  assert.match(store, /source_sourceMonth: \{ source: "meta", sourceMonth: month \}/);
  assert.doesNotMatch(store, /AI_CHAT_MODEL|ollama/i);
});
