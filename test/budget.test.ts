import assert from "node:assert/strict";
import test from "node:test";

import {
  budgetReminderMonth,
  budgetStatus,
  buildBudgetGrounding,
  buildBudgetReport,
  buildSubscriptionRows,
  buildYearOverYear,
  computeBudgetTotals,
  groupPurchases,
  isBudgetPrompt,
  monthsElapsedInYear,
  predictPurchases,
  subscriptionYearlyCost,
  type BudgetYearData,
} from "../src/analytics/budget.js";
import type { BudgetExpenseView, BudgetFrequency, BudgetFutureSpendView, BudgetSubscriptionYearView } from "../src/storage/budget-store.js";

let nextId = 1;
function year(startYear: number, operatingBudget: number | null, parts: { subs?: Array<[number, string, number, BudgetFrequency, ("active" | "ended")?, number?]>; buys?: Array<[string, string, number]>; future?: Array<[string, number, number]> } = {}): BudgetYearData {
  const yearId = startYear;
  const subscriptions: BudgetSubscriptionYearView[] = (parts.subs ?? []).map(([subscriptionId, name, amount, frequency, status = "active", tally = 0]) => ({
    id: nextId++, subscriptionId, budgetYearId: yearId, startYear, name, category: "", amount, frequency, status, tally, note: "", startedOn: null, endedOn: null, createdAt: "2026-01-01T00:00:00.000Z",
  }));
  const expenses: BudgetExpenseView[] = (parts.buys ?? []).map(([supplier, group, amount]) => ({
    id: nextId++, budgetYearId: yearId, supplier, group, amount, note: "", spentOn: null, source: "import", sourceMonth: null, createdAt: "2026-01-01T00:00:00.000Z",
  }));
  const futureSpends: BudgetFutureSpendView[] = (parts.future ?? []).map(([project, amount, qty]) => ({
    id: nextId++, budgetYearId: yearId, project, supplier: "", amount, qty, note: "", status: "planned", expenseId: null, createdAt: "2026-01-01T00:00:00.000Z",
  }));
  return {
    year: { id: yearId, startYear, label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, operatingBudget, thresholdPercent: 2, notes: "", report: "", updatedAt: "2026-01-01T00:00:00.000Z" },
    subscriptions,
    expenses,
    futureSpends,
    additionalBudgets: [],
  };
}

const near = (actual: number | null, expected: number, places = 2) => assert.equal(actual == null ? null : Number(actual.toFixed(places)), Number(expected.toFixed(places)));

// Budget Calculator 2026-27.xlsx, as saved on 1 Oct 2026 (4 months elapsed).
const fy2627 = () =>
  year(2026, 60000, {
    subs: [
      [1, "Google Ads", 57.29, "month", "ended", 12],
      [2, "Anthropic Claude", 40, "month"],
      [3, "Mailchimp", 152.8, "year"],
      [4, "Youtube", 22.99, "month"],
      [5, "Blacksheep", 224.25, "quarter"],
      [6, "Adobe Creative Cloud", 1314, "year"],
      [7, "Formstack", 1280.46, "year"],
      [8, "ChatGPT", 40, "month"],
      [9, "Suno.ai", 21.33, "month"],
      [10, "Zoom", 84.22, "month", "ended", 12],
      [11, "Survey Monkey", 42.61, "month", "ended", 12],
      [12, "META & Google Ads Provider", 800, "month", "ended", 12],
    ],
    buys: [
      ["Facebook", "Facebook", 2060.21],
      ["Mailchimp", "Mailchimp", 86.28],
      ["CS Signs", "Office Signage", 12032.9],
      ["Prestige Plasterers", "Office Signage", 3082],
      ["Maker Supply", "Office Signage", 101],
      ["Bunnings", "Office Signage", 59.3],
      ["Bunnings", "Office Signage", 18.99],
      ["Bunnings", "Office Signage", 229.21],
    ],
    future: [["Recording", 429, 1], ["Recording", 119, 3], ["Recording", 44.95, 2], ["Recording", 699, 2], ["Recording", 289, 1], ["Recording", 499, 1], ["Recording", 43.48, 1], ["Recording", 53.71, 1]],
  });

