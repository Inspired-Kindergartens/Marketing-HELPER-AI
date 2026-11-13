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
    year: { id: startYear, startYear, label: `${startYear}-${(startYear + 1) % 100}`, operatingBudget: budget, thresholdPercent: 2, notes: "Notes <b>here</b>", report: "", updatedAt: created },
    additionalBudgets: [],
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
  assert.match(server, /updateBudgetYearSettings\(year, \{ operatingBudget: body\.operatingBudget, report: body\.report \}\)/);
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

test("budget page: Future Spends is the same card design as Purchases, by category", () => {
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
  assert.match(all, /data-confirm="Delete Recording and its 4 future spends still to buy in 2026-27\?/);
  assert.match(all, /\$699\.00 × 2/);
  assert.doesNotMatch(all.split("<tr>").find((row) => row.includes("Old mic"))!, /data-budget-edit|data-budget-delete|data-budget-bought/);
  const html = renderBudgetAppShell(data);
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
