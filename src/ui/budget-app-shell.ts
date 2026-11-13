import { renderLayout } from "./layout.js";
import { renderPrintAction } from "./action-buttons.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";
import {
  buildSubscriptionRows,
  buildYearOverYear,
  computeBudgetTotals,
  futureSpendTotal,
  groupPurchases,
  expenseGroup,
  percentChange,
  type BudgetStatus,
  type BudgetTotals,
  type BudgetYearData,
} from "../analytics/budget.js";
import { BUDGET_FREQUENCIES, financialYearLabel, type BudgetYearView } from "../storage/budget-store.js";

// Budget: replaces the yearly Budget Calculator workbooks. Totals stay in the
// right-hand column; subscriptions, purchases, future spends and the
// year-over-year view are the accordion. Every change swaps the panel bodies
// in place (data-budget-fragment) from the JSON the API returns.

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | null | undefined, signed = true): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const NUMERIC = "google-analytics-table__numeric data-table__numeric";

// The app's existing three-band colours (Enrolment Quality): on track is
// good, a surplus beyond the threshold is worth a look, a deficit is low.
export function statusBandClass(status: BudgetStatus | null): string {
  if (status === "on-track") return "enrolment-quality__band--good";
  if (status === "surplus") return "enrolment-quality__band--watch";
  if (status === "deficit") return "enrolment-quality__band--low";
  return "";
}

export function statusLabel(status: BudgetStatus | null): string {
  if (status === "on-track") return "On track";
  if (status === "surplus") return "Surplus";
  if (status === "deficit") return "Deficit";
  return "";
}

function dataAttribute(values: Record<string, unknown>): string {
  return escapeHtml(JSON.stringify(values));
}

function editButton(kind: string, id: number, values: Record<string, unknown>, label: string): string {
  return `<button type="button" class="button-remove" data-budget-edit="${kind}" data-id="${id}" data-values="${dataAttribute(values)}" aria-label="Edit ${escapeHtml(label)}" title="Edit"><i class="bi bi-pencil" aria-hidden="true"></i></button>`;
}

function deleteButton(kind: string, id: number, label: string): string {
  return `<button type="button" class="button-remove" data-budget-delete="${kind}" data-id="${id}" data-label="${escapeHtml(label)}" aria-label="Delete ${escapeHtml(label)}" title="Delete"><i class="bi bi-trash" aria-hidden="true"></i></button>`;
}

// ---- Totals (right-hand column) -------------------------------------------

