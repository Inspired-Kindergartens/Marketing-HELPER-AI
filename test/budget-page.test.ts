import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BudgetYearData } from "../src/analytics/budget.js";
import { renderBudgetAppShell, renderBudgetFragments, type BudgetPageData } from "../src/ui/budget-app-shell.js";
import { budgetPdfFilename, reportContent } from "../src/ui/budget-pdf.js";
import { renderLandingPage, renderReminders } from "../src/ui/landing-page.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const created = "2026-11-01T00:00:00.000Z";
function yearData(startYear: number, budget: number): BudgetYearData {
  return {
    year: { id: startYear, startYear, label: `${startYear}-${(startYear + 1) % 100}`, operatingBudget: budget, thresholdPercent: 2, notes: "Notes <b>here</b>", report: "", outlook: "", updatedAt: created },
    additionalBudgets: [],
    projectedCategories: ["Facebook"],
    subscriptions: [
      { id: startYear * 10 + 1, subscriptionId: 1, budgetYearId: startYear, startYear, name: "Mailchimp", category: "", amount: startYear === 2026 ? 152.8 : 28.76, frequency: startYear === 2026 ? "year" : "month", status: "active", tally: 0, note: "", startedOn: "2023-07-01", endedOn: null, createdAt: created },
      { id: startYear * 10 + 2, subscriptionId: 2, budgetYearId: startYear, startYear, name: "Zoom", category: "", amount: 84.22, frequency: "month", status: "ended", tally: 12, note: "", startedOn: null, endedOn: "2026-09-30", createdAt: created },
    ],
    expenses: [
      { id: startYear * 10 + 3, budgetYearId: startYear, supplier: "CS Signs", group: "Office Signage", amount: 12032.9, note: "", spentOn: null, source: "import", sourceMonth: null, createdAt: created },
      { id: startYear * 10 + 4, budgetYearId: startYear, supplier: "Meta", group: "Facebook", amount: 810.97, note: "", spentOn: "2026-10-01", source: "meta", sourceMonth: "2026-10", createdAt: created },
    ],
    futureSpends: [{ id: startYear * 10 + 5, budgetYearId: startYear, project: "Recording", supplier: "Music Works", amount: 699, qty: 2, note: "Mic bundle", status: "tbc", expenseId: null, createdAt: created }],
  };
}

function pageData(): BudgetPageData {
  const previous = yearData(2025, 30000);
  const selected = yearData(2026, 60000);
  return {
    years: [previous.year, selected.year],
    selected,
    previous,
    all: [previous, selected],
    subscriptionNames: ["Mailchimp", "Zoom"],
    now: new Date("2026-11-12T00:00:00Z"),
  };
}

test("budget page: own app shell with the theme script, nav rail and standard print action", () => {
  const html = renderBudgetAppShell(pageData());
  assert.match(html, /<title>Marketing Helper - Budget<\/title>/);
  assert.match(html, /localStorage|data-theme/); // THEME_HEAD_SCRIPT
  assert.match(html, /href="\/budget" aria-label="Budget" title="Budget" aria-current="page"/);
  assert.match(html, /class="panel-action-button action-print" href="\/api\/budget\/pdf\?year=2026" download/);
  for (const key of ["totals", "subscriptions", "purchases", "future", "history"]) assert.match(html, new RegExp(`data-budget-fragment="${key}"`));
  assert.match(html, /<option value="2026" selected>/);
});

test("budget page: no year notes box; Generate report opens the report for editing", () => {
  const data = pageData();
  const html = renderBudgetAppShell(data);
  assert.doesNotMatch(html, /Year notes|name="notes"|Notes &lt;b&gt;/);
  assert.doesNotMatch(html, /data-budget-form="settings"/);
  assert.match(html, /data-budget-report><i class="bi bi-file-earmark-text ui-icon" aria-hidden="true"><\/i><span>Generate report<\/span>/);
  assert.match(html, /<dialog class="wiki-modal wiki-modal--wide text-body" data-budget-dialog="report" data-noun="Report 2026-27" data-submit="Save"[\s\S]*?<textarea class="form-control" name="report"/);
  assert.match(html, /data-budget-report-generate/);
  // The window is filled from the server and saved through the year's settings.
  assert.match(html, /"\/api\/budget\/years\/" \+ YEAR \+ "\/report" \+ \(fresh \? "\?fresh=1" : ""\)/);
  const server = source("../src/server.ts");
  assert.match(server, /saved && request\.query\?\.fresh !== "1" \? saved : buildBudgetReport\(data\.selected, data\.previous, data\.now\)/);
  assert.match(server, /updateBudgetYearSettings\(year, \{ operatingBudget: body\.operatingBudget, report: body\.report, outlook: body\.outlook \}\)/);
});

