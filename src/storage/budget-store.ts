import { prisma as db } from "../db.js";

// Budget storage. A financial year runs 1 July - 30 June and is keyed by the
// year it starts in (2026 = 2026-27). Money is stored as Decimal(12,2) and
// handed out as plain numbers.

export const BUDGET_FREQUENCIES = ["week", "fortnight", "month", "quarter", "year"] as const;
export type BudgetFrequency = (typeof BUDGET_FREQUENCIES)[number];

export const BUDGET_SUBSCRIPTION_STATUSES = ["active", "ended"] as const;
export type BudgetSubscriptionStatus = (typeof BUDGET_SUBSCRIPTION_STATUSES)[number];

export const BUDGET_EXPENSE_SOURCES = ["manual", "import", "meta"] as const;
export type BudgetExpenseSource = (typeof BUDGET_EXPENSE_SOURCES)[number];

export const BUDGET_FUTURE_STATUSES = ["planned", "tbc", "bought"] as const;
export type BudgetFutureStatus = (typeof BUDGET_FUTURE_STATUSES)[number];

export const BUDGET_DEFAULT_THRESHOLD_PERCENT = 2;
export const META_EXPENSE_SUPPLIER = "Meta";
export const META_EXPENSE_GROUP = "Facebook";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const NZ_TIME_ZONE = "Pacific/Auckland";

// ---- Pure helpers ---------------------------------------------------------

export function isValidBudgetMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function isValidBudgetDate(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value);
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  const text = String(value ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

export const resolveBudgetFrequency = (value: unknown) => pick(BUDGET_FREQUENCIES, value, "month");
export const resolveBudgetSubscriptionStatus = (value: unknown) => pick(BUDGET_SUBSCRIPTION_STATUSES, value, "active");
export const resolveBudgetExpenseSource = (value: unknown) => pick(BUDGET_EXPENSE_SOURCES, value, "manual");
export const resolveBudgetFutureStatus = (value: unknown) => pick(BUDGET_FUTURE_STATUSES, value, "planned");

// "$1,234.50", "1234.5" and 1234.5 all read as 1234.5. Blank or unreadable is null.
export function parseBudgetMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(text) * 100) / 100;
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanCount(value: unknown, fallback: number) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

// The NZ calendar month (YYYY-MM) a moment falls in.
export function nzMonthOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: NZ_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

// July onwards belongs to the year that starts that July.
export function financialYearOfMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber >= 7 ? year : year - 1;
}

export function financialYearOf(date: Date): number {
  return financialYearOfMonth(nzMonthOf(date));
}

export function financialYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// ---- Views ----------------------------------------------------------------

type DecimalLike = { toNumber(): number };
const toNumber = (value: DecimalLike) => value.toNumber();
const toDateText = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export type BudgetYearView = {
  id: number;
  startYear: number;
  label: string;
  operatingBudget: number | null;
  thresholdPercent: number;
  notes: string;
  // The saved year-end report; "" = not saved, generate it when asked for.
  report: string;
  updatedAt: string;
};

// Additional budget for one purchase category in one year: part of that
// year's budget and a one-off.
export type BudgetAdditionalView = {
  id: number;
  budgetYearId: number;
  category: string;
  amount: number;
};

export type BudgetSubscriptionYearView = {
  id: number;
  subscriptionId: number;
  budgetYearId: number;
  startYear: number;
  name: string;
  category: string;
  amount: number;
  frequency: BudgetFrequency;
  status: BudgetSubscriptionStatus;
  tally: number;
  note: string;
  // When the subscription itself started and ended (all years); null = unknown.
  startedOn: string | null;
  endedOn: string | null;
  createdAt: string;
};

export type BudgetExpenseView = {
  id: number;
  budgetYearId: number;
  supplier: string;
  group: string;
  amount: number;
  note: string;
  spentOn: string | null;
  source: BudgetExpenseSource;
  sourceMonth: string | null;
  createdAt: string;
};

