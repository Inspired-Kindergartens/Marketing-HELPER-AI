// Imports the Budget Calculator workbooks (extracted once into
// data/budget-history.json) into the Budget tables.
//
//   npx tsx scripts/budget-import.ts          dry run: per-year totals vs each workbook
//   npx tsx scripts/budget-import.ts --apply  saves them
//
// Idempotent: a year that already has imported purchases is left alone, a
// year's budget and notes are only filled when empty, and subscriptions are
// matched by name, so running it again changes nothing.
import { readFileSync } from "node:fs";

import { BUDGET_IMPORTED_THROUGH, computeBudgetTotals, type BudgetYearData } from "../src/analytics/budget.js";
import { prisma } from "../src/db.js";
import {
  ensureBudgetYear,
  financialYearLabel,
  resolveBudgetFrequency,
  resolveBudgetFutureStatus,
  resolveBudgetSubscriptionStatus,
  type BudgetExpenseView,
  type BudgetFutureSpendView,
  type BudgetSubscriptionYearView,
} from "../src/storage/budget-store.js";

type HistoryFile = {
  source: string;
  importedThrough: string;
  years: Array<{
    startYear: number;
    operatingBudget: number;
    notes: string;
    subscriptions: Array<{ key: string; name: string | null; amount: number; frequency: string; status: string; tally: number; note: string }>;
    expenses: Array<{ supplier: string; group: string; amount: number; note: string }>;
    futureSpends: Array<{ project: string; supplier: string; amount: number; qty: number; note: string; status: string }>;
    workbook: Record<string, number | string>;
  }>;
};

const apply = process.argv.includes("--apply");
const history = JSON.parse(readFileSync(new URL("../data/budget-history.json", import.meta.url), "utf8")) as HistoryFile;
if (history.importedThrough !== BUDGET_IMPORTED_THROUGH) {
  throw new Error(`data/budget-history.json importedThrough ${history.importedThrough} does not match BUDGET_IMPORTED_THROUGH ${BUDGET_IMPORTED_THROUGH}`);
}

// The display name for each subscription key is its latest year's name.
const names = new Map<string, string>();
for (const year of history.years) for (const sub of year.subscriptions) if (sub.name) names.set(sub.key, sub.name);

const money = (value: number | null | undefined) => (value == null ? "-" : value.toFixed(2).padStart(10));

function asYearData(year: HistoryFile["years"][number]): BudgetYearData {
  const created = "2026-11-12T00:00:00.000Z";
  return {
    year: { id: year.startYear, startYear: year.startYear, label: financialYearLabel(year.startYear), operatingBudget: year.operatingBudget, thresholdPercent: 2, notes: year.notes, report: "", outlook: "", updatedAt: created },
    additionalBudgets: [],
    // The workbooks carried every purchase forward.
    projectedCategories: [...new Set(year.expenses.map((expense) => expense.group.trim() || expense.supplier.trim() || "Other"))],
    subscriptions: year.subscriptions.map((sub, index): BudgetSubscriptionYearView => ({
      id: index, subscriptionId: index, budgetYearId: year.startYear, startYear: year.startYear, name: names.get(sub.key) ?? sub.key, category: "",
      amount: sub.amount, frequency: resolveBudgetFrequency(sub.frequency), status: resolveBudgetSubscriptionStatus(sub.status), tally: sub.tally, note: sub.note, startedOn: null, endedOn: null, createdAt: created,
    })),
    expenses: year.expenses.map((expense, index): BudgetExpenseView => ({
      id: index, budgetYearId: year.startYear, supplier: expense.supplier, group: expense.group, amount: expense.amount, note: expense.note, spentOn: null, source: "import", sourceMonth: null, createdAt: created,
    })),
    futureSpends: year.futureSpends.map((spend, index): BudgetFutureSpendView => ({
      id: index, budgetYearId: year.startYear, project: spend.project, supplier: spend.supplier, amount: spend.amount, qty: spend.qty, note: spend.note, status: resolveBudgetFutureStatus(spend.status), expenseId: null, createdAt: created,
    })),
  };
}

console.log(history.source);
console.log(`Purchases imported through ${history.importedThrough}; Meta spend fills later months.\n`);
for (const year of history.years) {
  const totals = computeBudgetTotals(asYearData(year), new Date());
  const book = year.workbook;
  console.log(`${totals.label}  (${year.subscriptions.length} subscriptions, ${year.expenses.length} purchases, ${year.futureSpends.length} future spends)`);
  console.log(`                      app          workbook`);
  console.log(`  Subscriptions  ${money(totals.subscriptions)}  ${money(book.subscriptions as number)}`);
  console.log(`  Purchases      ${money(totals.purchases)}  ${money(book.purchases as number)}`);
  console.log(`  Future spends  ${money(totals.futureSpends)}  ${money(book.futureSpends as number | undefined)}`);
  console.log(`  Ended subs     ${money(totals.endedSubscriptions)}  ${money(book.endedSubscriptions as number)}`);
  console.log(`  Actual spend   ${money(totals.actualSpend)}  ${money(book.actualSpend as number)}${book.note ? `   (${book.note})` : ""}`);
  console.log(`  Remaining      ${money(totals.remaining)}  ${money(book.remaining as number | undefined)}`);
  console.log("");
}

if (!apply) {
  console.log("Dry run. Run with --apply to save.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const year of history.years) {
  const label = financialYearLabel(year.startYear);
  const stored = await ensureBudgetYear(year.startYear);
  const already = await prisma.budgetExpense.count({ where: { budgetYearId: stored.id, source: "import" } });
  if (already > 0) {
    console.log(`${label}: already imported (${already} purchases), left as it is.`);
    continue;
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.budgetYear.findUniqueOrThrow({ where: { id: stored.id } });
    await tx.budgetYear.update({
      where: { id: stored.id },
      data: {
        operatingBudget: current.operatingBudget ?? year.operatingBudget,
        notes: current.notes.trim() ? current.notes : year.notes,
      },
    });
    for (const sub of year.subscriptions) {
      const name = names.get(sub.key) ?? sub.key;
      const parent = (await tx.budgetSubscription.findFirst({ where: { name } })) ?? (await tx.budgetSubscription.create({ data: { name } }));
      const data = { amount: sub.amount, frequency: resolveBudgetFrequency(sub.frequency), status: resolveBudgetSubscriptionStatus(sub.status), tally: sub.tally, note: sub.note };
      await tx.budgetSubscriptionYear.upsert({
        where: { subscriptionId_budgetYearId: { subscriptionId: parent.id, budgetYearId: stored.id } },
        create: { subscriptionId: parent.id, budgetYearId: stored.id, ...data },
        update: {},
      });
    }
    await tx.budgetExpense.createMany({
      data: year.expenses.map((expense) => ({ budgetYearId: stored.id, supplier: expense.supplier, group: expense.group, amount: expense.amount, note: expense.note, spentOn: null, source: "import" })),
    });
    const futureCount = await tx.budgetFutureSpend.count({ where: { budgetYearId: stored.id } });
    if (futureCount === 0) {
      await tx.budgetFutureSpend.createMany({
        data: year.futureSpends.map((spend) => ({ budgetYearId: stored.id, project: spend.project, supplier: spend.supplier, amount: spend.amount, qty: spend.qty, note: spend.note, status: resolveBudgetFutureStatus(spend.status) })),
      });
    }
  });
  console.log(`${label}: imported.`);
}
await prisma.$disconnect();