test("budget pdf: named Marketing Budget; uses the saved report, or writes one when none was generated", () => {
  const pdf = source("../src/ui/budget-pdf.ts");
  assert.equal(budgetPdfFilename(2026), "Marketing Budget 2026-27.pdf");
  assert.match(pdf, /title: `Marketing Budget \$\{label\}`/);
  assert.match(pdf, /infoTitle: `Marketing Budget \$\{label\}`/);
  assert.doesNotMatch(pdf, /Year notes|year\.notes/);
  assert.match(pdf, /reportContent\(selected\.year\.report\.trim\(\) \|\| buildBudgetReport\(selected, previous, now\)\)/);
  // Headings, bullet lists and paragraphs, for generated and edited text alike.
  assert.deepEqual(reportContent("Intro line.\n\nBudget:\n  • One\n  • Two\n- Three\nClosing."), [
    { text: "Intro line.", fontSize: 8.5, margin: [0, 0, 0, 4] },
    { text: "Budget", fontSize: 9.5, bold: true, margin: [0, 6, 0, 3] },
    { ul: ["One", "Two", "Three"], fontSize: 8.5, margin: [0, 0, 0, 4] },
    { text: "Closing.", fontSize: 8.5, margin: [0, 0, 0, 4] },
  ]);
});

test("budget page: additional budget is set from a purchase category and shown on its card and in Totals", () => {
  const data = pageData();
  const plain = renderBudgetFragments(data);
  assert.match(plain.categories, /data-budget-additional="Office Signage" data-values="\{&quot;category&quot;:&quot;Office Signage&quot;,&quot;amount&quot;:&quot;&quot;\}"/);
  // Facebook (Meta rows) can't be renamed or deleted, but can still be given additional budget.
  const facebook = plain.categories.split("<section").find((part) => part.includes('data-budget-category="Facebook"'))!;
  assert.doesNotMatch(facebook, /data-budget-category-rename/);
  assert.match(facebook, /data-budget-additional="Facebook"/);
  assert.doesNotMatch(plain.totals, /data-budget-additional-row/);
  assert.doesNotMatch(plain.purchases, /additional budget/);

  data.selected.additionalBudgets = [{ id: 1, budgetYearId: 2026, category: "Office Signage", amount: 20000 }];
  const fragments = renderBudgetFragments(data);
  assert.match(fragments.purchases, /% of spend · additional budget \$20,000\.00/);
  assert.match(fragments.categories, /&quot;amount&quot;:20000\}/);
  assert.match(fragments.totals, /data-budget-additional-row><td>Additional budget \(part of the budget\)<\/td><td class="[^"]*">\$20,000\.00<\/td>/);
  const html = renderBudgetAppShell(data);
  assert.match(html, /<dialog class="wiki-modal text-body" data-budget-dialog="additional" data-noun="Additional budget" data-submit="Save"[\s\S]*?name="category"[\s\S]*?name="amount"/);
  assert.match(html, /additional: "\/api\/budget\/additional"/);
  const store = source("../src/storage/budget-store.ts");
  // Renaming or deleting the category takes its additional budget with it.
  assert.match(store, /db\.budgetAdditional\.updateMany\(\{ where: \{ category: from \}, data: \{ category: name \} \}\)/);
  assert.match(store, /db\.budgetAdditional\.deleteMany\(\{ where: \{ budgetYearId: year\.id, category \} \}\)/);
});

test("budget page: Meta rows are read-only; others can be edited and deleted", () => {
  const { purchases } = renderBudgetFragments(pageData());
  assert.doesNotMatch(purchases, /Meta results/);
  const metaRow = purchases.split("<tr>").find((row) => row.includes("<td>Meta</td>"))!;
  assert.doesNotMatch(metaRow, /data-budget-edit|data-budget-delete/);
  const signsRow = purchases.split("<tr>").find((row) => row.includes("CS Signs"))!;
  assert.match(signsRow, /data-budget-edit="expense"/);
  assert.match(signsRow, /data-budget-delete="expense"/);
});

