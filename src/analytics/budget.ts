// Budget calculations, taken from the yearly "Budget Calculator" workbooks.
// Pure functions only: the store reads, these work it out, the page and the
// AI grounding show it.
import {
  financialYearLabel,
  financialYearOf,
  financialYearOfMonth,
  nzMonthOf,
  type BudgetAdditionalView,
  type BudgetExpenseView,
  type BudgetFrequency,
  type BudgetFutureSpendView,
  type BudgetSubscriptionYearView,
  type BudgetYearView,
} from "../storage/budget-store.js";

// The workbooks' purchases run to here (the 2026-27 workbook was last saved on
// 1 Oct 2026). Meta spend is added from the month after, so nothing is
// counted twice. Must match importedThrough in data/budget-history.json.
export const BUDGET_IMPORTED_THROUGH = "2026-09";

export const PAYMENTS_PER_YEAR: Record<BudgetFrequency, number> = { week: 52, fortnight: 26, month: 12, quarter: 4, year: 1 };

// The workbooks take GST off the subscriptions' yearly total only; purchases
// and desire spends are used as entered.
export const GST_DIVISOR = 1.15;

const round2 = (value: number) => Math.round(value * 100) / 100;

export function subscriptionYearlyCost(subscription: Pick<BudgetSubscriptionYearView, "amount" | "frequency">): number {
  return round2(subscription.amount * PAYMENTS_PER_YEAR[subscription.frequency]);
}

// Ended subscriptions: what was paid (amount x payments made).
export function endedSubscriptionCost(subscription: Pick<BudgetSubscriptionYearView, "amount" | "tally">): number {
  return round2(subscription.amount * subscription.tally);
}

// Months of the financial year counted so far, the current month included
// (the workbook's DATEDIF(FYStart, EOMONTH(today)) + 1). A closed year is 12,
// a year not started yet is 0. The workbook used today's date for every year,
// so a closed year predicted $203k; counting inside that year fixes it.
export function monthsElapsedInYear(startYear: number, now: Date): number {
  const current = financialYearOf(now);
  if (current > startYear) return 12;
  if (current < startYear) return 0;
  const month = Number(nzMonthOf(now).slice(5, 7));
  return month >= 7 ? month - 6 : month + 6;
}

// Purchases so far plus the same monthly average for the months left.
export function predictPurchases(purchasesYtd: number, monthsElapsed: number): number {
  if (monthsElapsed <= 0 || monthsElapsed >= 12) return round2(purchasesYtd);
  return round2(purchasesYtd + (purchasesYtd / monthsElapsed) * (12 - monthsElapsed));
}

export type BudgetStatus = "surplus" | "on-track" | "deficit";

export function budgetStatus(difference: number, base: number, thresholdPercent: number): BudgetStatus {
  if (base <= 0) return difference < 0 ? "deficit" : "on-track";
  const percent = (difference / base) * 100;
  if (percent < -thresholdPercent) return "deficit";
  if (percent > thresholdPercent) return "surplus";
  return "on-track";
}

// ---- Prediction error and threshold -------------------------------------------
// The only guessed part of the prediction is the purchases for the months
// still to come in the categories ticked "In predictions" (their monthly
// average so far x months left). predictionError is one standard error of
// that guess, in dollars:
//   - sd = how much those categories' monthly totals have swung so far
//   - error = sd x sqrt(left x (1 + left / elapsed))
//     (the months left each vary by sd, and the average itself is only as
//     good as the months it was taken from)
//   - with under 3 months there is no swing to measure: half the guess
// So it is widest early in the year or when spending is lumpy, narrows as
// the months fill in, and is 0 for a finished year or when nothing is ticked.
export function budgetPredictionError(data: BudgetYearData, monthsElapsed: number, carried: number, predictedCarried: number): number {
  const left = 12 - monthsElapsed;
  if (left <= 0 || monthsElapsed <= 0) return 0;
  if (monthsElapsed < 3) return (predictedCarried - carried) / 2;
  // Purchases per month of the year so far (July = 0). Undated purchases
  // can't be placed in a month, so they add nothing to the swing.
  const projected = new Set(data.projectedCategories);
  const monthly = new Array<number>(monthsElapsed).fill(0);
  for (const expense of data.expenses) {
    if (!projected.has(expenseGroup(expense))) continue;
    if (!expense.spentOn || financialYearOfMonth(expense.spentOn.slice(0, 7)) !== data.year.startYear) continue;
    const month = Number(expense.spentOn.slice(5, 7));
    const index = month >= 7 ? month - 7 : month + 5;
    if (index < monthsElapsed) monthly[index] += expense.amount;
  }
  const mean = monthly.reduce((sum, value) => sum + value, 0) / monthsElapsed;
  const sd = Math.sqrt(monthly.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (monthsElapsed - 1));
  return sd * Math.sqrt(left * (1 + left / monthsElapsed));
}

// How far the predicted spend may sit from the budget and still be "on
// track". Worked out, never typed in and never shown: the prediction error
// as a % of the predicted spend, kept between 2% (the workbook's fixed
// figure) and 10%.
export const BUDGET_THRESHOLD_MIN_PERCENT = 2;
export const BUDGET_THRESHOLD_MAX_PERCENT = 10;

export function budgetThresholdPercent(predictionError: number, predictedSpend: number): number {
  if (predictedSpend <= 0) return BUDGET_THRESHOLD_MIN_PERCENT;
  const percent = (predictionError / predictedSpend) * 100;
  return Math.round(Math.min(BUDGET_THRESHOLD_MAX_PERCENT, Math.max(BUDGET_THRESHOLD_MIN_PERCENT, percent)) * 10) / 10;
}