// Budget Calculator 2025-26.xlsx (closed year).
const fy2526 = () =>
  year(2025, 30000, {
    subs: [
      [1, "Google Ads", 57.29, "month", "ended", 12],
      [2, "Anthropic Claude", 40.22, "month"],
      [3, "Mailchimp", 28.76, "month"],
      [4, "Youtube", 22.99, "month"],
      [13, "Midjourney", 480.16, "year"],
      [5, "Blacksheep", 274.85, "quarter"],
      [6, "Adobe Creative Cloud", 1314, "year"],
      [7, "Formstack", 1171.72, "year"],
      [14, "Infocare Emergency Comms", 268.64, "quarter"],
      [10, "Zoom", 84.22, "month", "ended", 12],
      [11, "Survey Monkey", 42.61, "month", "ended", 12],
    ],
    buys: [["Everything", "Kale Print", 16937.6]],
    future: [["Recording", 3159.09, 1]],
  });

test("yearly cost per frequency", () => {
  assert.equal(subscriptionYearlyCost({ amount: 10, frequency: "week" }), 520);
  assert.equal(subscriptionYearlyCost({ amount: 10, frequency: "fortnight" }), 260);
  assert.equal(subscriptionYearlyCost({ amount: 10, frequency: "month" }), 120);
  assert.equal(subscriptionYearlyCost({ amount: 10, frequency: "quarter" }), 40);
  assert.equal(subscriptionYearlyCost({ amount: 10, frequency: "year" }), 10);
});

test("2026-27 matches the workbook (Totals sheet, 1 Oct 2026)", () => {
  const totals = computeBudgetTotals(fy2627(), new Date("2026-10-15T00:00:00Z"));
  near(totals.subscriptions, 4466.17);
  near(totals.purchases, 17669.89);
  near(totals.futureSpends, 3159.09);
  near(totals.endedSubscriptions, 11809.44);
  near(totals.actualSpend, 22136.06);
  near(totals.remaining, 37863.94);
  near(totals.spentPercent, 36.89);
  assert.equal(totals.monthsElapsed, 4);
  near(totals.predictedPurchases, 53009.67);
  near(totals.predictedSpend, 60634.93);
  near(totals.predictedDifference, -634.93);
  near(totals.predictedPercent, -1.05);
  assert.equal(totals.status, "on-track");
});

test("2025-26 matches the workbook's actual figures", () => {
  const totals = computeBudgetTotals(fy2526(), new Date("2026-11-12T00:00:00Z"));
  near(totals.subscriptions, 5429.11);
  near(totals.purchases, 16937.6);
  near(totals.actualSpend, 22366.71);
  near(totals.remaining, 7633.29);
  near(totals.spentPercent, 74.56);
  near(totals.endedSubscriptions, 2209.44);
});

test("a closed year predicts its own 12 months, not $203k from today's date", () => {
  const totals = computeBudgetTotals(fy2526(), new Date("2026-11-12T00:00:00Z"));
  assert.equal(totals.monthsElapsed, 12);
  near(totals.predictedPurchases, 16937.6);
  near(totals.predictedSpend, 5429.11 + 16937.6 + 3159.09);
  assert.ok(totals.predictedSpend < 30000);
});

test("months elapsed count the current month and stop at the year's edges", () => {
  assert.equal(monthsElapsedInYear(2026, new Date("2026-07-01T00:00:00+12:00")), 1);
  assert.equal(monthsElapsedInYear(2026, new Date("2027-06-30T12:00:00+12:00")), 12);
  assert.equal(monthsElapsedInYear(2026, new Date("2026-06-30T12:00:00+12:00")), 0);
  assert.equal(monthsElapsedInYear(2025, new Date("2026-11-12T00:00:00Z")), 12);
  assert.equal(predictPurchases(1000, 0), 1000);
  assert.equal(predictPurchases(1000, 4), 3000);
});