export type BudgetFutureSpendView = {
  id: number;
  budgetYearId: number;
  project: string;
  supplier: string;
  amount: number;
  qty: number;
  note: string;
  status: BudgetFutureStatus;
  expenseId: number | null;
  createdAt: string;
};

function yearView(record: {
  id: number;
  startYear: number;
  operatingBudget: DecimalLike | null;
  thresholdPercent: DecimalLike;
  notes: string;
  report: string;
  updatedAt: Date;
}): BudgetYearView {
  return {
    id: record.id,
    startYear: record.startYear,
    label: financialYearLabel(record.startYear),
    operatingBudget: record.operatingBudget ? toNumber(record.operatingBudget) : null,
    thresholdPercent: toNumber(record.thresholdPercent),
    notes: record.notes,
    report: record.report,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function subscriptionYearView(record: {
  id: number;
  subscriptionId: number;
  budgetYearId: number;
  amount: DecimalLike;
  frequency: string;
  status: string;
  tally: number;
  note: string;
  createdAt: Date;
  subscription: { name: string; category: string; startedOn: Date | null; endedOn: Date | null };
  budgetYear: { startYear: number };
}): BudgetSubscriptionYearView {
  return {
    id: record.id,
    subscriptionId: record.subscriptionId,
    budgetYearId: record.budgetYearId,
    startYear: record.budgetYear.startYear,
    name: record.subscription.name,
    category: record.subscription.category,
    amount: toNumber(record.amount),
    frequency: resolveBudgetFrequency(record.frequency),
    status: resolveBudgetSubscriptionStatus(record.status),
    tally: record.tally,
    note: record.note,
    startedOn: toDateText(record.subscription.startedOn),
    endedOn: toDateText(record.subscription.endedOn),
    createdAt: record.createdAt.toISOString(),
  };
}

function expenseView(record: {
  id: number;
  budgetYearId: number;
  supplier: string;
  group: string;
  amount: DecimalLike;
  note: string;
  spentOn: Date | null;
  source: string;
  sourceMonth: string | null;
  createdAt: Date;
}): BudgetExpenseView {
  return {
    id: record.id,
    budgetYearId: record.budgetYearId,
    supplier: record.supplier,
    group: record.group,
    amount: toNumber(record.amount),
    note: record.note,
    spentOn: toDateText(record.spentOn),
    source: resolveBudgetExpenseSource(record.source),
    sourceMonth: record.sourceMonth,
    createdAt: record.createdAt.toISOString(),
  };
}

function futureSpendView(record: {
  id: number;
  budgetYearId: number;
  project: string;
  supplier: string;
  amount: DecimalLike;
  qty: number;
  note: string;
  status: string;
  expenseId: number | null;
  createdAt: Date;
}): BudgetFutureSpendView {
  return {
    id: record.id,
    budgetYearId: record.budgetYearId,
    project: record.project,
    supplier: record.supplier,
    amount: toNumber(record.amount),
    qty: record.qty,
    note: record.note,
    status: resolveBudgetFutureStatus(record.status),
    expenseId: record.expenseId,
    createdAt: record.createdAt.toISOString(),
  };
}

// ---- Years ----------------------------------------------------------------

export async function readBudgetYears(): Promise<BudgetYearView[]> {
  const records = await db.budgetYear.findMany({ orderBy: { startYear: "asc" } });
  return records.map(yearView);
}

export async function ensureBudgetYear(startYear: number): Promise<BudgetYearView> {
  const record = await db.budgetYear.upsert({ where: { startYear }, create: { startYear }, update: {} });
  return yearView(record);
}

export type BudgetYearSettingsInput = {
  operatingBudget?: unknown;
  thresholdPercent?: unknown;
  notes?: unknown;
  report?: unknown;
};

// Only the user's own figures: the budget is typed in, never calculated.
// report is the year-end report as the user saved it ("" = generate it).
export async function updateBudgetYearSettings(startYear: number, input: BudgetYearSettingsInput): Promise<BudgetYearView> {
  const data: { operatingBudget?: number | null; thresholdPercent?: number; notes?: string; report?: string } = {};
  if (input.operatingBudget !== undefined) data.operatingBudget = parseBudgetMoney(input.operatingBudget);
  if (input.thresholdPercent !== undefined) {
    const threshold = parseBudgetMoney(input.thresholdPercent);
    if (threshold !== null && threshold >= 0) data.thresholdPercent = threshold;
  }
  if (input.notes !== undefined) data.notes = cleanText(input.notes, 20_000);
  if (input.report !== undefined) data.report = cleanText(input.report, 20_000);
  const record = await db.budgetYear.upsert({ where: { startYear }, create: { startYear, ...data }, update: data });
  return yearView(record);
}

// ---- Subscriptions --------------------------------------------------------

const SUBSCRIPTION_INCLUDE = { subscription: true, budgetYear: { select: { startYear: true } } } as const;

export async function readBudgetSubscriptionsForYear(budgetYearId: number): Promise<BudgetSubscriptionYearView[]> {
  const records = await db.budgetSubscriptionYear.findMany({
    where: { budgetYearId },
    include: SUBSCRIPTION_INCLUDE,
    orderBy: [{ subscription: { name: "asc" } }, { id: "asc" }],
  });
  return records.map(subscriptionYearView);
}

// Every subscription in every year, for the year-over-year view and inc %.
export async function readBudgetSubscriptionHistory(): Promise<BudgetSubscriptionYearView[]> {
  const records = await db.budgetSubscriptionYear.findMany({
    include: SUBSCRIPTION_INCLUDE,
    orderBy: [{ subscriptionId: "asc" }, { budgetYear: { startYear: "asc" } }],
  });
  return records.map(subscriptionYearView);
}

export type BudgetSubscriptionInput = {
  name?: unknown;
  category?: unknown;
  amount?: unknown;
  frequency?: unknown;
  status?: unknown;
  tally?: unknown;
  note?: unknown;
  startedOn?: unknown;
  endedOn?: unknown;
};

// YYYY-MM-DD to a stored date; blank or unreadable is null (unknown).
const toStoredDate = (value: unknown) => (isValidBudgetDate(value) ? new Date(`${value}T00:00:00Z`) : null);

// The start and end dates in an input: only the ones that were sent.
function subscriptionDates(input: BudgetSubscriptionInput): { startedOn?: Date | null; endedOn?: Date | null } {
  const dates: { startedOn?: Date | null; endedOn?: Date | null } = {};
  if (input.startedOn !== undefined) dates.startedOn = toStoredDate(input.startedOn);
  if (input.endedOn !== undefined) dates.endedOn = toStoredDate(input.endedOn);
  return dates;
}

// A new subscription, or an existing one (subscriptionId) added to another year.
export async function createBudgetSubscription(
  budgetYearId: number,
  input: BudgetSubscriptionInput,
  subscriptionId?: number,
): Promise<BudgetSubscriptionYearView | null> {
  const amount = parseBudgetMoney(input.amount);
  const name = cleanText(input.name, 200);
  if (amount === null || (!subscriptionId && !name)) return null;
  const dates = subscriptionDates(input);
  const record = await db.$transaction(async (tx) => {
    const parentId =
      subscriptionId ??
      (await tx.budgetSubscription.create({ data: { name, category: cleanText(input.category, 100), ...dates } })).id;
    // Added to another year: dates typed in now replace the stored ones; blanks leave them alone.
    if (subscriptionId) {
      const typed = Object.fromEntries(Object.entries(dates).filter(([, value]) => value !== null));
      if (Object.keys(typed).length) await tx.budgetSubscription.update({ where: { id: subscriptionId }, data: typed });
    }
    return tx.budgetSubscriptionYear.create({
      data: {
        subscriptionId: parentId,
        budgetYearId,
        amount,
        frequency: resolveBudgetFrequency(input.frequency),
        status: resolveBudgetSubscriptionStatus(input.status),
        tally: cleanCount(input.tally, 0),
        note: cleanText(input.note, 2_000),
      },
      include: SUBSCRIPTION_INCLUDE,
    });
  });
  return subscriptionYearView(record);
}

// Name, category and the start/end dates belong to the subscription (all
// years), so a rename keeps its history linked; the rest belongs to this year only.
export async function updateBudgetSubscription(id: number, input: BudgetSubscriptionInput): Promise<BudgetSubscriptionYearView | null> {
  const existing = await db.budgetSubscriptionYear.findUnique({ where: { id } });
  if (!existing) return null;
  const yearData: { amount?: number; frequency?: string; status?: string; tally?: number; note?: string } = {};
  if (input.amount !== undefined) {
    const amount = parseBudgetMoney(input.amount);
    if (amount === null) return null;
    yearData.amount = amount;
  }
  if (input.frequency !== undefined) yearData.frequency = resolveBudgetFrequency(input.frequency);
  if (input.status !== undefined) yearData.status = resolveBudgetSubscriptionStatus(input.status);
  if (input.tally !== undefined) yearData.tally = cleanCount(input.tally, existing.tally);
  if (input.note !== undefined) yearData.note = cleanText(input.note, 2_000);
  const parentData: { name?: string; category?: string; startedOn?: Date | null; endedOn?: Date | null } = subscriptionDates(input);
  if (input.name !== undefined && cleanText(input.name, 200)) parentData.name = cleanText(input.name, 200);
  if (input.category !== undefined) parentData.category = cleanText(input.category, 100);
  const [, record] = await db.$transaction([
    db.budgetSubscription.update({ where: { id: existing.subscriptionId }, data: parentData }),
    db.budgetSubscriptionYear.update({ where: { id }, data: yearData, include: SUBSCRIPTION_INCLUDE }),
  ]);
  return subscriptionYearView(record);
}

// The same subscription in another year (case-insensitive name), so adding
// it again keeps its history linked.
export async function findBudgetSubscriptionIdByName(name: unknown): Promise<number | null> {
  const text = cleanText(name, 200);
  if (!text) return null;
  const record = await db.budgetSubscription.findFirst({ where: { name: { equals: text, mode: "insensitive" } }, select: { id: true } });
  return record?.id ?? null;
}

export async function readBudgetSubscriptionNames(): Promise<string[]> {
  const records = await db.budgetSubscription.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return records.map((record) => record.name);
}

// Ended: kept with the payments made, not counted in totals. The end date
// is today (NZ) unless one is already stored.
export async function endBudgetSubscription(id: number, tally: unknown, now = new Date()) {
  const existing = await db.budgetSubscriptionYear.findUnique({ where: { id }, select: { subscription: { select: { endedOn: true } } } });
  if (!existing) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: NZ_TIME_ZONE }).format(now);
  return updateBudgetSubscription(id, { status: "ended", tally, ...(existing.subscription.endedOn ? {} : { endedOn: today }) });
}