// ---- Desire spends ------------------------------------------------------------
// Desire spends (the wish list) are never part of the predicted spend. Their
// likelihood is the chance the predicted surplus covers all of them: the
// surplus less their total, against how far off that could be (the
// prediction error, plus half of the spends still marked TBC, whose price is
// not settled). With nothing left to guess it is simply 100 or 0.
function normalCdf(z: number): number {
  // Abramowitz & Stegun 26.2.17 (accurate to 7.5e-8).
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail = Math.exp(-(z * z) / 2) * 0.3989422804014327 * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

export function desireSpendLikelihood(predictedSurplus: number, desireSpends: number, predictionError: number, tbc: number): number {
  const margin = predictedSurplus - desireSpends;
  const spread = Math.sqrt(predictionError ** 2 + (tbc / 2) ** 2);
  if (spread <= 0) return margin >= 0 ? 100 : 0;
  return normalCdf(margin / spread) * 100;
}

export type BudgetSubscriptionRow = BudgetSubscriptionYearView & {
  yearlyCost: number;
  // Change against the same subscription's yearly cost the year before; null
  // when it was not there or cost nothing.
  increasePercent: number | null;
  endedCost: number;
};

export type BudgetGroupTotal = { group: string; total: number; percentOfPurchases: number; count: number };

export type BudgetTotals = {
  startYear: number;
  label: string;
  operatingBudget: number | null;
  thresholdPercent: number; // worked out (budgetThresholdPercent), never shown
  subscriptionsGross: number; // active yearly costs as entered
  subscriptions: number; // ÷ 1.15
  purchases: number; // year to date
  additionalBudget: number; // part of operatingBudget, one-off
  baseBudget: number | null; // operatingBudget - additionalBudget
  oneOffPurchases: number; // purchases in the additional budgets' categories
  futureSpends: number; // desire spends not yet bought; never in the predicted spend
  // What the predicted surplus leaves once every desire spend is bought, and
  // the chance (0-100) it covers them all; null with no budget or none to buy.
  desireRemaining: number | null;
  desireLikelihood: number | null;
  // Follow-through: every desire spend listed in the year, and those bought.
  desireListed: number;
  desireBought: number;
  desireListedCount: number;
  desireBoughtCount: number;
  // Like for like: the predicted spend without the one-off categories (the
  // ones given additional budget), to set against baseBudget.
  basePredictedSpend: number;
  subscriptionsPercent: number | null; // of the budget: committed before the year starts
  outlook: BudgetYearView["outlook"]; // the type of year the user chose
  predictionError: number; // dollars the predicted spend could be off by
  endedSubscriptions: number; // shown, not totalled
  actualSpend: number;
  remaining: number | null;
  spentPercent: number | null;
  remainingPercent: number | null;
  monthsElapsed: number;
  predictedPurchases: number;
  predictedSpend: number;
  predictedDifference: number | null; // budget - predicted (negative = deficit)
  predictedPercent: number | null; // of the predicted spend, as the workbook
  status: BudgetStatus | null;
};

export type BudgetYearData = {
  year: BudgetYearView;
  subscriptions: BudgetSubscriptionYearView[];
  expenses: BudgetExpenseView[];
  futureSpends: BudgetFutureSpendView[];
  additionalBudgets: BudgetAdditionalView[];
  // Purchase categories ticked "In predictions" (opt-in, the same for every year).
  projectedCategories: string[];
};

// Purchases for the whole year: a category ticked "In predictions" carries
// on at its monthly average for the months left; the rest count as spent.
export function predictYearPurchases(expenses: BudgetExpenseView[], projectedCategories: readonly string[], monthsElapsed: number): { carried: number; predictedCarried: number; total: number } {
  const projected = new Set(projectedCategories);
  let carried = 0;
  let fixed = 0;
  for (const expense of expenses) {
    if (projected.has(expenseGroup(expense))) carried += expense.amount;
    else fixed += expense.amount;
  }
  const predictedCarried = predictPurchases(round2(carried), monthsElapsed);
  return { carried: round2(carried), predictedCarried, total: round2(predictedCarried + fixed) };
}

// Purchase categories paid for by additional budget: one-offs, not expected
// again the next year.
export function oneOffCategories(data: Pick<BudgetYearData, "additionalBudgets">): Set<string> {
  return new Set(data.additionalBudgets.filter((additional) => additional.amount > 0).map((additional) => additional.category));
}

export function futureSpendTotal(spend: Pick<BudgetFutureSpendView, "amount" | "qty">): number {
  return round2(spend.amount * spend.qty);
}

export function expenseGroup(expense: Pick<BudgetExpenseView, "group" | "supplier">): string {
  return expense.group.trim() || expense.supplier.trim() || "Other";
}

export function computeBudgetTotals(data: BudgetYearData, now: Date): BudgetTotals {
  const active = data.subscriptions.filter((subscription) => subscription.status === "active");
  const ended = data.subscriptions.filter((subscription) => subscription.status === "ended");
  const subscriptionsGross = round2(active.reduce((sum, subscription) => sum + subscriptionYearlyCost(subscription), 0));
  const subscriptions = round2(subscriptionsGross / GST_DIVISOR);
  const purchases = round2(data.expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const futureSpends = round2(data.futureSpends.filter((spend) => spend.status !== "bought").reduce((sum, spend) => sum + futureSpendTotal(spend), 0));
  const endedSubscriptions = round2(ended.reduce((sum, subscription) => sum + endedSubscriptionCost(subscription), 0));
  const actualSpend = round2(subscriptions + purchases);
  const budget = data.year.operatingBudget;
  const monthsElapsed = monthsElapsedInYear(data.year.startYear, now);
  const oneOff = oneOffCategories(data);
  const oneOffPurchases = round2(data.expenses.filter((expense) => oneOff.has(expenseGroup(expense))).reduce((sum, expense) => sum + expense.amount, 0));
  const additionalBudget = round2(data.additionalBudgets.reduce((sum, additional) => sum + additional.amount, 0));
  // Only the categories ticked "In predictions" carry on at the same rate.
  const predicted = predictYearPurchases(data.expenses, data.projectedCategories, monthsElapsed);
  const predictedPurchases = predicted.total;
  // Desire spends are kept out: the prediction is subscriptions and purchases only.
  const predictedSpend = round2(subscriptions + predictedPurchases);
  const predictedDifference = budget == null ? null : round2(budget - predictedSpend);
  const predictionError = budgetPredictionError(data, monthsElapsed, predicted.carried, predicted.predictedCarried);
  const thresholdPercent = budgetThresholdPercent(predictionError, predictedSpend);
  const tbc = data.futureSpends.filter((spend) => spend.status === "tbc").reduce((sum, spend) => sum + futureSpendTotal(spend), 0);
  const hasDesire = data.futureSpends.some((spend) => spend.status !== "bought");
  const bought = data.futureSpends.filter((spend) => spend.status === "bought");
  const basePredictedSpend = round2(subscriptions + predictYearPurchases(data.expenses.filter((expense) => !oneOff.has(expenseGroup(expense))), data.projectedCategories, monthsElapsed).total);
  return {
    startYear: data.year.startYear,
    label: data.year.label,
    operatingBudget: budget,
    thresholdPercent,
    subscriptionsGross,
    subscriptions,
    purchases,
    additionalBudget,
    baseBudget: budget == null ? null : round2(budget - additionalBudget),
    oneOffPurchases,
    futureSpends,
    desireRemaining: predictedDifference == null || !hasDesire ? null : round2(predictedDifference - futureSpends),
    desireLikelihood: predictedDifference == null || !hasDesire ? null : desireSpendLikelihood(predictedDifference, futureSpends, predictionError, tbc),
    predictionError: round2(predictionError),
    desireListed: round2(data.futureSpends.reduce((sum, spend) => sum + futureSpendTotal(spend), 0)),
    desireBought: round2(bought.reduce((sum, spend) => sum + futureSpendTotal(spend), 0)),
    desireListedCount: data.futureSpends.length,
    desireBoughtCount: bought.length,
    basePredictedSpend,
    subscriptionsPercent: budget ? (subscriptions / budget) * 100 : null,
    outlook: data.year.outlook,
    endedSubscriptions,
    actualSpend,
    remaining: budget == null ? null : round2(budget - actualSpend),
    spentPercent: budget ? (actualSpend / budget) * 100 : null,
    remainingPercent: budget ? ((budget - actualSpend) / budget) * 100 : null,
    monthsElapsed,
    predictedPurchases,
    predictedSpend,
    predictedDifference,
    predictedPercent: predictedDifference == null || predictedSpend <= 0 ? null : (predictedDifference / predictedSpend) * 100,
    status: predictedDifference == null ? null : budgetStatus(predictedDifference, predictedSpend, thresholdPercent),
  };
}

// Subscriptions for one year with their yearly cost and the change against
// the year before. `previous` is the same year's predecessor's rows.
export function buildSubscriptionRows(current: BudgetSubscriptionYearView[], previous: BudgetSubscriptionYearView[]): BudgetSubscriptionRow[] {
  const before = new Map(previous.map((row) => [row.subscriptionId, row]));
  return current.map((row) => {
    const yearlyCost = subscriptionYearlyCost(row);
    const last = before.get(row.subscriptionId);
    const lastCost = last ? subscriptionYearlyCost(last) : 0;
    return {
      ...row,
      yearlyCost,
      endedCost: endedSubscriptionCost(row),
      increasePercent: row.status === "active" && last && lastCost > 0 ? ((yearlyCost - lastCost) / lastCost) * 100 : null,
    };
  });
}

// Purchases by group (the workbook's side tallies), biggest first.
export function groupPurchases(expenses: BudgetExpenseView[]): BudgetGroupTotal[] {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const groups = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const key = expenseGroup(expense);
    const entry = groups.get(key) ?? { total: 0, count: 0 };
    entry.total += expense.amount;
    entry.count += 1;
    groups.set(key, entry);
  }
  return [...groups.entries()]
    .map(([group, entry]) => ({ group, total: round2(entry.total), count: entry.count, percentOfPurchases: total > 0 ? (entry.total / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total || a.group.localeCompare(b.group));
}

export type YearOverYearSubscription = {
  subscriptionId: number;
  name: string;
  // Yearly cost per start year (active rows only); null when not active that year.
  costs: Record<number, number | null>;
};

export type YearOverYear = {
  years: number[];
  subscriptions: YearOverYearSubscription[];
  groups: Array<{ group: string; totals: Record<number, number> }>;
  totals: BudgetTotals[];
};

export function percentChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from <= 0) return null;
  return ((to - from) / from) * 100;
}

export function buildYearOverYear(years: BudgetYearData[], now: Date): YearOverYear {
  const startYears = years.map((data) => data.year.startYear).sort((a, b) => a - b);
  const subscriptions = new Map<number, YearOverYearSubscription>();
  const groups = new Map<string, Record<number, number>>();
  for (const data of years) {
    for (const row of data.subscriptions) {
      const entry = subscriptions.get(row.subscriptionId) ?? { subscriptionId: row.subscriptionId, name: row.name, costs: {} };
      entry.costs[data.year.startYear] = row.status === "active" ? subscriptionYearlyCost(row) : null;
      subscriptions.set(row.subscriptionId, entry);
    }
    for (const group of groupPurchases(data.expenses)) {
      const totals = groups.get(group.group) ?? {};
      totals[data.year.startYear] = group.total;
      groups.set(group.group, totals);
    }
  }
  const latestCost = (entry: YearOverYearSubscription) => {
    for (let index = startYears.length - 1; index >= 0; index--) {
      const cost = entry.costs[startYears[index]];
      if (cost != null) return cost;
    }
    return 0;
  };
  return {
    years: startYears,
    // Only subscriptions active in at least one year; ended-only ones have no yearly cost to compare.
    subscriptions: [...subscriptions.values()]
      .filter((entry) => Object.values(entry.costs).some((cost) => cost != null))
      .sort((a, b) => latestCost(b) - latestCost(a) || a.name.localeCompare(b.name)),
    groups: [...groups.entries()]
      .map(([group, totals]) => ({ group, totals }))
      .sort((a, b) => Object.values(b.totals).reduce((s, v) => s + v, 0) - Object.values(a.totals).reduce((s, v) => s + v, 0)),
    totals: [...years].sort((a, b) => a.year.startYear - b.year.startYear).map((data) => computeBudgetTotals(data, now)),
  };
}

// The Year Over Year panel: whole-year figures only. The two latest finished
// financial years are compared with each other; the current year is tracked
// against them (its spend and surplus are the predicted ones).
export type YearComparison = {
  completed: BudgetTotals[]; // oldest first, at most two
  tracking: BudgetTotals | null;
  // The finished years' average surplus (minus = deficit) as a % of their
  // budgets: how these years usually end. Null with no finished year.
  usualSurplusPercent: number | null;
  // Purchases up to the same point of each year: the end of the last
  // complete month of the current year. Null per year when its purchases
  // can't be placed (no dates), and null altogether in the year's first month.
  samePoint: { month: string; purchases: Record<number, number | null> } | null;
  // What the money is spent to achieve, per column year.
  outcomes: Record<number, YearOutcomes>;
};

// ---- Marketing results --------------------------------------------------------
// One month of what the budget is spent to achieve (budget/outcomes.ts reads
// them): children enrolled across every kindergarten (the Enrolment Quality
// roll; null until the month is complete) and the Meta adverts' results.
export type BudgetOutcomeMonth = { month: string; roll: number | null; metaSpend: number; metaLandingViews: number; metaLeads: number };

export type YearOutcomes = {
  startYear: number;
  roll: number | null; // average children enrolled over the year's complete months
  rollMonths: number;
  metaSpend: number;
  metaLandingViews: number;
  metaLeads: number;
  costPerLandingView: number | null;
  costPerLead: number | null;
};

export function buildYearOutcomes(startYear: number, months: readonly BudgetOutcomeMonth[]): YearOutcomes {
  const inYear = months.filter((entry) => financialYearOfMonth(entry.month) === startYear);
  const rolls = inYear.filter((entry) => entry.roll != null).map((entry) => entry.roll!);
  const metaSpend = round2(inYear.reduce((sum, entry) => sum + entry.metaSpend, 0));
  const metaLandingViews = Math.round(inYear.reduce((sum, entry) => sum + entry.metaLandingViews, 0));
  const metaLeads = Math.round(inYear.reduce((sum, entry) => sum + entry.metaLeads, 0));
  return {
    startYear,
    roll: rolls.length ? Math.round((rolls.reduce((sum, value) => sum + value, 0) / rolls.length) * 10) / 10 : null,
    rollMonths: rolls.length,
    metaSpend,
    metaLandingViews,
    metaLeads,
    costPerLandingView: metaLandingViews > 0 ? round2(metaSpend / metaLandingViews) : null,
    costPerLead: metaLeads > 0 ? round2(metaSpend / metaLeads) : null,
  };
}

// Purchases dated in the year's first `monthsComplete` months (July = 1).
// The workbook purchases have no dates: the import year's are known to fall
// on or before BUDGET_IMPORTED_THROUGH, so they count once the point reaches
// it; any other undated purchase can't be placed, so the year has no figure.
export function purchasesToPoint(data: BudgetYearData, monthsComplete: number): number | null {
  const importedIndex = Number(BUDGET_IMPORTED_THROUGH.slice(5, 7)) >= 7 ? Number(BUDGET_IMPORTED_THROUGH.slice(5, 7)) - 6 : Number(BUDGET_IMPORTED_THROUGH.slice(5, 7)) + 6;
  const placeable = data.year.startYear === financialYearOfMonth(BUDGET_IMPORTED_THROUGH) && monthsComplete >= importedIndex;
  let total = 0;
  for (const expense of data.expenses) {
    if (!expense.spentOn) {
      if (!placeable || expense.source !== "import") return null;
      total += expense.amount;
      continue;
    }
    const month = Number(expense.spentOn.slice(5, 7));
    if ((month >= 7 ? month - 6 : month + 6) <= monthsComplete) total += expense.amount;
  }
  return round2(total);
}

export function buildYearComparison(years: BudgetYearData[], now: Date, outcomeMonths: readonly BudgetOutcomeMonth[] = []): YearComparison {
  const current = financialYearOf(now);
  const sorted = [...years].sort((a, b) => a.year.startYear - b.year.startYear);
  const trackingData = sorted.find((data) => data.year.startYear === current);
  const completedData = sorted.filter((data) => data.year.startYear < current).slice(-2);
  const completed = completedData.map((data) => computeBudgetTotals(data, now));
  const tracking = trackingData ? computeBudgetTotals(trackingData, now) : null;
  const surpluses = completed.filter((totals) => totals.operatingBudget && totals.predictedDifference != null).map((totals) => (totals.predictedDifference! / totals.operatingBudget!) * 100);
  const monthsComplete = tracking ? tracking.monthsElapsed - 1 : 0;
  const columns = [...completedData, ...(trackingData ? [trackingData] : [])];
  // The last complete month of the current year, as YYYY-MM (July = month 1).
  const pointMonth = monthsComplete + 6 > 12 ? `${current + 1}-${String(monthsComplete - 6).padStart(2, "0")}` : `${current}-${String(monthsComplete + 6).padStart(2, "0")}`;
  return {
    completed,
    tracking,
    usualSurplusPercent: surpluses.length ? surpluses.reduce((sum, value) => sum + value, 0) / surpluses.length : null,
    samePoint: monthsComplete >= 1 ? { month: pointMonth, purchases: Object.fromEntries(columns.map((data) => [data.year.startYear, purchasesToPoint(data, monthsComplete)])) } : null,
    outcomes: Object.fromEntries(columns.map((data) => [data.year.startYear, buildYearOutcomes(data.year.startYear, outcomeMonths)])),
  };
}

// ---- Landing reminder -----------------------------------------------------

export const BUDGET_REMINDER_DAYS_BEFORE_MONTH_END = 3;

export type BudgetReminderInput = {
  now: Date;
  // Manual expenses: when each was added and the date spent (if given).
  expenses: Array<{ createdAt: Date; spentOn: string | null }>;
  dismissedMonths: ReadonlySet<string>;
};

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function nzDayOfMonth(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric" }).format(date));
}

// A month is covered once an expense was added during it, or an expense
// dated in it was added afterwards.
function monthCovered(month: string, expenses: BudgetReminderInput["expenses"]): boolean {
  return expenses.some((expense) => nzMonthOf(expense.createdAt) === month || (expense.spentOn != null && expense.spentOn.slice(0, 7) === month && nzMonthOf(expense.createdAt) >= month));
}

// The month to remind about, or null. From the 3rd-to-last day of a month,
// when no expense was added that month; it carries into the next month until
// one is added for it or the reminder is dismissed for that month.
export function budgetReminderMonth(input: BudgetReminderInput): string | null {
  const month = nzMonthOf(input.now);
  const due = (candidate: string) => !input.dismissedMonths.has(candidate) && !monthCovered(candidate, input.expenses);
  const last = previousMonth(month);
  if (due(last)) return last;
  const windowStart = daysInMonth(month) - (BUDGET_REMINDER_DAYS_BEFORE_MONTH_END - 1);
  if (nzDayOfMonth(input.now) >= windowStart && due(month)) return month;
  return null;
}

export function monthName(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 15)).toLocaleDateString("en-NZ", { month: "long", timeZone: "UTC" });
}