export function renderBudgetTotals(data: BudgetYearData, now: Date): string {
  const totals = computeBudgetTotals(data, now);
  // The Budget tile's pencil opens the budget modal; the figure is typed in, never calculated.
  const budgetTile = `<div class="google-analytics-summary__item card stat-tile"><span>Budget <button type="button" class="button-remove" data-budget-edit="budget" data-values="${dataAttribute({ operatingBudget: totals.operatingBudget ?? "" })}" aria-label="Edit budget" title="Edit"><i class="bi bi-pencil" aria-hidden="true"></i></button></span><strong>${escapeHtml(formatMoney(totals.operatingBudget) || "Not set")}</strong></div>`;
  const tiles: Array<[string, string, string?]> = [
    ["Actual spend", formatMoney(totals.actualSpend), totals.spentPercent == null ? "" : `${totals.spentPercent.toFixed(1)}% of budget`],
    ["Remaining", formatMoney(totals.remaining), totals.remainingPercent == null ? "" : `${totals.remainingPercent.toFixed(1)}% of budget`],
    ["Predicted spend", formatMoney(totals.predictedSpend), `${totals.monthsElapsed} of 12 months`],
  ];
  const band = statusBandClass(totals.status);
  return `
    <div class="google-analytics-summary budget-summary grid gap-8">
      ${budgetTile}
      ${tiles.map(([label, value, note]) => `<div class="google-analytics-summary__item card stat-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small class="text-muted text-small">${escapeHtml(note)}</small>` : ""}</div>`).join("")}
      <div class="google-analytics-summary__item card stat-tile" data-budget-status-tile><span>${totals.predictedDifference != null && totals.predictedDifference < 0 ? "Predicted deficit" : "Predicted surplus"}</span><strong class="${band}">${escapeHtml(formatMoney(totals.predictedDifference == null ? null : Math.abs(totals.predictedDifference)))}</strong><small class="text-small ${band}">${escapeHtml([formatPercent(totals.predictedPercent), statusLabel(totals.status)].filter(Boolean).join(" · "))}</small></div>    </div>
    <div class="table-frame">
      <table class="data-table">
        <tbody>${totals.additionalBudget > 0 ? `
          <tr data-budget-additional-row><td>Additional budget (part of the budget)</td><td class="${NUMERIC}">${formatMoney(totals.additionalBudget)}</td></tr>` : ""}
          <tr><td>Subscriptions (yearly, excl. GST)</td><td class="${NUMERIC}">${formatMoney(totals.subscriptions)}</td></tr>
          <tr><td>Purchases to date</td><td class="${NUMERIC}">${formatMoney(totals.purchases)}</td></tr>
          <tr><td>Predicted purchases</td><td class="${NUMERIC}">${formatMoney(totals.predictedPurchases)}</td></tr>
          <tr><td>Future spends</td><td class="${NUMERIC}">${formatMoney(totals.futureSpends)}</td></tr>
          <tr><td>Ended subscriptions (not in totals)</td><td class="${NUMERIC}">${formatMoney(totals.endedSubscriptions)}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

// ---- Subscriptions ---------------------------------------------------------

function frequencyOptions(selected: string): string {
  return BUDGET_FREQUENCIES.map((frequency) => `<option value="${frequency}"${frequency === selected ? " selected" : ""}>${frequency}</option>`).join("");
}

export function renderBudgetSubscriptions(data: BudgetYearData, previous: BudgetYearData | null, names: string[]): string {
  const rows = buildSubscriptionRows(data.subscriptions, previous?.subscriptions ?? []);
  const active = rows.filter((row) => row.status === "active").sort((a, b) => b.yearlyCost - a.yearlyCost || a.name.localeCompare(b.name));
  const ended = rows.filter((row) => row.status === "ended").sort((a, b) => a.name.localeCompare(b.name));
  const gross = active.reduce((sum, row) => sum + row.yearlyCost, 0);
  const values = (row: (typeof rows)[number]) => ({ name: row.name, amount: row.amount, frequency: row.frequency, startedOn: row.startedOn ?? "", endedOn: row.endedOn ?? "", status: row.status, tally: row.tally, note: row.note });
  const actions = (row: (typeof rows)[number]) =>
    `<td class="nowrap">${editButton("subscription", row.id, values(row), row.name)}${row.status === "active" ? `<button type="button" class="button-remove" data-budget-end="${row.id}" data-label="${escapeHtml(row.name)}" aria-label="End ${escapeHtml(row.name)}" title="End"><i class="bi bi-stop-circle" aria-hidden="true"></i></button>` : ""}${deleteButton("subscription", row.id, row.name)}</td>`;
  return `
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table" data-budget-subscriptions>
        <thead><tr><th>Subscription</th><th class="${NUMERIC}">Amount</th><th>Frequency</th><th>Started</th><th>Ended</th><th class="${NUMERIC}">Yearly cost</th><th class="${NUMERIC}">Inc</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="9" class="google-analytics-table__empty text-ghost">No subscriptions</td></tr>` : ""}
          ${[...active, ...ended]
            .map(
              (row) => `<tr>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td class="${NUMERIC}">${formatMoney(row.amount)}</td>
                <td>${escapeHtml(row.frequency)}</td>
                <td class="nowrap">${escapeHtml(formatDate(row.startedOn))}</td>
                <td class="nowrap">${escapeHtml(formatDate(row.endedOn) || (row.status === "ended" ? "Ended" : ""))}</td>
                <td class="${NUMERIC}">${row.status === "active" ? formatMoney(row.yearlyCost) : ""}</td>
                <td class="${NUMERIC}">${row.status === "active" ? escapeHtml(formatPercent(row.increasePercent)) : ""}</td>
                <td>${escapeHtml(row.note)}</td>
                ${actions(row)}
              </tr>`,
            )
            .join("")}
          <tr class="data-table__total-row"><td><strong>Yearly total</strong></td><td></td><td></td><td></td><td></td><td class="${NUMERIC}"><strong>${formatMoney(gross)}</strong></td><td></td><td>excl. GST ${formatMoney(gross / 1.15)}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <datalist id="budget-subscription-names">${names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
  `;
}

// ---- Purchases ---------------------------------------------------------------

// Shared by the category cards (left) and the full category lists (right).
function purchaseParts(data: BudgetYearData) {
  const groups = groupPurchases(data.expenses);
  const byGroup = new Map<string, BudgetYearData["expenses"]>();
  for (const expense of data.expenses) {
    const key = expenseGroup(expense);
    byGroup.set(key, [...(byGroup.get(key) ?? []), expense]);
  }
  // Notes show in the full list on the right only, not on the cards.
  const row = (expense: BudgetYearData["expenses"][number], withNote: boolean) => `<tr>
              <td>${escapeHtml(expense.supplier)}${withNote && expense.note ? `<div class="text-muted text-small">${escapeHtml(expense.note)}</div>` : ""}</td>
              <td class="nowrap">${escapeHtml(formatDate(expense.spentOn))}</td>
              <td class="${NUMERIC}">${formatMoney(expense.amount)}</td>
              <td class="nowrap">${
                expense.source === "meta"
                  ? ""
                  : `${editButton("expense", expense.id, { supplier: expense.supplier, group: expenseGroup(expense), amount: expense.amount, spentOn: expense.spentOn ?? "", note: expense.note }, expense.supplier)}${deleteButton("expense", expense.id, `${expense.supplier} ${formatMoney(expense.amount)}`)}`
              }</td>
            </tr>`;
  const table = (items: BudgetYearData["expenses"], withNote = false) =>
    `<div class="table-frame table-frame--scroll"><table class="data-table"><tbody>${items.map((expense) => row(expense, withNote)).join("")}</tbody></table></div>`;
  // Newest first; undated (imported) purchases go last.
  const items = (group: string) => [...(byGroup.get(group) ?? [])].sort((a, b) => (b.spentOn ?? "").localeCompare(a.spentOn ?? "") || b.id - a.id);
  // Additional budget given for the category this year (0 = none).
  const additional = (group: string) => data.additionalBudgets.filter((entry) => entry.category === group).reduce((sum, entry) => sum + entry.amount, 0);
  const header = (group: (typeof groups)[number]) => `
      ${categoryTitleRow("expense", group.group, group.total)}
      <div class="text-muted text-small">${group.count} item${group.count === 1 ? "" : "s"} · ${group.percentOfPurchases.toFixed(1)}% of spend${additional(group.group) > 0 ? ` · additional budget ${formatMoney(additional(group.group))}` : ""}</div>`;
  // A category holding Meta rows is read-only, like the rows themselves.
  const locked = (group: string) => (byGroup.get(group) ?? []).some((expense) => expense.source === "meta");
  return { groups, items, header, table, locked, additional };
}

// Purchases and Future Spends share one design: a grid of category cards
// (three a row), each with a running total, an Add button and its last three
// rows; clicking a card lists all of its rows in the right-hand column.
type CardKind = "expense" | "future";
const ADD_LABEL: Record<CardKind, string> = { expense: "Add purchase", future: "Add spend" };

// A category's top row: name, running total and Add, which opens that kind's
// modal with this category filled in.
function categoryTitleRow(kind: CardKind, category: string, total: number): string {
  return `<div class="section-header"><h3 class="section-title">${escapeHtml(category)}</h3><div class="flex items-center gap-8"><strong>${formatMoney(total)}</strong><button type="button" class="button-sm" data-budget-add-item="${kind}" data-category="${escapeHtml(category)}"><i class="bi bi-plus-lg" aria-hidden="true"></i>${ADD_LABEL[kind]}</button></div></div>`;
}

// The grid of cards. The <template> is the empty card the New category
// button copies.
function categoryGrid(kind: CardKind, cards: Array<{ category: string; body: string }>): string {
  return `
    <div class="budget-purchase-grid grid gap-12" data-budget-grid="${kind}">
      ${cards
        .map(
          (card) => `
    <section class="card budget-purchase-card flex flex-col gap-8" data-budget-card="${escapeHtml(card.category)}">${card.body}
    </section>`,
        )
        .join("")}
    </div>
    <template data-budget-card-template="${kind}">
    <section class="card budget-purchase-card flex flex-col gap-8" data-budget-card="">
      ${categoryTitleRow(kind, "", 0)}
    </section>
    </template>
  `;
}

// A category's full list for the right-hand column. All start hidden; the
// page shows the one whose card was clicked, in place of Totals. manage is
// its Rename/Delete buttons (empty when the category is read-only).
function categorySide(kind: CardKind, category: string, manage: string, body: string): string {
  return `
    <section class="flex flex-col gap-8" data-budget-category="${escapeHtml(category)}" data-budget-kind="${kind}" data-budget-card="${escapeHtml(category)}" hidden>
      <div class="flex justify-between gap-8"><div class="flex gap-8">${manage}</div><button type="button" class="button-sm" data-budget-category-close><i class="bi bi-x-lg" aria-hidden="true"></i>Close</button></div>${body}
    </section>`;
}

function categoryManage(category: string, deleteConfirm: string): string {
  return `<button type="button" class="button-sm" data-budget-category-rename="${escapeHtml(category)}"><i class="bi bi-pencil" aria-hidden="true"></i>Rename</button>${
    deleteConfirm ? `<button type="button" class="button-sm" data-budget-category-delete="${escapeHtml(category)}" data-confirm="${escapeHtml(deleteConfirm)}"><i class="bi bi-trash" aria-hidden="true"></i>Delete</button>` : ""
  }`;
}

// An add/edit modal (purchases, future spends). The Add button opens it
// empty (purchases: that card's category and today's date); the pencil on a
// row opens it with that row. kind is the data-budget-form kind it saves as.
// "bought" is the date asked for when a future spend is bought: its title
// and button are fixed (submitLabel) rather than Add/Edit.
function renderBudgetDialog(kind: "expense" | "future" | "bought" | "budget" | "subscription" | "additional" | "report", noun: string, fields: string, submitLabel = "", wide = false): string {
  return `
    <dialog class="wiki-modal${wide ? " wiki-modal--wide" : ""} text-body" data-budget-dialog="${kind}" data-noun="${escapeHtml(noun)}"${submitLabel ? ` data-submit="${escapeHtml(submitLabel)}"` : ""} aria-label="${escapeHtml(noun)}">
      <form class="wiki-modal__form flex flex-col gap-12" data-budget-form="${kind}">
        <input type="hidden" name="id" value="" />
        <h2 class="wiki-modal__title text-strong" data-budget-dialog-title>Add ${escapeHtml(noun)}</h2>${fields}
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-budget-dialog-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md" data-budget-submit>Add</button>
        </div>
      </form>
    </dialog>
  `;
}

// The app's standard date field (as on Tasks): a typed box, a calendar
// button and the browser's picker behind it.
const dateField = (name: string, label: string) => `
        <div class="wiki-modal__field field-label"><span>${label}</span>
          <span class="date-combo">
            <input class="form-control" type="text" name="${name}" placeholder="YYYY-MM-DD" inputmode="numeric" aria-label="${label}" autocomplete="off" data-date-text />
            <button type="button" class="date-combo__button" data-open-date-picker title="Choose date" aria-label="Choose date"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="date-combo__picker" tabindex="-1" aria-hidden="true" data-date-picker />
          </span>
        </div>`;
const DATE_FIELD = dateField("spentOn", "Date");

// Add and edit a subscription. The name suggests ones used in other years
// (the datalist is in the Subscriptions fragment, so it follows every save).
const SUBSCRIPTION_DIALOG_FIELDS = `
        <label class="wiki-modal__field field-label"><span>Subscription</span><input class="form-control" type="text" name="name" maxlength="200" required list="budget-subscription-names" autocomplete="off" /></label>
        <label class="wiki-modal__field field-label"><span>Amount</span><input class="form-control" type="text" inputmode="decimal" name="amount" required autocomplete="off" /></label>
        <label class="wiki-modal__field field-label"><span>Frequency</span><select class="form-control" name="frequency">${frequencyOptions("month")}</select></label>
${dateField("startedOn", "Started")}
${dateField("endedOn", "Ended")}
        <label class="wiki-modal__field field-label"><span>Status</span><select class="form-control" name="status"><option value="active">active</option><option value="ended">ended</option></select></label>
        <label class="wiki-modal__field field-label"><span>Payments</span><input class="form-control" type="number" min="0" name="tally" value="0" /></label>
        <label class="wiki-modal__field field-label"><span>Note</span><input class="form-control" type="text" name="note" maxlength="2000" autocomplete="off" /></label>`;

const PURCHASE_DIALOG_FIELDS = `
        <label class="wiki-modal__field field-label"><span>Supplier</span><input class="form-control" type="text" name="supplier" maxlength="200" required autocomplete="off" /></label>
        <label class="wiki-modal__field field-label"><span>Amount</span><input class="form-control" type="text" inputmode="decimal" name="amount" required autocomplete="off" /></label>
${DATE_FIELD}
        <label class="wiki-modal__field field-label"><span>Category</span><select class="form-control" name="group" required data-budget-categories></select></label>
        <label class="wiki-modal__field field-label"><span>Note</span><input class="form-control" type="text" name="note" maxlength="2000" autocomplete="off" /></label>`;

// One card per category, three a row: running total, Add purchase and the
// last three purchases. Clicking a card lists all of its purchases in the
// right-hand column (renderBudgetCategories). The <template> is the empty
// card the New category button copies.
export function renderBudgetPurchases(data: BudgetYearData): string {
  const { groups, items, header, table } = purchaseParts(data);
  return categoryGrid(
    "expense",
    groups.map((group) => ({
      category: group.group,
      body: `
      ${header(group)}
      ${table(items(group.group).slice(0, 3))}`,
    })),
  );
}

// Every purchase of each category, for the right-hand column. All start
// hidden; the page shows the one whose card was clicked, in place of Totals.
export function renderBudgetCategories(data: BudgetYearData): string {
  const { groups, items, header, table, locked, additional } = purchaseParts(data);
  // Additional budget: extra budget given for this category this year (a
  // one-off). Opens its modal with the amount already set, if any.
  const additionalButton = (group: string) =>
    `<button type="button" class="button-sm" data-budget-additional="${escapeHtml(group)}" data-values="${dataAttribute({ category: group, amount: additional(group) || "" })}"><i class="bi bi-cash-coin" aria-hidden="true"></i>Additional budget</button>`;
  return groups
    .map((group) =>
      categorySide(
        "expense",
        group.group,
        (locked(group.group) ? "" : categoryManage(group.group, `Delete ${group.group} and its ${group.count} purchase${group.count === 1 ? "" : "s"} in ${data.year.label}? This can't be undone.`)) + additionalButton(group.group),
        `
      ${header(group)}
      ${table(items(group.group), true)}`,
      ),
    )
    .join("");
}