test("inc % is calculated against the same subscription last year", () => {
  const rows = buildSubscriptionRows(fy2627().subscriptions, fy2526().subscriptions);
  const byName = new Map(rows.map((row) => [row.name, row]));
  near(byName.get("Mailchimp")!.increasePercent, ((152.8 - 345.12) / 345.12) * 100);
  near(byName.get("Blacksheep")!.increasePercent, ((897 - 1099.4) / 1099.4) * 100);
  assert.equal(byName.get("Suno.ai")!.increasePercent, null); // new this year
  assert.equal(byName.get("ChatGPT")!.increasePercent, null); // a new subscription, not the renamed one
  near(byName.get("Anthropic Claude")!.increasePercent, ((480 - 482.64) / 482.64) * 100);
  assert.equal(byName.get("Zoom")!.increasePercent, null); // ended
  near(byName.get("Zoom")!.endedCost, 1010.64);
});

test("purchases group into the workbook's tallies with % of spend", () => {
  const groups = groupPurchases(fy2627().expenses);
  assert.equal(groups[0].group, "Office Signage");
  near(groups[0].total, 15523.4);
  near(groups[0].percentOfPurchases, (15523.4 / 17669.89) * 100);
  assert.equal(groups.find((group) => group.group === "Facebook")!.count, 1);
});

test("threshold: within ±threshold % is on track", () => {
  assert.equal(budgetStatus(-100, 10000, 2), "on-track");
  assert.equal(budgetStatus(-300, 10000, 2), "deficit");
  assert.equal(budgetStatus(300, 10000, 2), "surplus");
});

// A year whose purchases are one dated amount per month from July 2026.
function datedYear(monthly: number[], operatingBudget = 20000, tbc = 0): BudgetYearData {
  const data = year(2026, operatingBudget);
  data.expenses = monthly.map((amount, index) => {
    const month = index + 7 > 12 ? index - 5 : index + 7;
    const spentOn = `${index + 7 > 12 ? 2027 : 2026}-${String(month).padStart(2, "0")}-15`;
    return { id: nextId++, budgetYearId: 2026, supplier: "Shop", group: "Shop", amount, note: "", spentOn, source: "manual", sourceMonth: null, createdAt: "2026-01-01T00:00:00.000Z" };
  });
  if (tbc) data.futureSpends = [{ id: nextId++, budgetYearId: 2026, project: "Maybe", supplier: "", amount: tbc, qty: 1, note: "", status: "tbc", expenseId: null, createdAt: "2026-01-01T00:00:00.000Z" }];
  return data;
}

test("threshold is worked out: how far off the prediction could be, between 2% and 10%", () => {
  const december = new Date("2026-12-15T00:00:00Z"); // 6 months elapsed, 6 left
  // Perfectly steady spending: nothing to be unsure about, so the 2% floor.
  assert.equal(computeBudgetTotals(datedYear([1000, 1000, 1000, 1000, 1000, 1000]), december).thresholdPercent, 2);
  // Swings of ±200 a month: sd 178.89 x sqrt(6 x (1 + 6/6)) = 619.68 on a predicted 12,000 = 5.2%.
  const swinging = computeBudgetTotals(datedYear([1000, 1200, 800, 1000, 1200, 800]), december);
  near(swinging.predictedSpend, 12000);
  assert.equal(swinging.thresholdPercent, 5.2);
  // Half of a TBC future spend is added: (619.68 + 300) / 12,600 = 7.3%.
  assert.equal(computeBudgetTotals(datedYear([1000, 1200, 800, 1000, 1200, 800], 20000, 600), december).thresholdPercent, 7.3);
  // One big lumpy purchase: capped at 10%.
  assert.equal(computeBudgetTotals(datedYear([100, 100, 12000, 100, 100, 100]), december).thresholdPercent, 10);
  // Under 3 months there is no swing to measure: half the guessed purchases, capped.
  assert.equal(computeBudgetTotals(datedYear([1000, 1000]), new Date("2026-08-15T00:00:00Z")).thresholdPercent, 10);
  // A finished year has nothing left to guess.
  assert.equal(computeBudgetTotals(fy2526(), new Date("2026-11-12T00:00:00Z")).thresholdPercent, 2);
  // The typed-in figure on the year is ignored.
  const typed = datedYear([1000, 1000, 1000, 1000, 1000, 1000]);
  typed.year.thresholdPercent = 50;
  assert.equal(computeBudgetTotals(typed, december).thresholdPercent, 2);
});