export async function deleteBudgetSubscription(id: number) {
  await db.budgetSubscriptionYear.deleteMany({ where: { id } });
}

// A new year: every subscription that has not ended carries forward with the
// same amount and frequency (not ended = active, with no end date before the
// new year starts on 1 July); ones already in the new year are left as they are.
export async function copyActiveBudgetSubscriptions(fromStartYear: number, toStartYear: number): Promise<number> {
  const [from, to] = await Promise.all([ensureBudgetYear(fromStartYear), ensureBudgetYear(toStartYear)]);
  const newYearStart = new Date(`${toStartYear}-07-01T00:00:00Z`);
  const active = await db.budgetSubscriptionYear.findMany({
    where: { budgetYearId: from.id, status: "active", subscription: { OR: [{ endedOn: null }, { endedOn: { gte: newYearStart } }] } },
  });
  const result = await db.budgetSubscriptionYear.createMany({
    data: active.map((record) => ({
      subscriptionId: record.subscriptionId,
      budgetYearId: to.id,
      amount: record.amount,
      frequency: record.frequency,
      status: "active",
      tally: 0,
      note: "",
    })),
    skipDuplicates: true,
  });
  return result.count;
}

// ---- Purchases ------------------------------------------------------------

export async function readBudgetExpensesForYear(budgetYearId: number): Promise<BudgetExpenseView[]> {
  const records = await db.budgetExpense.findMany({
    where: { budgetYearId },
    orderBy: [{ group: "asc" }, { spentOn: "asc" }, { id: "asc" }],
  });
  return records.map(expenseView);
}