// ---- Future spends ------------------------------------------------------------

// A future spend's category is its project (what a bought one becomes the
// purchase category of). Totals count what is still to buy, not bought ones.
function futureParts(data: BudgetYearData) {
  const byCategory = new Map<string, BudgetYearData["futureSpends"]>();
  for (const spend of data.futureSpends) byCategory.set(spend.project, [...(byCategory.get(spend.project) ?? []), spend]);
  const isOpen = (spend: BudgetYearData["futureSpends"][number]) => spend.status !== "bought";
  const groups = [...byCategory.entries()]
    .map(([category, spends]) => ({
      category,
      count: spends.length,
      openCount: spends.filter(isOpen).length,
      total: spends.filter(isOpen).reduce((sum, spend) => sum + futureSpendTotal(spend), 0),
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
  // Still to buy first, newest first; bought ones last.
  const items = (category: string) => [...(byCategory.get(category) ?? [])].sort((a, b) => (isOpen(a) ? 0 : 1) - (isOpen(b) ? 0 : 1) || b.id - a.id);
  const statusText = { planned: "", tbc: "TBC", bought: "Bought" } as const;
  // Cards show one line per spend; the full list on the right adds the
  // supplier, amount x quantity and the Bought button in words.
  const row = (spend: BudgetYearData["futureSpends"][number], full: boolean) => {
    const label = spend.note || spend.supplier || spend.project;
    const detail = [spend.note ? spend.supplier : "", spend.qty > 1 ? `${formatMoney(spend.amount)} × ${spend.qty}` : ""].filter(Boolean).join(" · ");
    const boughtButton = full
      ? `<button type="button" class="button-sm" data-budget-bought="${spend.id}" data-label="${escapeHtml(label)}">Bought</button>`
      : `<button type="button" class="button-remove" data-budget-bought="${spend.id}" data-label="${escapeHtml(label)}" aria-label="Bought ${escapeHtml(label)}" title="Bought"><i class="bi bi-bag-check" aria-hidden="true"></i></button>`;
    return `<tr>
              <td>${escapeHtml(label)}${full && detail ? `<div class="text-muted text-small">${escapeHtml(detail)}</div>` : ""}</td>
              <td class="nowrap text-muted text-small">${statusText[spend.status]}</td>
              <td class="${NUMERIC}">${formatMoney(futureSpendTotal(spend))}</td>
              <td class="nowrap">${
                isOpen(spend)
                  ? `${boughtButton}${editButton("future", spend.id, { project: spend.project, supplier: spend.supplier, amount: spend.amount, qty: spend.qty, note: spend.note, status: spend.status }, label)}${deleteButton("future", spend.id, label)}`
                  : ""
              }</td>
            </tr>`;
  };
  const table = (spends: BudgetYearData["futureSpends"], full = false) =>
    `<div class="table-frame table-frame--scroll"><table class="data-table"><tbody>${spends.map((spend) => row(spend, full)).join("")}</tbody></table></div>`;
  const header = (group: (typeof groups)[number]) => `
      ${categoryTitleRow("future", group.category, group.total)}
      <div class="text-muted text-small">${group.openCount} to buy${group.count > group.openCount ? ` · ${group.count - group.openCount} bought` : ""}</div>`;
  return { groups, items, header, table };
}

export function renderBudgetFutureSpends(data: BudgetYearData): string {
  const { groups, items, header, table } = futureParts(data);
  return categoryGrid(
    "future",
    groups.map((group) => ({
      category: group.category,
      body: `
      ${header(group)}
      ${table(items(group.category).slice(0, 3))}`,
    })),
  );
}

// Rename covers every spend in the category; Delete only what is still to
// buy (bought ones are purchases now), so it is left out when nothing is.
export function renderBudgetFutureCategories(data: BudgetYearData): string {
  const { groups, items, header, table } = futureParts(data);
  return groups
    .map((group) =>
      categorySide(
        "future",
        group.category,
        categoryManage(group.category, group.openCount ? `Delete ${group.category} and its ${group.openCount} future spend${group.openCount === 1 ? "" : "s"} still to buy in ${data.year.label}? This can't be undone.` : ""),
        `
      ${header(group)}
      ${table(items(group.category), true)}`,
      ),
    )
    .join("");
}

const FUTURE_DIALOG_FIELDS = `
        <label class="wiki-modal__field field-label"><span>Category</span><select class="form-control" name="project" required data-budget-categories></select></label>
        <label class="wiki-modal__field field-label"><span>Supplier</span><input class="form-control" type="text" name="supplier" maxlength="200" autocomplete="off" /></label>
        <label class="wiki-modal__field field-label"><span>Amount</span><input class="form-control" type="text" inputmode="decimal" name="amount" required autocomplete="off" /></label>
        <label class="wiki-modal__field field-label"><span>Qty</span><input class="form-control" type="number" min="1" name="qty" value="1" /></label>
        <label class="wiki-modal__field field-label"><span>Status</span><select class="form-control" name="status"><option value="planned">Planned</option><option value="tbc">TBC</option></select></label>
        <label class="wiki-modal__field field-label"><span>Note</span><input class="form-control" type="text" name="note" maxlength="2000" autocomplete="off" /></label>`;

// ---- Year over year -------------------------------------------------------------

function changeCell(from: number | null | undefined, to: number | null | undefined): string {
  const change = percentChange(from, to);
  return change == null ? "" : `<span>${escapeHtml(formatPercent(change))}</span>`;
}

export function renderBudgetYearOverYear(all: BudgetYearData[], now: Date): string {
  const yoy = buildYearOverYear(all, now);
  if (yoy.years.length === 0) return `<p class="google-analytics-panel__empty">No years yet</p>`;
  const head = `<th></th>${yoy.years.map((year) => `<th class="${NUMERIC}">${financialYearLabel(year)}</th>`).join("")}`;
  const totalsRow = (label: string, pick: (totals: BudgetTotals) => number | null) =>
    `<tr><td><strong>${escapeHtml(label)}</strong></td>${yoy.totals
      .map((totals, index) => `<td class="${NUMERIC}">${formatMoney(pick(totals))}${index > 0 ? changeCell(pick(yoy.totals[index - 1]), pick(totals)) : ""}</td>`)
      .join("")}</tr>`;
  const seriesCell = (values: Record<number, number | null>, index: number) => {
    const year = yoy.years[index];
    const value = values[year];
    if (value == null) return `<td class="${NUMERIC}"></td>`;
    return `<td class="${NUMERIC}">${formatMoney(value)}${index > 0 ? changeCell(values[yoy.years[index - 1]], value) : ""}</td>`;
  };
  return `
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table" data-budget-yoy-totals>
        <thead><tr>${head}</tr></thead>
        <tbody>
          ${totalsRow("Budget", (totals) => totals.operatingBudget)}
          ${totalsRow("Subscriptions (excl. GST)", (totals) => totals.subscriptions)}
          ${totalsRow("Purchases", (totals) => totals.purchases)}
          ${totalsRow("Actual spend", (totals) => totals.actualSpend)}
          ${totalsRow("Remaining", (totals) => totals.remaining)}
          ${totalsRow("Ended subscriptions", (totals) => totals.endedSubscriptions)}
        </tbody>
      </table>
    </div>
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table" data-budget-yoy-subscriptions>
        <thead><tr>${head.replace("<th></th>", "<th>Subscription (yearly cost)</th>")}</tr></thead>
        <tbody>
          ${yoy.subscriptions.map((entry) => `<tr><td><strong>${escapeHtml(entry.name)}</strong></td>${yoy.years.map((_, index) => seriesCell(entry.costs, index)).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table" data-budget-yoy-groups>
        <thead><tr>${head.replace("<th></th>", "<th>Purchase group</th>")}</tr></thead>
        <tbody>
          ${yoy.groups.map((entry) => `<tr><td><strong>${escapeHtml(entry.group)}</strong></td>${yoy.years.map((_, index) => seriesCell(entry.totals, index)).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ---- Page ------------------------------------------------------------------------

export type BudgetPageData = {
  years: BudgetYearView[];
  selected: BudgetYearData;
  previous: BudgetYearData | null;
  all: BudgetYearData[];
  subscriptionNames: string[];
  now: Date;
};

export type BudgetFragments = Record<"totals" | "categories" | "futureCategories" | "subscriptions" | "subscriptionsTotal" | "purchases" | "purchasesTotal" | "future" | "history", string>;

export function renderBudgetFragments(data: BudgetPageData): BudgetFragments {
  // The figures beside the panel titles: the same totals as the panels' own.
  const subscriptionsTotal = buildSubscriptionRows(data.selected.subscriptions, [])
    .filter((row) => row.status === "active")
    .reduce((sum, row) => sum + row.yearlyCost, 0);
  const purchasesTotal = data.selected.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    subscriptionsTotal: formatMoney(subscriptionsTotal),
    purchasesTotal: formatMoney(purchasesTotal),
    totals: renderBudgetTotals(data.selected, data.now),
    categories: renderBudgetCategories(data.selected),
    futureCategories: renderBudgetFutureCategories(data.selected),
    subscriptions: renderBudgetSubscriptions(data.selected, data.previous, data.subscriptionNames),
    purchases: renderBudgetPurchases(data.selected),
    future: renderBudgetFutureSpends(data.selected),
    history: renderBudgetYearOverYear(data.all, data.now),
  };
}

const fragment = (key: keyof BudgetFragments, html: string) => `<div class="flex flex-col gap-12" data-budget-fragment="${key}">${html}</div>`;

function renderBudgetScript(startYear: number): string {
  return `
    <script>
      (function() {
        var YEAR = ${startYear};
        async function post(url, payload) {
          var response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.assign({ year: YEAR }, payload || {})),
          });
          var result = await response.json().catch(function() { return {}; });
          if (!response.ok || result.ok === false) throw new Error(result.error || "Request failed.");
          return result;
        }
        function swap(result) {
          if (!result || !result.fragments) return;
          Object.keys(result.fragments).forEach(function(key) {
            var holder = document.querySelector('[data-budget-fragment="' + key + '"]');
            if (holder) holder.innerHTML = result.fragments[key];
          });
          addPendingCards();
          showCategory();
        }

        // The category whose full list is in the right-hand column (null = Totals):
        // { kind: "expense" | "future", name }.
        var selectedCategory = null;
        function showCategory() {
          var found = false;
          document.querySelectorAll("[data-budget-category]").forEach(function(section) {
            var on = selectedCategory !== null && section.getAttribute("data-budget-kind") === selectedCategory.kind && section.getAttribute("data-budget-category") === selectedCategory.name;
            section.hidden = !on;
            if (on) found = true;
          });
          if (!found) selectedCategory = null;
          var totals = document.querySelector('[data-budget-fragment="totals"]');
          if (totals) totals.hidden = found;
        }

        // A category only exists once it has a row, so new ones are kept here
        // (per kind) and their empty cards re-added after every fragment swap.
        var pendingCategories = { expense: [], future: [] };
        function findCard(kind, name) {
          var match = null;
          document.querySelectorAll('[data-budget-grid="' + kind + '"] [data-budget-card]').forEach(function(card) {
            if (card.getAttribute("data-budget-card").toLowerCase() === name.toLowerCase()) match = card;
          });
          return match;
        }
        function addPendingCards() {
          Object.keys(pendingCategories).forEach(function(kind) {
            var grid = document.querySelector('[data-budget-grid="' + kind + '"]');
            var template = document.querySelector('[data-budget-card-template="' + kind + '"]');
            if (!grid || !template) return;
            pendingCategories[kind] = pendingCategories[kind].filter(function(name) {
              if (findCard(kind, name)) return false;
              var card = template.content.firstElementChild.cloneNode(true);
              card.setAttribute("data-budget-card", name);
              card.querySelector(".section-title").textContent = name;
              card.querySelector("[data-budget-add-item]").setAttribute("data-category", name);
              grid.appendChild(card);
              return true;
            });
          });
        }
        var CATEGORY_ROUTES = { expense: "/api/budget/categories", future: "/api/budget/future-categories" };
        var CATEGORY_PANELS = { expense: "budget-purchases", future: "budget-future" };
        function fail(error) { window.alert(error.message || "Request failed."); }
        var ROUTES = { subscription: "/api/budget/subscriptions", expense: "/api/budget/expenses", future: "/api/budget/future", additional: "/api/budget/additional" };

        // The year's report in its modal for editing: the saved one, or one
        // written from the figures now (fresh = write it again regardless).
        function loadReport(fresh) {
          return fetch("/api/budget/years/" + YEAR + "/report" + (fresh ? "?fresh=1" : "")).then(function(response) {
            return response.json().catch(function() { return {}; }).then(function(result) {
              if (!response.ok || result.ok === false) throw new Error(result.error || "Request failed.");
              return result.report || "";
            });
          });
        }

        var yearSelect = document.querySelector("[data-budget-year]");
        if (yearSelect) yearSelect.addEventListener("change", function() { window.location.href = "/budget?year=" + yearSelect.value; });

        document.addEventListener("submit", function(event) {
          var form = event.target instanceof Element ? event.target.closest("[data-budget-form]") : null;
          if (!form) return;
          event.preventDefault();
          var kind = form.getAttribute("data-budget-form");
          var payload = {};
          new FormData(form).forEach(function(value, key) { payload[key] = value; });
          var url = kind === "budget" || kind === "report" ? "/api/budget/years/" + YEAR + "/settings"
            : kind === "bought" ? "/api/budget/future/" + payload.id + "/bought"
            : ROUTES[kind] + (payload.id ? "/" + payload.id : "");
          delete payload.id;
          var button = form.querySelector("[type=submit]");
          if (button) button.disabled = true;
          post(url, payload).then(function(result) {
            swap(result);
            // A modal is outside the swapped fragments: close it.
            var dialog = form.closest("[data-budget-dialog]");
            if (dialog) { if (button) button.disabled = false; closeDialog(dialog); }
          }).catch(function(error) { if (button) button.disabled = false; fail(error); });
        });

        // Add/edit modals. values: the fields to fill; id: the row being edited.
        function openDialog(kind, values, id) {
          var dialog = document.querySelector('[data-budget-dialog="' + kind + '"]');
          if (!dialog) return false;
          var form = dialog.querySelector("form");
          form.reset();
          // Category is a drop-down of the current cards (new, still empty ones included).
          var categories = form.querySelector("[data-budget-categories]");
          if (categories) {
            var names = [];
            document.querySelectorAll('[data-budget-grid="' + kind + '"] [data-budget-card]').forEach(function(card) {
              names.push(card.getAttribute("data-budget-card"));
            });
            var current = values[categories.getAttribute("name")];
            if (current && names.indexOf(current) < 0) names.push(current);
            categories.textContent = "";
            names.forEach(function(name) {
              var option = document.createElement("option");
              option.value = name;
              option.textContent = name;
              categories.appendChild(option);
            });
          }
          Object.keys(values).forEach(function(key) {
            var field = form.querySelector('[name="' + key + '"]');
            if (field) field.value = values[key];
          });
          form.querySelector("[name=id]").value = id || "";
          var fixed = dialog.getAttribute("data-submit");
          form.querySelector("[data-budget-submit]").textContent = fixed || (id ? "Save" : "Add");
          dialog.querySelector("[data-budget-dialog-title]").textContent = fixed ? dialog.getAttribute("data-noun") : (id ? "Edit " : "Add ") + dialog.getAttribute("data-noun");
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "open");
          // Start in the first box that still needs filling in.
          var inputs = Array.prototype.slice.call(form.querySelectorAll("input:not([type=hidden]):not([data-date-picker])"));
          var first = inputs.filter(function(input) { return !input.value; })[0] || inputs[0];
          if (first) first.focus();
          return true;
        }
        function closeDialog(dialog) {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }
        document.querySelectorAll("[data-budget-dialog]").forEach(function(dialog) {
          // Clicking the backdrop closes it (Esc is handled natively).
          dialog.addEventListener("click", function(event) {
            if (event.target === dialog) closeDialog(dialog);
          });
        });

        // The app's standard date field (as on Tasks and Job Descriptions): a
        // typed YYYY-MM-DD box with a calendar button that opens the browser's
        // picker; choosing a date writes it back to the box.
        document.addEventListener("click", function(event) {
          var button = event.target instanceof Element ? event.target.closest("[data-open-date-picker]") : null;
          if (!button) return;
          event.preventDefault();
          var combo = button.closest(".date-combo");
          var picker = combo ? combo.querySelector("[data-date-picker]") : null;
          var text = combo ? combo.querySelector("[data-date-text]") : null;
          if (!(picker instanceof HTMLInputElement) || !(text instanceof HTMLInputElement)) return;
          picker.value = text.value;
          if (typeof picker.showPicker === "function") picker.showPicker();
          else picker.click();
        });
        document.addEventListener("change", function(event) {
          var picker = event.target instanceof Element ? event.target.closest("[data-date-picker]") : null;
          if (!(picker instanceof HTMLInputElement)) return;
          var combo = picker.closest(".date-combo");
          var text = combo ? combo.querySelector("[data-date-text]") : null;
          if (text instanceof HTMLInputElement) text.value = picker.value;
        });

        document.addEventListener("reset", function(event) {
          var form = event.target instanceof Element ? event.target.closest("[data-budget-form]") : null;
          if (!form) return;
          var id = form.querySelector("[name=id]");
          if (id) id.value = "";
          var submit = form.querySelector("[data-budget-submit]");
          if (submit) submit.textContent = "Add";
          var cancel = form.querySelector("[data-budget-cancel]");
          if (cancel) cancel.hidden = true;
        });

        document.addEventListener("click", function(event) {
          var target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          var edit = target.closest("[data-budget-edit]");
          var remove = target.closest("[data-budget-delete]");
          var end = target.closest("[data-budget-end]");
          var bought = target.closest("[data-budget-bought]");
          var newYear = target.closest("[data-budget-new-year]");
          if (edit) {
            var kind = edit.getAttribute("data-budget-edit");
            // Purchases and future spends edit in their modal; the rest in the panel's form.
            if (openDialog(kind, JSON.parse(edit.getAttribute("data-values") || "{}"), edit.getAttribute("data-id"))) return;
            var form = document.querySelector('[data-budget-form="' + kind + '"]');
            if (!form) return;
            form.reset();
            var values = JSON.parse(edit.getAttribute("data-values") || "{}");
            Object.keys(values).forEach(function(key) {
              var field = form.querySelector('[name="' + key + '"]');
              if (field) field.value = values[key];
            });
            form.querySelector("[name=id]").value = edit.getAttribute("data-id");
            form.querySelector("[data-budget-submit]").textContent = "Save";
            form.querySelector("[data-budget-cancel]").hidden = false;
            form.scrollIntoView({ block: "nearest" });
            var first = form.querySelector("input:not([type=hidden])");
            if (first) first.focus();
          } else if (remove) {
            if (!window.confirm("Delete " + remove.getAttribute("data-label") + "?")) return;
            post(ROUTES[remove.getAttribute("data-budget-delete")] + "/" + remove.getAttribute("data-id") + "/delete").then(swap).catch(fail);
          } else if (end) {
            var payments = window.prompt("Payments made for " + end.getAttribute("data-label") + " this year", "0");
            if (payments === null) return;
            post("/api/budget/subscriptions/" + end.getAttribute("data-budget-end") + "/end", { tally: payments }).then(swap).catch(fail);
          } else if (bought) {
            // Asks for the date bought (today, editable), then saves it as a purchase.
            if (openDialog("bought", { spentOn: new Date().toLocaleDateString("en-CA") }, bought.getAttribute("data-budget-bought"))) {
              document.querySelector('[data-budget-dialog="bought"] [data-budget-dialog-title]').textContent = "Bought: " + bought.getAttribute("data-label");
            }
          } else if (newYear) {
            if (!window.confirm(newYear.getAttribute("data-confirm"))) return;
            post("/api/budget/years/new").then(function(result) { window.location.href = "/budget?year=" + result.startYear; }).catch(fail);
          } else if (target.closest("[data-budget-add-item]")) {
            var add = target.closest("[data-budget-add-item]");
            var title = add.getAttribute("data-category");
            // A purchase: the card's title fills in the supplier and the category,
            // and the date is today. A future spend: the category.
            if (add.getAttribute("data-budget-add-item") === "expense") openDialog("expense", { supplier: title, group: title, spentOn: new Date().toLocaleDateString("en-CA") });
            else openDialog("future", { project: title });
          } else if (target.closest("[data-budget-report]")) {
            loadReport(false).then(function(report) { openDialog("report", { report: report }); }).catch(fail);
          } else if (target.closest("[data-budget-report-generate]")) {
            var reportBox = target.closest("form").querySelector("[name=report]");
            loadReport(true).then(function(report) { reportBox.value = report; }).catch(fail);
          } else if (target.closest("[data-budget-additional]")) {
            var extra = target.closest("[data-budget-additional]");
            if (openDialog("additional", JSON.parse(extra.getAttribute("data-values") || "{}"))) {
              document.querySelector('[data-budget-dialog="additional"] [data-budget-dialog-title]').textContent = "Additional budget: " + extra.getAttribute("data-budget-additional");
            }
          } else if (target.closest("[data-budget-add-subscription]")) {
            openDialog("subscription", {});
          } else if (target.closest("[data-budget-dialog-cancel]")) {
            closeDialog(target.closest("[data-budget-dialog]"));
          } else if (target.closest("[data-budget-new-category]")) {
            var newKind = target.closest("[data-budget-new-category]").getAttribute("data-budget-new-category");
            var name = (window.prompt("New category name", "") || "").trim();
            if (!name) return;
            pendingCategories[newKind].push(name);
            addPendingCards();
            var header = document.querySelector('[data-panel-id="' + CATEGORY_PANELS[newKind] + '"] .panel__header');
            if (header) header.click();
            var created = findCard(newKind, name);
            if (created) created.scrollIntoView({ block: "nearest" });
          } else if (target.closest("[data-budget-category-rename]")) {
            var renameKind = target.closest("[data-budget-kind]").getAttribute("data-budget-kind");
            var from = target.closest("[data-budget-category-rename]").getAttribute("data-budget-category-rename");
            var to = (window.prompt("Rename " + from + " to", from) || "").trim();
            if (!to || to === from) return;
            post(CATEGORY_ROUTES[renameKind] + "/rename", { from: from, to: to }).then(function(result) { selectedCategory = { kind: renameKind, name: to }; swap(result); }).catch(fail);
          } else if (target.closest("[data-budget-category-delete]")) {
            var doomed = target.closest("[data-budget-category-delete]");
            if (!window.confirm(doomed.getAttribute("data-confirm"))) return;
            post(CATEGORY_ROUTES[doomed.closest("[data-budget-kind]").getAttribute("data-budget-kind")] + "/delete", { category: doomed.getAttribute("data-budget-category-delete") }).then(swap).catch(fail);
          } else if (target.closest("[data-budget-category-close]")) {
            selectedCategory = null;
            showCategory();
          } else {
            var card = target.closest("[data-budget-grid] [data-budget-card]");
            if (!card || target.closest("a, button, input, select, textarea, label")) return;
            selectedCategory = { kind: card.closest("[data-budget-grid]").getAttribute("data-budget-grid"), name: card.getAttribute("data-budget-card") };
            showCategory();
          }
        });
      })();
    </script>
  `;
}

export function renderBudgetAppShell(data: BudgetPageData, openPanelId: string | null = null): string {
  const fragments = renderBudgetFragments(data);
  const startYear = data.selected.year.startYear;
  const latest = Math.max(...data.years.map((year) => year.startYear));
  const yearSelect = `<select class="form-control form-control--sm" data-budget-year aria-label="Financial year">${[...data.years]
    .sort((a, b) => b.startYear - a.startYear)
    .map((year) => `<option value="${year.startYear}"${year.startYear === startYear ? " selected" : ""}>${escapeHtml(year.label)}</option>`)
    .join("")}</select>`;
  const totalsActions = `
    <button class="panel-action-link" type="button" data-budget-new-year data-confirm="Start ${escapeHtml(financialYearLabel(latest + 1))}? Active subscriptions from ${escapeHtml(financialYearLabel(latest))} are copied into it."><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New year</span></button>
    <button class="panel-action-link" type="button" data-budget-report><i class="bi bi-file-earmark-text ui-icon" aria-hidden="true"></i><span>Generate report</span></button>
    ${renderPrintAction({ label: `Download the ${data.selected.year.label} budget as a PDF to print`, href: `/api/budget/pdf?year=${startYear}` })}
  `;
  const newCategoryAction = (kind: CardKind) => `<button class="panel-action-link" type="button" data-budget-new-category="${kind}"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New category</span></button>`;
  const purchasesActions = newCategoryAction("expense");
  const futureActions = newCategoryAction("future");
  const subscriptionsActions = `<button class="panel-action-link" type="button" data-budget-add-subscription><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add subscription</span></button>`;
  // A total beside a panel title; a fragment, so it follows every save.
  const titleTotal = (key: "purchasesTotal" | "subscriptionsTotal") => `<strong data-budget-fragment="${key}">${fragments[key]}</strong>`;
  const panels = [
    { id: "budget-purchases", title: "Purchases", className: "panel--budget-purchases", meta: titleTotal("purchasesTotal"), actions: purchasesActions, children: fragment("purchases", fragments.purchases) },
    { id: "budget-subscriptions", title: "Subscriptions", className: "panel--budget-subscriptions", meta: titleTotal("subscriptionsTotal"), actions: subscriptionsActions, children: fragment("subscriptions", fragments.subscriptions) },
    { id: "budget-future", title: "Future Spends", className: "panel--budget-future", actions: futureActions, children: fragment("future", fragments.future) },
    { id: "budget-history", title: "Year Over Year", className: "panel--budget-history", children: fragment("history", fragments.history) },
    { id: "budget-totals", title: `Totals ${data.selected.year.label}`, className: "panel--budget-totals", sidePanel: true, meta: yearSelect, actions: totalsActions, children: fragment("categories", fragments.categories) + fragment("futureCategories", fragments.futureCategories) + fragment("totals", fragments.totals) },
  ];
  const layout = renderLayout({ panels, openPanelId });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Budget</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="app-shell-body">
    <aside class="nav-rail flex flex-col items-center gap-6" aria-label="Primary navigation">
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/tasks" aria-label="Tasks" title="Tasks"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/jd" aria-label="Job Descriptions" title="Job Descriptions"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/wiki" aria-label="Things To Know" title="Things To Know"><i class="bi bi-journal-bookmark" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted nav-rail__item--current" href="/budget" aria-label="Budget" title="Budget" aria-current="page"><i class="bi bi-piggy-bank" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderBudgetDialog("expense", "purchase", PURCHASE_DIALOG_FIELDS)}
    ${renderBudgetDialog("future", "future spend", FUTURE_DIALOG_FIELDS)}
    ${renderBudgetDialog("subscription", "subscription", SUBSCRIPTION_DIALOG_FIELDS)}
    ${renderBudgetDialog("bought", "Bought", DATE_FIELD, "Bought")}
    ${renderBudgetDialog("budget", `Budget ${data.selected.year.label}`, `
        <label class="wiki-modal__field field-label"><span>Budget</span><input class="form-control" type="text" inputmode="decimal" name="operatingBudget" autocomplete="off" /></label>`, "Save")}
    ${renderBudgetDialog("additional", "Additional budget", `
        <input type="hidden" name="category" value="" />
        <label class="wiki-modal__field field-label"><span>Amount</span><input class="form-control" type="text" inputmode="decimal" name="amount" autocomplete="off" /></label>`, "Save")}
    ${renderBudgetDialog("report", `Report ${data.selected.year.label}`, `
        <label class="wiki-modal__field field-label"><span>Report</span><textarea class="form-control" name="report" rows="22" maxlength="20000"></textarea></label>
        <div class="flex gap-8"><button type="button" class="button-sm" data-budget-report-generate><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Generate again</button></div>`, "Save", true)}
    ${renderBudgetScript(startYear)}
  </body>
</html>`;
}
