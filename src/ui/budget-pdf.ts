// The Budget page's print icon: one financial year as an A4 PDF, in the same
// shape as the dashboard reports (report-pdf.ts).
import {
  buildBudgetReport,
  buildSubscriptionRows,
  buildYearComparison,
  buildYearOverYear,
  computeBudgetTotals,
  expenseGroup,
  futureSpendTotal,
  groupPurchases,
  percentChange,
  type BudgetOutcomeMonth,
  type BudgetYearData,
} from "../analytics/budget.js";
import { financialYearLabel } from "../storage/budget-store.js";
import { dataTable, noteText, renderReportPdf, sectionTitle, type PdfContent } from "./report-pdf.js";
import { formatMoney, formatPercent, statusLabel, yearComparisonRows, yearMarketingRows, type ComparisonRow } from "./budget-app-shell.js";

export function budgetPdfFilename(startYear: number): string {
  return `Marketing Budget ${financialYearLabel(startYear)}.pdf`;
}

// The report's text as PDF blocks: a line ending in ":" is a heading, lines
// starting with a bullet ("•" or "-") become a list, the rest are paragraphs.
// That is the layout buildBudgetReport writes; edited text reads the same way.
export function reportContent(text: string): PdfContent[] {
  const content: PdfContent[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) content.push({ ul: bullets, fontSize: 8.5, margin: [0, 0, 0, 4] });
    bullets = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[•\-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (line.endsWith(":") && line.length <= 80) content.push({ text: line.slice(0, -1), fontSize: 9.5, bold: true, margin: [0, 6, 0, 3] });
    else content.push({ text: line, fontSize: 8.5, margin: [0, 0, 0, 4] });
  }
  flush();
  return content;
}