test("status follows the worked-out threshold", () => {
  const december = new Date("2026-12-15T00:00:00Z");
  // Predicted 12,000 with a 5.2% band (±619.68 worth): 12,500 is on track, 13,000 a surplus, 11,000 a deficit.
  assert.equal(computeBudgetTotals(datedYear([1000, 1200, 800, 1000, 1200, 800], 12500), december).status, "on-track");
  assert.equal(computeBudgetTotals(datedYear([1000, 1200, 800, 1000, 1200, 800], 13000), december).status, "surplus");
  assert.equal(computeBudgetTotals(datedYear([1000, 1200, 800, 1000, 1200, 800], 11000), december).status, "deficit");
});

test("year over year lists each subscription's cost per year", () => {
  const yoy = buildYearOverYear([fy2627(), fy2526()], new Date("2026-11-12T00:00:00Z"));
  assert.deepEqual(yoy.years, [2025, 2026]);
  const claude = yoy.subscriptions.find((entry) => entry.name === "Anthropic Claude")!;
  assert.equal(claude.costs[2025], 482.64);
  assert.equal(claude.costs[2026], 480);
  // Zoom is only an ended row in these two years, so it has no yearly cost to compare.
  assert.equal(yoy.subscriptions.find((entry) => entry.name === "Zoom"), undefined);
  assert.equal(yoy.totals.length, 2);
});

test("year over year leaves out subscriptions that were never active", () => {
  const yoy = buildYearOverYear(
    [
      year(2025, 1000, { subs: [[900, "Unbound", 100, "month", "ended", 12], [901, "Zoom", 10, "month"]] }),
      year(2026, 1000, { subs: [[900, "Unbound", 100, "month", "ended", 3], [901, "Zoom", 10, "month", "ended", 4]] }),
    ],
    new Date("2026-11-12T00:00:00Z"),
  );
  assert.deepEqual(yoy.subscriptions.map((entry) => entry.name), ["Zoom"]);
});

test("budget reminder: last 3 days of the month when nothing was added", () => {
  const none = { expenses: [], dismissedMonths: new Set<string>() };
  // 27 Nov NZ: not yet (window is 28-30 Nov). Oct carried over? Oct also had nothing.
  assert.equal(budgetReminderMonth({ ...none, now: new Date("2026-11-27T01:00:00Z"), expenses: [{ createdAt: new Date("2026-10-05T00:00:00Z"), spentOn: null }] }), null);
  assert.equal(budgetReminderMonth({ ...none, now: new Date("2026-11-28T01:00:00Z"), expenses: [{ createdAt: new Date("2026-10-05T00:00:00Z"), spentOn: null }] }), "2026-11");
  // Added in November: no reminder.
  assert.equal(budgetReminderMonth({ ...none, now: new Date("2026-11-29T01:00:00Z"), expenses: [{ createdAt: new Date("2026-10-05T00:00:00Z"), spentOn: null }, { createdAt: new Date("2026-11-03T00:00:00Z"), spentOn: null }] }), null);
});