test("budget page: purchases are one card per category with the last three, a total and its own add form", () => {
  const data = pageData();
  for (let index = 0; index < 4; index += 1) {
    data.selected.expenses.push({ id: 900 + index, budgetYearId: 2026, supplier: `Print ${index}`, group: "Kale Print", amount: 100, note: "", spentOn: `2026-0${7 + index > 9 ? 9 : 7 + index}-1${index}`, source: "manual", sourceMonth: null, createdAt: created });
  }
  const { purchases, categories } = renderBudgetFragments(data);
  const [grid, template] = purchases.split('<template data-budget-card-template="expense">');
  const cards = grid.split("<section").slice(1);
  assert.equal(cards.length, 3); // Office Signage, Facebook, Kale Print
  // No form on the cards: Add purchase in the top row opens the one modal.
  assert.doesNotMatch(purchases, /<form/);
  const kale = cards.find((card) => card.includes('data-budget-card="Kale Print"'))!;
  assert.match(kale, /<strong>\$400\.00<\/strong><button type="button" class="button-sm" data-budget-add-item="expense" data-category="Kale Print">/);
  assert.equal(kale.match(/<tr>/g)?.length, 3);
  assert.ok(kale.includes("Print 3") && !kale.includes("Print 0"));
  // The empty card the New category button copies.
  assert.match(template, /data-budget-card=""[\s\S]*data-budget-add-item="expense" data-category=""/);
  // The right-hand column has every purchase of each category, hidden until its card is clicked.
  const kaleAll = categories.split("<section").find((section) => section.includes('data-budget-category="Kale Print"'))!;
  assert.match(kaleAll, / hidden>/);
  assert.equal(kaleAll.match(/<tr>/g)?.length, 4);
  assert.match(kaleAll, /data-budget-category-close/);
  assert.match(kaleAll, /data-budget-kind="expense"/);
  assert.match(kaleAll, /data-budget-add-item="expense" data-category="Kale Print"/);
  // A category can be renamed or deleted there; one holding Meta rows can't.
  assert.match(kaleAll, /data-budget-category-rename="Kale Print"/);
  assert.match(kaleAll, /data-budget-category-delete="Kale Print" data-confirm="Delete Kale Print and its 4 purchases in 2026-27\? This can&#39;t be undone\."/);
  const facebookAll = categories.split("<section").find((section) => section.includes('data-budget-category="Facebook"'))!;
  assert.doesNotMatch(facebookAll, /data-budget-category-rename|data-budget-category-delete/);
  const server = source("../src/server.ts");
  assert.match(server, /"\/api\/budget\/categories\/rename"[\s\S]*?renameBudgetExpenseCategory\(body\.from, body\.to\)/);
  assert.match(server, /"\/api\/budget\/categories\/delete"[\s\S]*?deleteBudgetExpenseCategory\(year, body\.category\)/);
  const store = source("../src/storage/budget-store.ts");
  assert.equal(store.match(/matches\.some\(\(record\) => record\.source === "meta"\)\) return false;/g)?.length, 2);
  const html = renderBudgetAppShell(data);
  // One purchase modal on the page, with an editable date.
  assert.equal(html.match(/data-budget-form="expense"/g)?.length, 1);
  // The date is the app's standard date combo: typed box + calendar button + native picker.
  assert.match(html, /<dialog class="wiki-modal text-body" data-budget-dialog="expense"[\s\S]*<span class="date-combo">\s*<input class="form-control" type="text" name="spentOn"[^>]*data-date-text \/>\s*<button type="button" class="date-combo__button" data-open-date-picker[\s\S]*?<input type="date" class="date-combo__picker"[^>]*data-date-picker \/>[\s\S]*<\/dialog>/);
  assert.doesNotMatch(html, /type="date" name=/);
  // Category is a drop-down, filled from the current cards when the modal opens.
  assert.match(html, /<select class="form-control" name="group" required data-budget-categories><\/select>/);
  assert.match(html, /querySelectorAll\('\[data-budget-grid="' \+ kind \+ '"\] \[data-budget-card\]'\)\.forEach\(function\(card\) \{\s*names\.push/);
  // Bought asks for its date in a modal with the same date combo, not a prompt.
  assert.match(html, /<dialog class="wiki-modal text-body" data-budget-dialog="bought"[\s\S]*?class="date-combo"[\s\S]*?<\/dialog>/);
  assert.doesNotMatch(html, /window\.prompt\("Date/);
  // Add purchase fills in the card's title (supplier and category) and today's date.
  assert.match(html, /openDialog\("expense", \{ supplier: title, group: title, spentOn: new Date\(\)\.toLocaleDateString\("en-CA"\) \}\)/);
  assert.match(html, /data-budget-new-category/);
  assert.match(html, /data-budget-fragment="categories"/);
});

test("budget page: In predictions is an opt-in tick on each purchase category", () => {
  const { purchases, categories, totals } = renderBudgetFragments(pageData());
  const cards = purchases.split('<template data-budget-card-template="expense">')[0].split("<section").slice(1);
  const card = (name: string) => cards.find((part) => part.includes(`data-budget-card="${name}"`))!;
  assert.match(card("Facebook"), /<input type="checkbox" data-budget-predict="Facebook" checked \/><span>In predictions<\/span>/);
  assert.match(card("Office Signage"), /<input type="checkbox" data-budget-predict="Office Signage" \/><span>In predictions<\/span>/);
  assert.match(categories, /data-budget-predict="Facebook" checked/); // and on the full list on the right
  // 12 Nov = 5 months: Facebook 810.97 carries on to 1,946.33; the signage counts as spent.
  assert.match(totals, /<td>Predicted purchases<\/td><td class="[^"]*">\$13,979\.23<\/td>/);
  const html = renderBudgetAppShell(pageData());
  assert.match(html, /post\("\/api\/budget\/categories\/predict", \{ category: box\.getAttribute\("data-budget-predict"\), on: box\.checked \}\)\.then\(swap\)/);
  const server = source("../src/server.ts");
  assert.match(server, /"\/api\/budget\/categories\/predict"[\s\S]*?setBudgetCategoryProjected\(body\.category, body\.on === true\)/);
  const store = source("../src/storage/budget-store.ts");
  assert.match(store, /return \{ year, subscriptions, expenses, futureSpends, additionalBudgets, projectedCategories \};/);
  // Renaming the category takes its tick with it.
  assert.match(store, /db\.budgetProjectedCategory\.deleteMany\(\{ where: \{ category: from \} \}\)/);
  assert.match(source("../prisma/schema.prisma"), /model BudgetProjectedCategory \{[^}]*category\s+String\s+@unique/);
});

test("budget page: Year Over Year compares whole finished years and tracks the current one", () => {
  const data = pageData();
  const older = yearData(2024, 25000);
  data.all = [older, ...data.all];
  const { history, totals } = renderBudgetFragments(data);
  // Finished years, then the current year's predicted figures; no subscriptions or purchase categories.
  assert.match(history, /<th><\/th><th class="[^"]*">2024-25<\/th><th class="[^"]*">2025-26<\/th><th class="[^"]*">2026-27 predicted<\/th>/);
  assert.equal(history.match(/<table/g)?.length, 1);
  assert.doesNotMatch(history, /Mailchimp|Office Signage|Facebook|data-budget-yoy-subscriptions|data-budget-yoy-groups/);
  const row = (label: string) => history.split("<tr>").find((part) => part.includes(`<strong>${label}</strong>`))!;
  // Budget increases and decreases, in dollars and %.
  assert.match(row("Budget"), /\$25,000\.00[\s\S]*\$30,000\.00<\/span><div class="text-muted text-small">\+\$5,000\.00 \(\+20\.0%\)<\/div>[\s\S]*\$60,000\.00<\/span><div class="text-muted text-small">\+\$30,000\.00 \(\+100\.0%\)<\/div>/);
  assert.match(row("Spend"), /\$13,143\.97[\s\S]*\$14,112\.10/); // 2025-26 as spent; 2026-27 predicted (132.87 + 13,979.23)
  assert.match(row("Surplus \/ deficit"), /\$45,887\.90<\/span><div class="text-muted text-small">\+76\.5% of budget<\/div>/);
  // The current year's tracker.
  const tracker = history.slice(history.indexOf("data-budget-tracker"), history.indexOf("<table"));
  assert.match(tracker, /<span>Budget vs 2025-26<\/span><strong class="">\+100\.0%<\/strong><small class="text-small text-muted">\+\$30,000\.00<\/small>/);
  assert.match(tracker, /<span>Spent to date<\/span><strong class="">\$12,976\.74<\/strong><small class="text-small text-muted">21\.6% of budget · 5 of 12 months<\/small>/);
  assert.match(tracker, /<span>Predicted spend<\/span><strong class="">\$14,112\.10<\/strong>/);
  assert.match(tracker, /<span>Predicted surplus<\/span><strong class="enrolment-quality__band--watch">\$45,887\.90<\/strong>/);
  // Desire spends: weighed against the predicted surplus, in no other figure.
  assert.match(tracker, /<span>Desire Spends<\/span><strong class="">\$1,398\.00<\/strong><small class="text-small text-muted">\$44,489\.90 left after<\/small>/);
  assert.match(tracker, /data-budget-desire-likelihood><span>Desire Spend likelihood<\/span><strong class="enrolment-quality__band--good">100%<\/strong>/);
  assert.match(totals, /<td>Desire spends \(not in predicted spend\)<\/td><td class="[^"]*">\$1,398\.00<\/td>/);
  assert.match(totals, /<span>Predicted spend<\/span><strong>\$14,112\.10<\/strong>/);
  // The PDF's year-over-year table is the same comparison.
  assert.match(source("../src/ui/budget-pdf.ts"), /comparisonTable\("", " predicted", yearComparisonRows\(comparison\)\)/);
});

test("budget page: Year Over Year adds like-for-like, usual surplus, same point, follow-through and the year type", () => {
  const data = pageData();
  const older = yearData(2024, 25000);
  data.all = [older, ...data.all];
  data.selected.additionalBudgets = [{ id: 1, budgetYearId: 2026, category: "Office Signage", amount: 20000 }];
  data.selected.futureSpends.push({ id: 77, budgetYearId: 2026, project: "Recording", supplier: "Music Works", amount: 100, qty: 1, note: "Stand", status: "bought", expenseId: null, createdAt: created });
  data.previous!.year.outlook = "bearish";
  const { history } = renderBudgetFragments(data);
  const row = (label: string) => history.split("<tr>").find((part) => part.includes(`<strong>${label}</strong>`))!;
  // The $20,000 for the signage is a one-off: without it the budget rose 33.3%, not 100%.
  assert.match(row("Budget without one-offs"), /\$40,000\.00<\/span><div class="text-muted text-small">\+\$10,000\.00 \(\+33\.3%\)<\/div>/);
  assert.match(row("Spend without one-offs"), /\$2,079\.20/); // 132.87 + Facebook 1,946.33
  // How the finished years ended: (25,000 - 13,143.97) / 25,000 and (30,000 - 13,143.97) / 30,000.
  assert.match(history, /data-budget-usual-surplus><span>Usual surplus<\/span><strong class="">51\.8% of budget<\/strong><small class="text-small text-muted">2024-25 · 2025-26<\/small>/);
  assert.match(row("Subscriptions share of budget"), /0\.2%<\/span><div class="text-muted text-small">\$132\.87<\/div>/);
  // 12 Nov: purchases to the end of October. The finished years' fixture purchases are undated, so no figure.
  const samePoint = row("Purchases to end of October");
  assert.equal(samePoint.match(/—/g)?.length, 2);
  assert.match(samePoint, /\$12,843\.87/); // the signage came from the workbook (by September) + Meta in October
  assert.match(row("Desire Spends bought"), /\$100\.00 of \$1,498\.00<\/span><div class="text-muted text-small">1 of 2<\/div>/);
  // Year type: the user's call, set per year from its pencil in a modal.
  const type = row("Year type");
  assert.match(type, /<i class="bi bi-graph-down-arrow" aria-hidden="true"><\/i> Bearish<\/span>/);
  assert.match(type, /data-budget-edit="outlook" data-title="Year type 2026-27" data-values="\{&quot;targetYear&quot;:2026,&quot;outlook&quot;:&quot;&quot;\}"/);
  const html = renderBudgetAppShell(data);
  assert.match(html, /data-budget-dialog="outlook" data-noun="Year type" data-submit="Save"[\s\S]*?name="targetYear"[\s\S]*?<option value="">Not set<\/option><option value="bullish">Bullish<\/option><option value="bearish">Bearish<\/option>/);
  assert.match(html, /kind === "outlook" \? "\/api\/budget\/years\/" \+ payload\.targetYear \+ "\/settings"/);
  // Saved for the year in the URL; the panels come back for the year on the page.
  assert.match(source("../src/server.ts"), /return budgetFragmentsReply\(\{ year: parseBudgetYear\(body\.year\) \?\? year \}\);/);
  assert.match(source("../prisma/schema.prisma"), /model BudgetYear \{[^}]*outlook\s+String\s+@default\(""\)/);
});

test("budget page: Marketing results set the spend against children enrolled and the Meta results", () => {
  const data = pageData();
  assert.doesNotMatch(renderBudgetFragments(data).history, /data-budget-yoy-marketing/); // nothing stored: no table
  const month = (name: string, roll: number | null, metaSpend: number, metaLandingViews: number, metaLeads: number) => ({ month: name, roll, metaSpend, metaLandingViews, metaLeads });
  data.outcomes = [month("2025-07", 800, 1000, 2000, 10), month("2026-06", 900, 1000, 3000, 30), month("2026-07", 880, 300, 1500, 5), month("2026-11", null, 100, 500, 0)];
  const { history } = renderBudgetFragments(data);
  const table = history.slice(history.indexOf("data-budget-yoy-marketing"));
  assert.match(table, /<th>Marketing results<\/th><th class="[^"]*">2025-26<\/th><th class="[^"]*">2026-27 to date<\/th>/);
  const row = (label: string) => table.split("<tr>").find((part) => part.includes(`<strong>${label}</strong>`))!;
  // Average of the complete months; the unfinished month (no roll yet) is left out.
  assert.match(row("Children enrolled"), />850<\/span>[\s\S]*>880<\/span><div class="text-muted text-small">\+30 \(\+3\.5%\) · 1 month<\/div>/);
  assert.match(row("Budget spend per child"), /\$15\.46<\/span>[\s\S]*\$16\.04<\/span><div class="text-muted text-small">\+\$0\.58 \(\+3\.8%\)<\/div>/);
  // Running totals for the year so far carry no change; the cost of each result does.
  assert.match(row("Meta ad spend"), /\$2,000\.00<\/span><\/td><td class="[^"]*"><span class="">\$400\.00<\/span><\/td>/);
  assert.match(row("Meta landing page views"), />5,000<\/span><\/td><td class="[^"]*"><span class="">2,000<\/span><\/td>/);
  assert.match(row("Cost per landing page view"), /\$0\.40<\/span>[\s\S]*\$0\.20<\/span><div class="text-muted text-small">-\$0\.20 \(-50\.0%\)<\/div>/);
  assert.match(row("Meta leads"), />40<\/span>[\s\S]*>5<\/span><\/td>/);
  assert.match(row("Cost per lead"), /\$50\.00<\/span>[\s\S]*\$80\.00<\/span><div class="text-muted text-small">\+\$30\.00 \(\+60\.0%\)<\/div>/);
  // Read-only: the stored roll and Meta results, nothing fetched or written.
  const outcomes = source("../src/budget/outcomes.ts");
  assert.match(outcomes, /FROM "CentreMonthlyRoll"/);
  assert.match(outcomes, /FROM "MetaInsightSnapshot"/);
  assert.doesNotMatch(outcomes, /INSERT|UPDATE|DELETE|upsert|create\(/);
  const server = source("../src/server.ts");
  assert.match(server, /buildBudgetGrounding\(await readAllBudgetYearData\(\), new Date\(\), await readBudgetOutcomes\(\)\)/);
  assert.match(server, /renderBudgetPdf\(data\.selected, data\.previous, data\.all, data\.now, data\.outcomes\)/);
});

test("budget page: Desire Spends (was Future Spends) is the same card design as Purchases, by category", () => {
  const data = pageData();
  const spend = (id: number, project: string, note: string, amount: number, qty: number, status: "planned" | "tbc" | "bought") => ({ id, budgetYearId: 2026, project, supplier: "Music Works", amount, qty, note, status, expenseId: null, createdAt: created });
  data.selected.futureSpends = [spend(1, "Recording", "Mic bundle", 699, 2, "tbc"), spend(2, "Recording", "Stand", 100, 1, "planned"), spend(3, "Recording", "Cable", 20, 1, "planned"), spend(4, "Recording", "Pop filter", 30, 1, "planned"), spend(5, "Recording", "Old mic", 500, 1, "bought"), spend(6, "Signage", "Banner", 250, 1, "planned")];
  const { future, futureCategories } = renderBudgetFragments(data);
  const [grid, template] = future.split('<template data-budget-card-template="future">');
  assert.match(grid, /class="budget-purchase-grid grid gap-12" data-budget-grid="future"/);
  const cards = grid.split("<section").slice(1);
  assert.deepEqual(cards.map((card) => card.match(/data-budget-card="([^"]*)"/)![1]), ["Recording", "Signage"]); // biggest total first
  // Running total of what is still to buy (bought ones left out), Add in the top row, three rows.
  assert.match(cards[0], /<strong>\$1,548\.00<\/strong><button type="button" class="button-sm" data-budget-add-item="future" data-category="Recording">/);
  assert.match(cards[0], /4 to buy · 1 bought/);
  assert.equal(cards[0].match(/<tr>/g)?.length, 3);
  assert.ok(cards[0].includes("Pop filter") && !cards[0].includes("Old mic"));
  assert.match(template, /data-budget-add-item="future" data-category=""/);
  // The full list on the right: every spend, Rename and Delete; a bought one has no buttons.
  const all = futureCategories.split("<section").find((section) => section.includes('data-budget-category="Recording"'))!;
  assert.match(all, /data-budget-kind="future"[^>]* hidden>/);
  assert.equal(all.match(/<tr>/g)?.length, 5);
  assert.match(all, /data-budget-category-rename="Recording"/);
  assert.match(all, /data-confirm="Delete Recording and its 4 desire spends still to buy in 2026-27\?/);
  assert.match(all, /\$699\.00 × 2/);
  assert.doesNotMatch(all.split("<tr>").find((row) => row.includes("Old mic"))!, /data-budget-edit|data-budget-delete|data-budget-bought/);
  const html = renderBudgetAppShell(data);
  assert.match(html, /<h2 class="panel__title[^"]*">Desire Spends<\/h2>|>Desire Spends</);
  assert.doesNotMatch(html, /Future Spend|future spend/);
  assert.match(html, /data-budget-dialog="future" data-noun="desire spend"/);
  assert.match(html, /data-budget-new-category="future"/);
  assert.match(html, /data-budget-fragment="futureCategories"/);
  assert.match(html, /<select class="form-control" name="project" required data-budget-categories><\/select>/);
  assert.match(html, /else openDialog\("future", \{ project: title \}\);/);
  const server = source("../src/server.ts");
  assert.match(server, /"\/api\/budget\/future-categories\/rename"[\s\S]*?renameBudgetFutureCategory\(year, body\.from, body\.to\)/);
  assert.match(server, /"\/api\/budget\/future-categories\/delete"[\s\S]*?deleteBudgetFutureCategory\(year, body\.category\)/);
});

test("budget page: totals beside the Purchases and Subscriptions titles", () => {
  const data = pageData();
  const fragments = renderBudgetFragments(data);
  assert.equal(fragments.purchasesTotal, "$12,843.87"); // 12032.90 + 810.97
  assert.equal(fragments.subscriptionsTotal, "$152.80"); // active only, same as the Yearly total row
  const html = renderBudgetAppShell(data);
  assert.match(html, /<strong data-budget-fragment="purchasesTotal">\$12,843\.87<\/strong>/);
  assert.match(html, /<strong data-budget-fragment="subscriptionsTotal">\$152\.80<\/strong>/);
  assert.equal(html.match(/data-budget-form="future"/g)?.length, 1);
  assert.match(html, /<dialog class="wiki-modal text-body" data-budget-dialog="future"/);
  assert.doesNotMatch(fragments.future, /<form/);
});

test("budget page: the threshold is never shown or typed in; the budget is edited from its tile", () => {
  const data = pageData();
  const html = renderBudgetAppShell(data);
  assert.doesNotMatch(html, /threshold/i);
  const { totals } = renderBudgetFragments(data);
  assert.doesNotMatch(totals, /name="operatingBudget"/);
  assert.match(totals, /<span>Budget <button type="button" class="button-remove" data-budget-edit="budget" data-values="\{&quot;operatingBudget&quot;:60000\}" aria-label="Edit budget"/);
  assert.match(html, /<dialog class="wiki-modal text-body" data-budget-dialog="budget" data-noun="Budget 2026-27" data-submit="Save"[\s\S]*?name="operatingBudget"/);
  assert.match(html, /kind === "budget" \|\| kind === "report" \? "\/api\/budget\/years\/"/);
  assert.doesNotMatch(source("../src/ui/budget-pdf.ts"), /threshold/i);
  assert.doesNotMatch(source("../src/server.ts"), /thresholdPercent/);
});

test("budget page: subscriptions show yearly cost, calculated inc % and start/end dates in one table", () => {
  const { subscriptions } = renderBudgetFragments(pageData());
  assert.match(subscriptions, /\$152\.80/);
  assert.match(subscriptions, /-55\.7%/); // 152.80 vs 345.12 last year
  assert.match(subscriptions, /<th>Started<\/th><th>Ended<\/th>/);
  assert.match(subscriptions, /1 Jul 2023/);
  // No separate Ended table: an ended subscription is a row with its end date and no yearly cost.
  assert.doesNotMatch(subscriptions, /data-budget-ended|<th>Payments<\/th>/);
  assert.equal(subscriptions.match(/<table/g)?.length, 1);
  const zoom = subscriptions.split("<tr>").find((row) => row.includes("Zoom"))!;
  assert.match(zoom, /30 Sept? 2026/);
  assert.doesNotMatch(zoom, /\$1,010\.64/);
  assert.match(zoom, /data-budget-edit="subscription"/);
});

test("budget page: subscriptions are added and edited in a modal with the standard date fields", () => {
  const data = pageData();
  const html = renderBudgetAppShell(data);
  assert.match(html, /data-budget-add-subscription><i class="bi bi-plus-lg ui-icon" aria-hidden="true"><\/i><span>Add subscription<\/span>/);
  assert.equal(html.match(/data-budget-form="subscription"/g)?.length, 1);
  assert.doesNotMatch(renderBudgetFragments(data).subscriptions, /<form/);
  const start = html.indexOf('data-budget-dialog="subscription"');
  const dialog = html.slice(start, html.indexOf("</dialog>", start));
  for (const name of ["name", "amount", "frequency", "startedOn", "endedOn", "status", "tally", "note"]) assert.match(dialog, new RegExp(`name="${name}"`));
  assert.equal(dialog.match(/class="date-combo"/g)?.length, 2);
  assert.doesNotMatch(dialog, /type="date" name=/);
  assert.match(html, /openDialog\("subscription", \{\}\);/);
});

test("budget: start/end dates are stored on the subscription; unended ones carry into a new year", () => {
  const schema = source("../prisma/schema.prisma");
  assert.match(schema, /model BudgetSubscription \{[^}]*startedOn\s+DateTime\?\s+@db\.Date[^}]*endedOn\s+DateTime\?\s+@db\.Date/);
  const store = source("../src/storage/budget-store.ts");
  assert.match(store, /copyActiveBudgetSubscriptions[\s\S]*?status: "active", subscription: \{ OR: \[\{ endedOn: null \}, \{ endedOn: \{ gte: newYearStart \} \}\] \}/);
  // The year created by itself on 1 July carries them over too.
  assert.match(source("../src/server.ts"), /if \(!existingYears\.includes\(currentYear\)\) \{[\s\S]*?copyActiveBudgetSubscriptions\(Math\.max\(\.\.\.earlier\), currentYear\)/);
});

test("budget page: future spends can be bought; panel bodies have no explainer paragraphs", () => {
  const fragments = renderBudgetFragments(pageData());
  assert.match(fragments.future, /data-budget-bought=/);
  for (const html of Object.values(fragments)) assert.doesNotMatch(html, /<p(\s|>)/);
});

test("landing: Budget tile replaces Things To Know, which moves after Sector Insight", () => {
  const html = renderLandingPage({});
  const buttons = html.slice(html.indexOf("landing__buttons"), html.indexOf("landing__tiles"));
  assert.match(buttons, /href="\/budget"/);
  assert.doesNotMatch(buttons, /href="\/wiki"/);
  const tiles = html.slice(html.indexOf("landing__tiles"));
  assert.ok(tiles.indexOf('href="/sector"') < tiles.indexOf('href="/wiki"'));
});

test("landing: budget reminder card counts in the strip and can be dismissed", () => {
  const html = renderReminders(undefined, null, null, { month: "2026-11", monthLabel: "November", lastAddedAt: "3 November 2026, 9:15 am" });
  assert.match(html, /No expenses added for November/);
  assert.match(html, /Last expense added 3 November 2026, 9:15 am/);
  assert.match(html, /<form action="\/budget" method="get"><input type="hidden" name="panel" value="budget-purchases" \/><button type="submit">Add expense<\/button><\/form>/);
  assert.match(html, /data-dismiss-budget-reminder="2026-11"/);
  assert.match(html, /1 needs attention/);
  assert.equal(renderReminders(undefined, null, null, null), "");
});

test("server: budget grounding reaches Beep Beep and General Chat; dismiss stores the month", () => {
  const server = source("../src/server.ts");
  assert.equal(server.match(/await findBudgetGrounding\(prompt\)/g)?.length, 3);
  assert.match(server, /app\.post<\{ Body: \{ month\?: unknown \} \}>\("\/actions\/dismiss-budget-reminder"[\s\S]*?dismissBudgetReminder\(month\)/);
  assert.match(server, /refreshMetaAds\(metaConfig\);\n\n    app\.log\.info\(result, "Meta Ads auto-refresh completed"\);\n    void syncBudgetMetaSpend\(app\.log\);/);
  const budgetModules = ["../src/analytics/budget.ts", "../src/ui/budget-app-shell.ts", "../src/budget/meta-sync.ts", "../src/storage/budget-store.ts"].map(source).join("\n");
  assert.doesNotMatch(budgetModules, /AI_CHAT_MODEL|streamLocalChat|ollama/i);
});