export async function renderBudgetPdf(selected: BudgetYearData, previous: BudgetYearData | null, all: BudgetYearData[], now = new Date(), outcomes: readonly BudgetOutcomeMonth[] = []): Promise<Buffer> {
  const totals = computeBudgetTotals(selected, now);
  const label = selected.year.label;
  const content: PdfContent[] = [];

  content.push(sectionTitle(`Totals ${label}`));
  content.push(
    dataTable(
      ["", "Amount"],
      [
        ["Budget", formatMoney(totals.operatingBudget) || "Not set"],
        ...(totals.additionalBudget > 0 ? [["Additional budget (part of the budget)", formatMoney(totals.additionalBudget)]] : []),
        ["Subscriptions (yearly, excl. GST)", formatMoney(totals.subscriptions)],
        ["Purchases to date", formatMoney(totals.purchases)],
        ["Actual spend", `${formatMoney(totals.actualSpend)}${totals.spentPercent == null ? "" : `  (${totals.spentPercent.toFixed(1)}%)`}`],
        ["Remaining", `${formatMoney(totals.remaining)}${totals.remainingPercent == null ? "" : `  (${totals.remainingPercent.toFixed(1)}%)`}`],
        ["Predicted purchases", formatMoney(totals.predictedPurchases)],
        ["Predicted spend", formatMoney(totals.predictedSpend)],
        [
          totals.predictedDifference != null && totals.predictedDifference < 0 ? "Predicted deficit" : "Predicted surplus",
          `${formatMoney(totals.predictedDifference == null ? null : Math.abs(totals.predictedDifference))}  ${[formatPercent(totals.predictedPercent), statusLabel(totals.status)].filter(Boolean).join(" · ")}`,
        ],
        ["Desire spends (not in predicted spend)", formatMoney(totals.futureSpends)],
        ...(totals.desireLikelihood == null ? [] : [["Desire Spend likelihood", `${totals.desireLikelihood.toFixed(0)}%`]]),
        ["Ended subscriptions (not in totals)", formatMoney(totals.endedSubscriptions)],
      ],
      ["*", 160],
    ),
  );
  const carriedOn = selected.projectedCategories.filter((category) => selected.expenses.some((expense) => expenseGroup(expense) === category));
  content.push(
    noteText(
      `Predictions use ${totals.monthsElapsed} of 12 months. Purchases carried on at the same monthly rate: ${carriedOn.join(", ") || "none"}; the rest count what was spent. Subscriptions exclude GST (÷ 1.15); purchases and desire spends are as entered.`,
    ),
  );
  // The report as the user saved it; if none was generated before printing, it is written now.
  content.push(sectionTitle("Report", { marginTop: 14 }));
  content.push(...reportContent(selected.year.report.trim() || buildBudgetReport(selected, previous, now)));

  const subscriptions = buildSubscriptionRows(selected.subscriptions, previous?.subscriptions ?? []);
  const active = subscriptions.filter((row) => row.status === "active").sort((a, b) => b.yearlyCost - a.yearlyCost);
  const ended = subscriptions.filter((row) => row.status === "ended");
  content.push(sectionTitle("Subscriptions", { pageBreak: true }));
  content.push(
    dataTable(
      ["Subscription", "Amount", "Frequency", "Started", "Ended", "Yearly cost", "Inc"],
      [
        ...active.map((row) => [row.name, formatMoney(row.amount), row.frequency, row.startedOn ?? "", row.endedOn ?? "", formatMoney(row.yearlyCost), formatPercent(row.increasePercent)]),
        ...ended.map((row) => [row.name, formatMoney(row.amount), row.frequency, row.startedOn ?? "", row.endedOn ?? "Ended", "", ""]),
        ["Yearly total (excl. GST " + formatMoney(totals.subscriptions) + ")", "", "", "", "", formatMoney(totals.subscriptionsGross), ""],
      ],
      ["*", 55, 55, 58, 58, 65, 45],
    ),
  );

  const groups = groupPurchases(selected.expenses);
  content.push(sectionTitle("Purchases by group", { pageBreak: true }));
  content.push(dataTable(["Group", "Items", "Total", "% of spend"], groups.map((group) => [group.group, String(group.count), formatMoney(group.total), `${group.percentOfPurchases.toFixed(1)}%`]), ["*", 45, 80, 60]));
  content.push(sectionTitle("Purchases", { marginTop: 14 }));
  const purchases = [...selected.expenses].sort((a, b) => expenseGroup(a).localeCompare(expenseGroup(b)) || (a.spentOn ?? "").localeCompare(b.spentOn ?? ""));
  content.push(
    dataTable(
      ["Group", "Supplier", "Date", "Note", "Amount"],
      purchases.map((expense) => [expenseGroup(expense), expense.supplier, expense.spentOn ?? "", expense.note, formatMoney(expense.amount)]),
      [80, 90, 55, "*", 65],
      { numericFrom: 4, boldFirstColumn: false },
    ),
  );

  const future = selected.futureSpends.filter((spend) => spend.status !== "bought");
  if (future.length) {
    content.push(sectionTitle("Desire spends", { marginTop: 14 }));
    content.push(
      dataTable(
        ["Project", "Supplier", "Note", "Qty", "Total"],
        future.map((spend) => [spend.project + (spend.status === "tbc" ? " (TBC)" : ""), spend.supplier, spend.note, String(spend.qty), formatMoney(futureSpendTotal(spend))]),
        [80, 80, "*", 30, 65],
        { numericFrom: 3 },
      ),
    );
  }

  const yoy = buildYearOverYear(all, now);
  if (yoy.years.length > 1) {
    const labels = yoy.years.map(financialYearLabel);
    const withChange = (values: Array<number | null | undefined>) =>
      values.map((value, index) => (value == null ? "" : `${formatMoney(value)}${index > 0 && percentChange(values[index - 1], value) != null ? `\n${formatPercent(percentChange(values[index - 1], value))}` : ""}`));
    // The same comparison as the page's Year Over Year panel: the two latest
    // finished years and the current year's predicted figures.
    const comparison = buildYearComparison(all, now, outcomes);
    const columns = [...comparison.completed, ...(comparison.tracking ? [comparison.tracking] : [])];
    const comparisonTable = (first: string, trackingSuffix: string, rows: ComparisonRow[]) =>
      dataTable(
        [first, ...columns.map((column) => `${column.label}${column === comparison.tracking ? trackingSuffix : ""}`)],
        rows.map((row) => [row.label, ...row.cells.map((cell) => (cell.note ? `${cell.value}\n${cell.note}` : cell.value))]),
        ["*", ...columns.map(() => 110)],
      );
    content.push(sectionTitle("Year over year", { pageBreak: true }));
    content.push(comparisonTable("", " predicted", yearComparisonRows(comparison)));
    const marketing = yearMarketingRows(comparison);
    if (marketing.length) {
      content.push(sectionTitle("Marketing results", { marginTop: 14 }));
      content.push(comparisonTable("", " to date", marketing));
    }
    content.push(sectionTitle("Subscriptions by year (yearly cost)", { marginTop: 14 }));
    content.push(dataTable(["Subscription", ...labels], yoy.subscriptions.map((entry) => [entry.name, ...withChange(yoy.years.map((year) => entry.costs[year]))]), ["*", ...labels.map(() => 80)]));
    if (yoy.groups.length > 0) {
      content.push(sectionTitle("Purchase groups by year", { marginTop: 14 }));
      content.push(dataTable(["Purchase group", ...labels], yoy.groups.map((entry) => [entry.group, ...withChange(yoy.years.map((year) => entry.totals[year]))]), ["*", ...labels.map(() => 80)]));
    }
  }

  return renderReportPdf(
    {
      title: `Marketing Budget ${label}`,
      // On the cover "Marketing" sits on its own line above the title.
      coverKicker: "Marketing",
      coverTitle: `Budget ${label}`,
      coverLabel: `FINANCIAL YEAR ${label}`,
      subtitle: `1 July ${selected.year.startYear} - 30 June ${selected.year.startYear + 1}`,
      subject: `Marketing budget ${label}`,
      infoTitle: `Marketing Budget ${label}`,
      footerNote: "",
      content,
    },
    now,
  );
}