test("budget reminder carries into the next month until added or dismissed", () => {
  const october = { createdAt: new Date("2026-10-05T00:00:00Z"), spentOn: null };
  const now = new Date("2026-12-05T01:00:00Z");
  assert.equal(budgetReminderMonth({ now, expenses: [october], dismissedMonths: new Set() }), "2026-11");
  assert.equal(budgetReminderMonth({ now, expenses: [october], dismissedMonths: new Set(["2026-11"]) }), null);
  // An expense dated in November, added in December, covers November.
  assert.equal(budgetReminderMonth({ now, expenses: [october, { createdAt: new Date("2026-12-02T00:00:00Z"), spentOn: "2026-11-20" }], dismissedMonths: new Set() }), null);
  // Any other December expense does not.
  assert.equal(budgetReminderMonth({ now, expenses: [october, { createdAt: new Date("2026-12-02T00:00:00Z"), spentOn: "2026-12-01" }], dismissedMonths: new Set() }), "2026-11");
});

test("budget grounding: current year, subscriptions and every year's totals", () => {
  const text = buildBudgetGrounding([fy2526(), fy2627()], new Date("2026-10-15T00:00:00Z"));
  assert.match(text, /Current financial year 2026-27 \(4 of 12 months\)/);
  assert.match(text, /Operating budget \$60,000\.00/);
  assert.match(text, /Predicted spend \$60,634\.93/);
  assert.match(text, /- Mailchimp: \$152\.80 per year/);
  assert.match(text, /Office Signage \$15,523\.40/);
  assert.match(text, /- 2025-26: budget \$30,000\.00/);
  assert.match(text, /Subscription yearly cost by year \(2025-26, 2026-27\)/);
  assert.equal(buildBudgetGrounding([], new Date()), "");
});

// The 2026-27 budget went up by $20,000 for the office signage: a one-off.
const fy2627WithSignage = () => {
  const data = fy2627();
  data.additionalBudgets = [{ id: 1, budgetYearId: 2026, category: "Office Signage", amount: 20000 }];
  return data;
};

test("additional budget: its category's purchases count as spent but are not carried forward", () => {
  const totals = computeBudgetTotals(fy2627WithSignage(), new Date("2026-10-15T00:00:00Z"));
  assert.equal(totals.additionalBudget, 20000);
  assert.equal(totals.baseBudget, 40000); // part of the $60,000, not on top of it
  near(totals.oneOffPurchases, 15523.4);
  near(totals.purchases, 17669.89); // unchanged
  near(totals.actualSpend, 22136.06); // unchanged
  // Everyday purchases 2,146.49 over 4 months -> 6,439.47 for the year, plus the signage as spent.
  near(totals.predictedPurchases, 6439.47 + 15523.4);
  near(totals.predictedSpend, 4466.17 + 21962.87 + 3159.09);
  // Without one, nothing changes.
  const plain = computeBudgetTotals(fy2627(), new Date("2026-10-15T00:00:00Z"));
  assert.equal(plain.additionalBudget, 0);
  assert.equal(plain.baseBudget, 60000);
  assert.equal(plain.oneOffPurchases, 0);
});