export async function readAllBudgetExpenses(): Promise<BudgetExpenseView[]> {
  const records = await db.budgetExpense.findMany({ orderBy: [{ budgetYearId: "asc" }, { id: "asc" }] });
  return records.map(expenseView);
}

export type BudgetExpenseInput = {
  supplier?: unknown;
  group?: unknown;
  amount?: unknown;
  note?: unknown;
  spentOn?: unknown;
};

function expenseData(input: BudgetExpenseInput) {
  const data: { supplier?: string; group?: string; amount?: number; note?: string; spentOn?: Date | null } = {};
  if (input.supplier !== undefined) data.supplier = cleanText(input.supplier, 200);
  if (input.group !== undefined) data.group = cleanText(input.group, 100);
  if (input.amount !== undefined) {
    const amount = parseBudgetMoney(input.amount);
    if (amount !== null) data.amount = amount;
  }
  if (input.note !== undefined) data.note = cleanText(input.note, 2_000);
  if (input.spentOn !== undefined) data.spentOn = isValidBudgetDate(input.spentOn) ? new Date(`${input.spentOn}T00:00:00Z`) : null;
  return data;
}

// The financial year a purchase belongs to: the year of its date spent when
// there is one, otherwise the year it is added to.
async function expenseYearId(spentOn: Date | null | undefined, fallbackStartYear: number): Promise<number> {
  const startYear = spentOn ? financialYearOfMonth(spentOn.toISOString().slice(0, 7)) : fallbackStartYear;
  return (await ensureBudgetYear(startYear)).id;
}