// ---- AI grounding ---------------------------------------------------------

const BUDGET_PROMPT_PATTERN =
  /\b(budget|budgets|desire|spend|spent|spending|spends|cost|costs|costing|subscription|subscriptions|purchase|purchases|purchased|expense|expenses|forecast|predicted|deficit|surplus|overspend|underspend|financial year|invoice|invoices|money)\b/i;

export function isBudgetPrompt(prompt: string): boolean {
  return BUDGET_PROMPT_PATTERN.test(prompt);
}

const money = (value: number | null) => (value == null ? "not set" : `$${value.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const percent = (value: number | null) => (value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`);

// Everything Beep Beep and General Chat need to answer budget questions:
// the current year in detail, and every year's totals for comparison.
export function buildBudgetGrounding(years: BudgetYearData[], now: Date, outcomeMonths: readonly BudgetOutcomeMonth[] = []): string {
  if (years.length === 0) return "";
  const sorted = [...years].sort((a, b) => a.year.startYear - b.year.startYear);
  const currentStart = financialYearOf(now);
  const current = sorted.find((data) => data.year.startYear === currentStart) ?? sorted[sorted.length - 1];
  const previous = sorted.find((data) => data.year.startYear === current.year.startYear - 1);
  const totals = computeBudgetTotals(current, now);
  const lines: string[] = [
    `Marketing budget (Budget page, financial years 1 July - 30 June; subscriptions are yearly cost excluding GST, purchases as entered).`,
    `Current financial year ${totals.label} (${totals.monthsElapsed} of 12 months):`,
    `- Operating budget ${money(totals.operatingBudget)}; actual spend ${money(totals.actualSpend)} (subscriptions ${money(totals.subscriptions)} + purchases ${money(totals.purchases)}); remaining ${money(totals.remaining)}${totals.remainingPercent == null ? "" : ` (${totals.remainingPercent.toFixed(1)}% of the budget)`}.`,
    `- Predicted spend ${money(totals.predictedSpend)} (subscriptions + predicted purchases ${money(totals.predictedPurchases)}; desire spends are not included); predicted ${totals.predictedDifference != null && totals.predictedDifference < 0 ? "deficit" : "surplus"} ${money(totals.predictedDifference == null ? null : Math.abs(totals.predictedDifference))} (${percent(totals.predictedPercent)}, ${totals.status ?? "no budget set"}).`,
    `- Purchase categories carried on at the same monthly rate in the prediction: ${current.projectedCategories.filter((category) => current.expenses.some((expense) => expenseGroup(expense) === category)).join(", ") || "none"}; the rest count only what was spent.`,
    `- Ended subscriptions (not in totals): ${money(totals.endedSubscriptions)}.`,
  ];
  if (totals.desireLikelihood != null)
    lines.push(`- Desire spends (wish list, not in the predicted spend) ${money(totals.futureSpends)}; after buying all of them the predicted surplus would ${(totals.desireRemaining ?? 0) >= 0 ? `leave ${money(totals.desireRemaining)}` : `be ${money(-(totals.desireRemaining ?? 0))} short`}; likelihood all can be bought this financial year ${totals.desireLikelihood.toFixed(0)}%.`);
  if (totals.additionalBudget > 0)
    lines.push(
      `- Additional budget (a one-off, part of the operating budget, not expected next year): ${current.additionalBudgets.map((additional) => `${additional.category} ${money(additional.amount)}`).join("; ")}; budget without it ${money(totals.baseBudget)}.`,
    );
  const rows = buildSubscriptionRows(current.subscriptions, previous?.subscriptions ?? []);
  const active = rows.filter((row) => row.status === "active");
  if (active.length) {
    lines.push(`Subscriptions ${totals.label} (amount, frequency, yearly cost, change vs last year):`);
    for (const row of active) lines.push(`- ${row.name}: ${money(row.amount)} per ${row.frequency}, ${money(row.yearlyCost)} a year, ${percent(row.increasePercent)}${row.note ? ` (${row.note})` : ""}`);
  }
  const ended = rows.filter((row) => row.status === "ended");
  if (ended.length) lines.push(`Ended subscriptions ${totals.label}: ${ended.map((row) => `${row.name} ${money(row.amount)} x ${row.tally}`).join("; ")}.`);
  const groups = groupPurchases(current.expenses);
  if (groups.length) lines.push(`Purchases ${totals.label} by group: ${groups.map((group) => `${group.group} ${money(group.total)} (${group.percentOfPurchases.toFixed(0)}%)`).join("; ")}.`);
  const future = current.futureSpends.filter((spend) => spend.status !== "bought");
  if (future.length) lines.push(`Desire spends ${totals.label}: ${future.map((spend) => `${spend.project}: ${spend.note || spend.supplier} ${money(futureSpendTotal(spend))}${spend.status === "tbc" ? " (TBC)" : ""}`).join("; ")}.`);
  const report = current.year.report.trim() || current.year.notes.trim();
  if (report) lines.push(`Year report ${totals.label}: ${report.replace(/\s+/g, " ").slice(0, 1500)}`);
  lines.push(`All years:`);
  for (const data of sorted) {
    const year = computeBudgetTotals(data, now);
    lines.push(`- ${year.label}: budget ${money(year.operatingBudget)}, subscriptions ${money(year.subscriptions)}, purchases ${money(year.purchases)}, actual ${money(year.actualSpend)}, remaining ${money(year.remaining)}, ended subscriptions ${money(year.endedSubscriptions)}${year.additionalBudget > 0 ? `, budget without one-offs ${money(year.baseBudget)}, spend without one-offs ${money(year.basePredictedSpend)}` : ""}${year.outlook ? `, marked by the user as a ${year.outlook} year` : ""}.`);
  }
  const results = sorted.map((data) => ({ label: data.year.label, current: data.year.startYear === currentStart, ...buildYearOutcomes(data.year.startYear, outcomeMonths) })).filter((year) => year.roll != null || year.metaSpend > 0);
  if (results.length) {
    lines.push(`Marketing results by financial year (children enrolled = average roll across all kindergartens from Infocare; Meta = Facebook/Instagram adverts):`);
    for (const year of results)
      lines.push(
        `- ${year.label}${year.current ? " (so far)" : ""}: children enrolled ${year.roll == null ? "n/a" : year.roll.toFixed(1)}; Meta ad spend ${money(year.metaSpend)}, landing page views ${year.metaLandingViews} (${year.costPerLandingView == null ? "n/a" : money(year.costPerLandingView)} each), leads ${year.metaLeads} (${year.costPerLead == null ? "n/a" : money(year.costPerLead)} each).`,
      );
  }
  const yoy = buildYearOverYear(sorted, now);
  if (yoy.years.length > 1) {
    lines.push(`Subscription yearly cost by year (${yoy.years.map(financialYearLabel).join(", ")}):`);
    for (const entry of yoy.subscriptions) lines.push(`- ${entry.name}: ${yoy.years.map((year) => (entry.costs[year] == null ? "-" : money(entry.costs[year]!))).join(", ")}`);
  }
  return lines.join("\n");
}