test("report: written from the figures, with the one-off left out of next year", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  const text = buildBudgetReport(fy2627WithSignage(), fy2526(), now);
  assert.match(text, /^The financial year from 1 July 2026 to 30 June 2027 \(4 of 12 months so far\)\.\n\nBudget:\n  • The budget is \$60,000\.00, up from \$30,000\.00 in 2025-26 \(\+100\.0%\)\./);
  assert.match(text, /  • \$20,000\.00 of it is additional budget for Office Signage, a one-off that is not expected next year \(\$15,523\.40 spent so far\)\./);
  assert.match(text, /  • Without the additional budget it is \$40,000\.00, up from \$30,000\.00 in 2025-26 \(\+33\.3%\)\./);
  assert.match(text, /Actual spend so far is \$22,136\.06 \(36\.9% of the budget\), leaving \$37,863\.94\./);
  assert.match(text, /Predicted spend for the year is \$29,588\.13, a predicted surplus of \$30,411\.87\./);
  // Subscription price increases and decreases, new ones and ones no longer paid.
  assert.match(text, /\nSubscriptions:\n  • 8 active subscriptions cost /);
  assert.match(text, /Increases \(yearly cost\): Formstack \$1,171\.72 to \$1,280\.46 \(\+9\.3%\)\./);
  assert.match(text, /Decreases \(yearly cost\): Mailchimp \$345\.12 to \$152\.80 \(-55\.7%\); Blacksheep \$1,099\.40 to \$897\.00 \(-18\.4%\); Anthropic Claude \$482\.64 to \$480\.00 \(-0\.5%\)\./);
  assert.match(text, /New this year: [^\n]*Suno\.ai \$255\.96/);
  assert.match(text, /No longer paid: [^\n]*Midjourney \(was \$480\.16 a year\)/);
  assert.match(text, /\nPurchases:\n  • Purchases so far total \$17,669\.89 across 3 categories\.\n  • Largest: Office Signage \$15,523\.40 \(88%\); Facebook \$2,060\.21 \(12%\); Mailchimp \$86\.28 \(0%\)\./);
  assert.doesNotMatch(text, /Against 2025-26/); // a part year is not compared with a full one
  assert.match(text, /\nFuture Spends:\n  • 8 still to buy, \$3,159\.09 in total: Recording \$3,159\.09\./);
  assert.match(text, /\nNext financial year 2027-28:\n  • Subscriptions: \$4,466\.17 excl\. GST \(8 subscriptions at today's prices\)\./);
  assert.match(text, /  • Expected purchases: \$6,439\.47, this year's purchases carried on at the same rate, without the one-off Office Signage \(\$15,523\.40\)\./);
  assert.match(text, /  • Future spends not bought by 30 June 2027 would add \$3,159\.09\./);
  assert.match(text, /  • Expected spend: \$10,905\.64, \$29,094\.36 under this year's budget without the additional \$20,000\.00 \(\$40,000\.00\)\.$/);

  // No additional budget: no mention of one, and everything is carried forward.
  const plain = buildBudgetReport(fy2627(), fy2526(), now);
  assert.doesNotMatch(plain, /additional|one-off/);
  assert.match(plain, /Expected purchases: \$53,009\.67, this year's purchases carried on at the same rate\./);

  // A finished year with no year before it.
  const closed = buildBudgetReport(fy2526(), null, new Date("2026-11-12T00:00:00Z"));
  assert.match(closed, /^The financial year from 1 July 2025 to 30 June 2026\.\n/);
  assert.match(closed, /  • The budget is \$30,000\.00\.\n  • Actual spend was \$22,366\.71 \(74\.6% of the budget\), leaving \$7,633\.29 unspent\./);
  assert.doesNotMatch(closed, /Increases|Decreases|New this year|No longer paid/);
  assert.match(closed, /Expected purchases: \$16,937\.60, the same as this year's purchases\./);
});

test("budget grounding: additional budget and the saved report", () => {
  const data = fy2627WithSignage();
  data.year.report = "Signage finished in October.";
  const text = buildBudgetGrounding([fy2526(), data], new Date("2026-10-15T00:00:00Z"));
  assert.match(text, /Additional budget \(a one-off, part of the operating budget, not expected next year\): Office Signage \$20,000\.00; budget without it \$40,000\.00\./);
  assert.match(text, /Year report 2026-27: Signage finished in October\./);
});

test("only budget-shaped prompts get the budget", () => {
  assert.ok(isBudgetPrompt("How much have we spent on subscriptions this year?"));
  assert.ok(isBudgetPrompt("are we going to be over budget"));
  assert.ok(!isBudgetPrompt("Which centres have the longest waitlist?"));
});