export async function createBudgetExpense(startYear: number, input: BudgetExpenseInput): Promise<BudgetExpenseView | null> {
  const data = expenseData(input);
  if (!data.supplier || data.amount === undefined) return null;
  const budgetYearId = await expenseYearId(data.spentOn, startYear);
  const record = await db.budgetExpense.create({
    data: { budgetYearId, supplier: data.supplier, group: data.group || data.supplier, amount: data.amount, note: data.note ?? "", spentOn: data.spentOn ?? null, source: "manual" },
  });
  return expenseView(record);
}

// Meta rows come from the Meta results and are read-only here. A new date
// spent moves the purchase to that date's financial year.
export async function updateBudgetExpense(id: number, input: BudgetExpenseInput): Promise<boolean> {
  const existing = await db.budgetExpense.findUnique({ where: { id }, include: { budgetYear: { select: { startYear: true } } } });
  if (!existing || existing.source === "meta") return false;
  const data = expenseData(input);
  if (data.supplier === "") delete data.supplier;
  const budgetYearId = data.spentOn ? await expenseYearId(data.spentOn, existing.budgetYear.startYear) : undefined;
  const result = await db.budgetExpense.updateMany({ where: { id, source: { not: "meta" } }, data: { ...data, ...(budgetYearId ? { budgetYearId } : {}) } });
  return result.count > 0;
}