// ---- Year-end report --------------------------------------------------------
// The report for the PDF, written from the figures (no AI, so every number is
// the page's own). The Budget page's Generate report shows it for editing; a
// saved edit (BudgetYear.report) is used instead, otherwise the PDF gets this.
// Same layout as the notes typed into the old workbooks: a heading line
// ending in ":" and "  • " points under it (budget-pdf.ts reads that back).
export function buildBudgetReport(data: BudgetYearData, previous: BudgetYearData | null, now: Date): string {
  const totals = computeBudgetTotals(data, now);
  const last = previous ? computeBudgetTotals(previous, now) : null;
  const start = data.year.startYear;
  const closed = totals.monthsElapsed >= 12;
  const upDown = (from: number, to: number) => (to > from ? "up" : "down");
  const changed = (from: number | null | undefined, to: number | null | undefined) => {
    const change = percentChange(from, to);
    return change == null ? "" : ` (${percent(change)})`;
  };
  const lines: string[] = [];
  const section = (title: string, points: string[]) => {
    if (points.length === 0) return;
    lines.push("", `${title}:`, ...points.map((point) => `  • ${point}`));
  };

  lines.push(`The financial year from 1 July ${start} to 30 June ${start + 1}${closed ? "" : totals.monthsElapsed === 0 ? " (not started yet)" : ` (${totals.monthsElapsed} of 12 months so far)`}.`);

  // Budget
  const budget: string[] = [];
  if (totals.outlook) budget.push(`This is marked as a ${totals.outlook} year.`);
  if (totals.operatingBudget == null) {
    budget.push("No budget has been set.");
  } else {
    const lastBudget = last?.operatingBudget ?? null;
    budget.push(
      `The budget is ${money(totals.operatingBudget)}${
        lastBudget == null ? "" : lastBudget === totals.operatingBudget ? `, the same as in ${last!.label}` : `, ${upDown(lastBudget, totals.operatingBudget)} from ${money(lastBudget)} in ${last!.label}${changed(lastBudget, totals.operatingBudget)}`
      }.`,
    );
    const additionals = data.additionalBudgets.filter((entry) => entry.amount > 0);
    for (const additional of additionals) {
      const spent = round2(data.expenses.filter((expense) => expenseGroup(expense) === additional.category).reduce((sum, expense) => sum + expense.amount, 0));
      budget.push(`${money(additional.amount)} of it is additional budget for ${additional.category}, a one-off that is not expected next year (${money(spent)} spent${closed ? "" : " so far"}).`);
    }
    if (additionals.length > 0) {
      const lastBase = last?.baseBudget ?? null;
      budget.push(`Without the additional budget it is ${money(totals.baseBudget)}${lastBase == null || lastBase === totals.baseBudget ? "" : `, ${upDown(lastBase, totals.baseBudget!)} from ${money(lastBase)} in ${last!.label}${changed(lastBase, totals.baseBudget)}`}.`);
    }
    const spentPercent = totals.spentPercent == null ? "" : ` (${totals.spentPercent.toFixed(1)}% of the budget)`;
    const remaining = totals.remaining ?? 0;
    if (closed) {
      budget.push(`Actual spend was ${money(totals.actualSpend)}${spentPercent}, ${remaining >= 0 ? `leaving ${money(remaining)} unspent` : `${money(-remaining)} over the budget`}.`);
    } else {
      budget.push(`Actual spend so far is ${money(totals.actualSpend)}${spentPercent}, ${remaining >= 0 ? `leaving ${money(remaining)}` : `${money(-remaining)} over the budget`}.`);
      const difference = totals.predictedDifference ?? 0;
      budget.push(`Predicted spend for the year is ${money(totals.predictedSpend)}, a predicted ${difference < 0 ? "deficit" : "surplus"} of ${money(Math.abs(difference))}${totals.status === "on-track" ? ", which is on track" : ""}.`);
    }
  }
  section("Budget", budget);

  // Subscriptions: price increases and decreases against last year.
  const rows = buildSubscriptionRows(data.subscriptions, previous?.subscriptions ?? []);
  const active = rows.filter((row) => row.status === "active");
  const before = new Map((previous?.subscriptions ?? []).filter((row) => row.status === "active").map((row) => [row.subscriptionId, subscriptionYearlyCost(row)]));
  const subscriptions: string[] = [];
  if (active.length === 0) {
    subscriptions.push("No active subscriptions.");
  } else {
    subscriptions.push(
      `${active.length} active subscription${active.length === 1 ? " costs" : "s cost"} ${money(totals.subscriptionsGross)} a year (${money(totals.subscriptions)} excl. GST)${
        last && last.subscriptionsGross > 0 && last.subscriptionsGross !== totals.subscriptionsGross ? `, ${upDown(last.subscriptionsGross, totals.subscriptionsGross)} from ${money(last.subscriptionsGross)} in ${last.label}${changed(last.subscriptionsGross, totals.subscriptionsGross)}` : ""
      }.`,
    );
  }
  if (previous) {
    const priced = active.filter((row) => before.has(row.subscriptionId) && row.increasePercent != null);
    const movement = (row: BudgetSubscriptionRow) => `${row.name} ${money(before.get(row.subscriptionId)!)} to ${money(row.yearlyCost)} (${percent(row.increasePercent)})`;
    const increases = priced.filter((row) => row.increasePercent! >= 0.05).sort((a, b) => b.increasePercent! - a.increasePercent!);
    const decreases = priced.filter((row) => row.increasePercent! <= -0.05).sort((a, b) => a.increasePercent! - b.increasePercent!);
    if (increases.length) subscriptions.push(`Increases (yearly cost): ${increases.map(movement).join("; ")}.`);
    if (decreases.length) subscriptions.push(`Decreases (yearly cost): ${decreases.map(movement).join("; ")}.`);
    if (priced.length > 0 && increases.length === 0 && decreases.length === 0) subscriptions.push(`No subscription changed price from ${last!.label}.`);
    const added = active.filter((row) => !before.has(row.subscriptionId));
    if (added.length) subscriptions.push(`New this year: ${added.map((row) => `${row.name} ${money(row.yearlyCost)}`).join("; ")}.`);
    const activeIds = new Set(active.map((row) => row.subscriptionId));
    const dropped = previous.subscriptions.filter((row) => row.status === "active" && !activeIds.has(row.subscriptionId));
    if (dropped.length) subscriptions.push(`No longer paid: ${dropped.map((row) => `${row.name} (was ${money(subscriptionYearlyCost(row))} a year)`).join("; ")}.`);
  }
  section("Subscriptions", subscriptions);

  // Purchases
  const groups = groupPurchases(data.expenses);
  const purchases: string[] = [];
  if (groups.length === 0) {
    purchases.push(closed ? "No purchases." : "No purchases yet.");
  } else {
    purchases.push(`Purchases ${closed ? "totalled" : "so far total"} ${money(totals.purchases)} across ${groups.length} categor${groups.length === 1 ? "y" : "ies"}.`);
    purchases.push(`Largest: ${groups.slice(0, 3).map((group) => `${group.group} ${money(group.total)} (${group.percentOfPurchases.toFixed(0)}%)`).join("; ")}.`);
    // A part year against a full one would mislead, so only a finished year is compared.
    if (closed && previous && last) {
      const lastGroups = new Map(groupPurchases(previous.expenses).map((group) => [group.group, group.total]));
      const moves = groups
        .slice(0, 5)
        .filter((group) => percentChange(lastGroups.get(group.group), group.total) != null)
        .map((group) => `${group.group} ${upDown(lastGroups.get(group.group)!, group.total)} from ${money(lastGroups.get(group.group)!)}${changed(lastGroups.get(group.group), group.total)}`);
      if (moves.length) purchases.push(`Against ${last.label}: ${moves.join("; ")}.`);
      if (last.purchases > 0 && last.purchases !== totals.purchases) purchases.push(`All purchases are ${upDown(last.purchases, totals.purchases)} from ${money(last.purchases)}${changed(last.purchases, totals.purchases)}.`);
    }
  }
  section("Purchases", purchases);

  // Desire spends still to buy
  const open = data.futureSpends.filter((spend) => spend.status !== "bought");
  const future: string[] = [];
  if (open.length) {
    const byProject = new Map<string, number>();
    for (const spend of open) byProject.set(spend.project, (byProject.get(spend.project) ?? 0) + futureSpendTotal(spend));
    future.push(
      `${open.length} still to buy, ${money(totals.futureSpends)} in total: ${[...byProject.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([project, total]) => `${project} ${money(round2(total))}`)
        .join("; ")}.`,
    );
    const tbc = round2(open.filter((spend) => spend.status === "tbc").reduce((sum, spend) => sum + futureSpendTotal(spend), 0));
    if (tbc !== 0) future.push(`${money(tbc)} of that is still to be confirmed (TBC).`);
    if (!closed && totals.desireLikelihood != null) {
      const left = totals.desireRemaining ?? 0;
      future.push(`Likelihood all can be bought this financial year: ${totals.desireLikelihood.toFixed(0)}% (the predicted surplus would ${left >= 0 ? `leave ${money(left)}` : `be ${money(-left)} short`}).`);
    }
  }
  section("Desire Spends", future);

  // Next financial year: what the same activity would cost, one-offs left out.
  const nextStart = `${start + 1}-07-01`;
  const carried = active.filter((row) => !row.endedOn || row.endedOn >= nextStart);
  const nextSubscriptions = round2(carried.reduce((sum, row) => sum + row.yearlyCost, 0) / GST_DIVISOR);
  const oneOff = oneOffCategories(data);
  const nextPurchases = predictYearPurchases(data.expenses.filter((expense) => !oneOff.has(expenseGroup(expense))), data.projectedCategories, totals.monthsElapsed).total;
  const oneOffNames = [...oneOff].join(", ");
  const next: string[] = [
    `Subscriptions: ${money(nextSubscriptions)} excl. GST (${carried.length} subscription${carried.length === 1 ? "" : "s"} at today's prices).`,
    `Expected purchases: ${money(nextPurchases)}, ${closed ? "the same as this year's purchases" : "this year's predicted purchases"}${totals.oneOffPurchases > 0 ? `, without the one-off ${oneOffNames} (${money(totals.oneOffPurchases)})` : ""}.`,
  ];
  if (totals.futureSpends !== 0) next.push(`Desire spends not bought by 30 June ${start + 1} would add ${money(totals.futureSpends)}.`);
  const nextSpend = round2(nextSubscriptions + nextPurchases);
  if (totals.baseBudget == null) {
    next.push(`Expected spend: ${money(nextSpend)}.`);
  } else {
    const gap = round2(totals.baseBudget - nextSpend);
    next.push(`Expected spend: ${money(nextSpend)}, ${money(Math.abs(gap))} ${gap >= 0 ? "under" : "over"} this year's budget${totals.additionalBudget > 0 ? ` without the additional ${money(totals.additionalBudget)} (${money(totals.baseBudget)})` : ""}.`);
  }
  section(`Next financial year ${financialYearLabel(start + 1)}`, next);

  return lines.join("\n");
}

export { financialYearLabel, financialYearOf, financialYearOfMonth, nzMonthOf };