export async function deleteBudgetExpense(id: number): Promise<boolean> {
  const result = await db.budgetExpense.deleteMany({ where: { id, source: { not: "meta" } } });
  return result.count > 0;
}

// ---- Purchase categories ----------------------------------------------------
// A category is not a record: it is the group its purchases share (the
// supplier when a purchase has no group), the same rule as expenseGroup in
// analytics/budget.ts. A category holding Meta rows can't be renamed or
// deleted: those rows are read-only and each new month arrives as
// META_EXPENSE_GROUP again.

const categoryOf = (record: { group: string; supplier: string }) => record.group.trim() || record.supplier.trim() || "Other";

// Renames in every year, so the category stays one line in Year Over Year.
export async function renameBudgetExpenseCategory(from: unknown, to: unknown): Promise<boolean> {
  const name = cleanText(to, 100);
  if (typeof from !== "string" || !name) return false;
  const records = await db.budgetExpense.findMany({ select: { id: true, group: true, supplier: true, source: true } });
  const matches = records.filter((record) => categoryOf(record) === from);
  if (matches.length === 0 || matches.some((record) => record.source === "meta")) return false;
  await db.$transaction([
    db.budgetExpense.updateMany({ where: { id: { in: matches.map((record) => record.id) } }, data: { group: name } }),
    // Its additional budget follows the category.
    db.budgetAdditional.updateMany({ where: { category: from }, data: { category: name } }),
  ]);
  return true;
}

// Deletes the category's purchases in one financial year only.
export async function deleteBudgetExpenseCategory(startYear: number, category: unknown): Promise<boolean> {
  if (typeof category !== "string") return false;
  const year = await db.budgetYear.findUnique({ where: { startYear } });
  if (!year) return false;
  const records = await db.budgetExpense.findMany({ where: { budgetYearId: year.id }, select: { id: true, group: true, supplier: true, source: true } });
  const matches = records.filter((record) => categoryOf(record) === category);
  if (matches.length === 0 || matches.some((record) => record.source === "meta")) return false;
  await db.$transaction([
    db.budgetExpense.deleteMany({ where: { id: { in: matches.map((record) => record.id) } } }),
    db.budgetAdditional.deleteMany({ where: { budgetYearId: year.id, category } }),
  ]);
  return true;
}

// ---- Additional budget ------------------------------------------------------
// Extra budget given for one purchase category in one year. It is part of the
// year's budget (not on top of it) and a one-off: analytics/budget.ts keeps
// its category's purchases out of the carried-forward prediction and out of
// next year's expected purchases.

export async function readBudgetAdditionalForYear(budgetYearId: number): Promise<BudgetAdditionalView[]> {
  const records = await db.budgetAdditional.findMany({ where: { budgetYearId }, orderBy: [{ category: "asc" }, { id: "asc" }] });
  return records.map((record) => ({ id: record.id, budgetYearId: record.budgetYearId, category: record.category, amount: toNumber(record.amount) }));
}

// One amount per category and year. A blank or zero amount removes it; an
// unreadable or negative one is refused.
export async function setBudgetAdditional(startYear: number, categoryInput: unknown, amountInput: unknown): Promise<boolean> {
  const category = cleanText(categoryInput, 100);
  if (!category) return false;
  const blank = String(amountInput ?? "").trim() === "";
  const amount = blank ? 0 : parseBudgetMoney(amountInput);
  if (amount === null || amount < 0) return false;
  const year = await ensureBudgetYear(startYear);
  await db.$transaction([
    db.budgetAdditional.deleteMany({ where: { budgetYearId: year.id, category } }),
    ...(amount > 0 ? [db.budgetAdditional.create({ data: { budgetYearId: year.id, category, amount } })] : []),
  ]);
  return true;
}

// One row per month of Meta spend, updated in place on each refresh.
export async function upsertMetaBudgetExpense(month: string, amount: number): Promise<void> {
  if (!isValidBudgetMonth(month)) throw new Error(`Invalid month: ${month}`);
  const year = await ensureBudgetYear(financialYearOfMonth(month));
  const rounded = Math.round(amount * 100) / 100;
  await db.budgetExpense.upsert({
    where: { source_sourceMonth: { source: "meta", sourceMonth: month } },
    create: {
      budgetYearId: year.id,
      supplier: META_EXPENSE_SUPPLIER,
      group: META_EXPENSE_GROUP,
      amount: rounded,
      spentOn: new Date(`${month}-01T00:00:00Z`),
      source: "meta",
      sourceMonth: month,
    },
    update: { amount: rounded, budgetYearId: year.id },
  });
}

// When the user last added an expense by hand (Meta and imported rows are
// not the user adding anything), for the landing reminder.
export async function readManualBudgetExpensesAddedSince(since: Date): Promise<Array<{ createdAt: Date; spentOn: string | null }>> {
  const records = await db.budgetExpense.findMany({
    where: { source: "manual", createdAt: { gte: since } },
    select: { createdAt: true, spentOn: true },
    orderBy: { createdAt: "desc" },
  });
  return records.map((record) => ({ createdAt: record.createdAt, spentOn: toDateText(record.spentOn) }));
}

export async function readBudgetReminderDismissals(months: readonly string[]): Promise<Set<string>> {
  const records = await db.budgetReminderDismissal.findMany({ where: { month: { in: [...months] } }, select: { month: true } });
  return new Set(records.map((record) => record.month));
}

// One year with everything in it, created empty if it is not there yet.
export async function readBudgetYearData(startYear: number) {
  const year = await ensureBudgetYear(startYear);
  const [subscriptions, expenses, futureSpends, additionalBudgets] = await Promise.all([
    readBudgetSubscriptionsForYear(year.id),
    readBudgetExpensesForYear(year.id),
    readBudgetFutureSpendsForYear(year.id),
    readBudgetAdditionalForYear(year.id),
  ]);
  return { year, subscriptions, expenses, futureSpends, additionalBudgets };
}

// Every stored year with its rows, oldest first (no years are created).
export async function readAllBudgetYearData() {
  const years = await readBudgetYears();
  return Promise.all(years.map((year) => readBudgetYearData(year.startYear)));
}

export async function readLatestManualBudgetExpenseAddedAt(): Promise<Date | null> {
  const record = await db.budgetExpense.findFirst({ where: { source: "manual" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return record?.createdAt ?? null;
}

// ---- Future spends --------------------------------------------------------

export async function readBudgetFutureSpendsForYear(budgetYearId: number): Promise<BudgetFutureSpendView[]> {
  const records = await db.budgetFutureSpend.findMany({ where: { budgetYearId }, orderBy: [{ status: "asc" }, { id: "asc" }] });
  return records.map(futureSpendView);
}

export type BudgetFutureSpendInput = {
  project?: unknown;
  supplier?: unknown;
  amount?: unknown;
  qty?: unknown;
  note?: unknown;
  status?: unknown;
};

function futureSpendData(input: BudgetFutureSpendInput) {
  const data: { project?: string; supplier?: string; amount?: number; qty?: number; note?: string; status?: string } = {};
  if (input.project !== undefined) data.project = cleanText(input.project, 200);
  if (input.supplier !== undefined) data.supplier = cleanText(input.supplier, 200);
  if (input.amount !== undefined) {
    const amount = parseBudgetMoney(input.amount);
    if (amount !== null) data.amount = amount;
  }
  if (input.qty !== undefined) data.qty = Math.max(1, cleanCount(input.qty, 1));
  if (input.note !== undefined) data.note = cleanText(input.note, 2_000);
  // Bought is only reached through markBudgetFutureSpendBought.
  if (input.status !== undefined) {
    const status = resolveBudgetFutureStatus(input.status);
    if (status !== "bought") data.status = status;
  }
  return data;
}

export async function createBudgetFutureSpend(budgetYearId: number, input: BudgetFutureSpendInput): Promise<BudgetFutureSpendView | null> {
  const data = futureSpendData(input);
  if (!data.project || data.amount === undefined) return null;
  const record = await db.budgetFutureSpend.create({
    data: { budgetYearId, project: data.project, supplier: data.supplier ?? "", amount: data.amount, qty: data.qty ?? 1, note: data.note ?? "", status: data.status ?? "planned" },
  });
  return futureSpendView(record);
}

export async function updateBudgetFutureSpend(id: number, input: BudgetFutureSpendInput): Promise<boolean> {
  const result = await db.budgetFutureSpend.updateMany({ where: { id, status: { not: "bought" } }, data: futureSpendData(input) });
  return result.count > 0;
}

export async function deleteBudgetFutureSpend(id: number): Promise<boolean> {
  const result = await db.budgetFutureSpend.deleteMany({ where: { id, status: { not: "bought" } } });
  return result.count > 0;
}

// A future spend's category is its project, within one financial year.
// Rename covers every spend in it; delete only those still to buy (a bought
// one is a purchase now and stays).
export async function renameBudgetFutureCategory(startYear: number, from: unknown, to: unknown): Promise<boolean> {
  const name = cleanText(to, 200);
  if (typeof from !== "string" || !name) return false;
  const year = await db.budgetYear.findUnique({ where: { startYear } });
  if (!year) return false;
  const result = await db.budgetFutureSpend.updateMany({ where: { budgetYearId: year.id, project: from }, data: { project: name } });
  return result.count > 0;
}

export async function deleteBudgetFutureCategory(startYear: number, category: unknown): Promise<boolean> {
  if (typeof category !== "string") return false;
  const year = await db.budgetYear.findUnique({ where: { startYear } });
  if (!year) return false;
  const result = await db.budgetFutureSpend.deleteMany({ where: { budgetYearId: year.id, project: category, status: { not: "bought" } } });
  return result.count > 0;
}

// Bought: the future spend becomes a purchase (amount x qty) in the same
// year, and stays linked to it. The group defaults to the project name.
export async function markBudgetFutureSpendBought(
  id: number,
  options: { spentOn?: unknown; group?: unknown } = {},
): Promise<BudgetExpenseView | null> {
  const { spentOn } = options;
  const group = cleanText(options.group, 100);
  return db.$transaction(async (tx) => {
    const spend = await tx.budgetFutureSpend.findUnique({ where: { id } });
    if (!spend || spend.status === "bought") return null;
    const expense = await tx.budgetExpense.create({
      data: {
        budgetYearId: spend.budgetYearId,
        supplier: spend.supplier || spend.project,
        group: group || spend.project,
        amount: Math.round(toNumber(spend.amount) * spend.qty * 100) / 100,
        note: spend.note,
        spentOn: isValidBudgetDate(spentOn) ? new Date(`${spentOn}T00:00:00Z`) : null,
        source: "manual",
      },
    });
    await tx.budgetFutureSpend.update({ where: { id }, data: { status: "bought", expenseId: expense.id } });
    return expenseView(expense);
  });
}

// ---- Landing reminder dismissals ------------------------------------------

export async function readBudgetReminderDismissal(month: string): Promise<Date | null> {
  const record = await db.budgetReminderDismissal.findUnique({ where: { month } });
  return record?.dismissedAt ?? null;
}

// Covers that month only; dismissing again records the new time.
export async function dismissBudgetReminder(month: string): Promise<Date> {
  if (!isValidBudgetMonth(month)) throw new Error(`Invalid month: ${month}`);
  const dismissedAt = new Date();
  await db.budgetReminderDismissal.upsert({ where: { month }, create: { month, dismissedAt }, update: { dismissedAt } });
  return dismissedAt;
}
