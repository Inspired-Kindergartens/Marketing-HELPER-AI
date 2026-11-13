// Enrolment Quality as a multi-page A4 PDF for the period and order chosen in
// the panel: a cover page, a summary table and a change chart, then one chart per centre.
// The cover, header, footer and print settings come from report-pdf.ts;
// charts are SVG.
import {
  formatMonthLabel,
  ORGANISATION_ROW_KEY,
  rollBand,
  rollWindowMonths,
  type RollBand,
  type EnrolmentQualityRow,
  type RollPoint,
  type TrendDirection,
} from "../analytics/enrolment-quality.js";
import { formatAnalyticsServiceDisplayName } from "./centre-name.js";
import type { EnrolmentQualityView } from "./enrolment-quality-panel.js";
import { escapeXml, GRID, INK, MUTED, nzFileDate, renderReportPdf, ZEBRA, type PdfContent } from "./report-pdf.js";

// Trend colours: the Light theme's tokens.
const COLOUR: Record<TrendDirection | "none", string> = {
  rise: "#16a34a",
  fall: "#d92d20",
  steady: "#6b7280",
  none: "#9ca3af",
};

const BAND_COLOUR: Record<RollBand, string> = { good: "#16a34a", watch: "#6b7280", low: "#d92d20" };

function bandColour(percent: number | null) {
  const band = rollBand(percent);
  return band ? BAND_COLOUR[band] : INK;
}

const ARROW: Record<TrendDirection, string> = { rise: "▲", fall: "▼", steady: "►" };

function pct(value: number | null) {
  return value == null ? "-" : `${Math.round(value)}%`;
}

function formatChange(value: number | null) {
  if (value == null) return "-";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function colourOf(row: EnrolmentQualityRow) {
  return COLOUR[row.direction ?? "none"];
}

// Capacity (the busier of the am / pm places), then the licence in curly
// brackets. With no am / pm places set, the licence is used, so both match.
// The All kindergartens row keeps its full name (the shortener would drop
// "kindergartens").
function displayName(row: EnrolmentQualityRow) {
  return row.centreKey === ORGANISATION_ROW_KEY ? row.name : formatAnalyticsServiceDisplayName(row.name);
}

function capacityText(row: EnrolmentQualityRow) {
  if (!row.currentCapacity) return "-";
  const total = `${Math.round(row.currentCapacity.capacity)} {${row.licence ?? "-"}}`;
  return row.licenceU2 != null ? `${total}, U2 ${row.currentCapacity.under2 ?? "-"} {${row.licenceU2}}` : total;
}

// The user's am / pm places in force now, "-" when none are set.
function placesText(row: EnrolmentQualityRow) {
  const current = row.currentCapacity;
  return current?.source === "operating" && current.am != null && current.pm != null ? `${current.am} / ${current.pm}` : "-";
}

const CAPACITY_NOTE =
  "Capacity: the busier of the morning and afternoon places the centre runs, which the % is measured against, with the licensed capacity in {curly brackets}. Where no am / pm places have been set, the licence is used and both match. U2 = of which under-2 places (centres licensed for under-2s only); % full roll counts under-2s and over-2s together. % colours: 90% and above green, 80-89% grey, under 80% red.";

// --- Charts --------------------------------------------------------------------

// A y-axis range on round 10s around the data, at least 20 points tall.
function niceRange(values: number[]) {
  let low = Math.floor((Math.min(...values) - 3) / 10) * 10;
  let high = Math.ceil((Math.max(...values) + 3) / 10) * 10;
  if (high - low < 20) {
    high += 10;
    low = Math.max(0, low - 10);
  }
  const step = high - low > 60 ? 20 : 10;
  return { low, high, step };
}

export function renderCentreChartSvg(points: readonly RollPoint[], colour: string, width = 250, height = 130) {
  const known = points.filter((point) => point.percent != null);
  const left = 30;
  const right = 10;
  const top = 10;
  const bottom = 20;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial">`];

  if (!known.length) {
    out.push(`<text x="${width / 2}" y="${height / 2}" font-size="9" fill="${MUTED}" text-anchor="middle">No figures for this period</text></svg>`);
    return out.join("");
  }

  const { low, high, step } = niceRange(known.map((point) => point.percent!));
  const x = (index: number) => left + (points.length > 1 ? (index / (points.length - 1)) * plotW : plotW / 2);
  const y = (value: number) => top + plotH - ((value - low) / (high - low)) * plotH;

  for (let tick = low; tick <= high; tick += step) {
    out.push(`<line x1="${left}" x2="${left + plotW}" y1="${y(tick)}" y2="${y(tick)}" stroke="${GRID}" stroke-width="0.6"/>`);
    out.push(`<text x="${left - 4}" y="${y(tick) + 3}" font-size="7" fill="${MUTED}" text-anchor="end">${tick}%</text>`);
  }
  if (low < 100 && high > 100) {
    out.push(`<line x1="${left}" x2="${left + plotW}" y1="${y(100)}" y2="${y(100)}" stroke="${INK}" stroke-width="0.7" stroke-dasharray="3,2"/>`);
  }

  // Month labels: about six, always the last (right-aligned so it is not
  // clipped), skipping any that would crowd it.
  const every = Math.max(1, Math.ceil(points.length / 6));
  const lastIndex = points.length - 1;
  points.forEach((point, index) => {
    const isLast = index === lastIndex;
    if (!isLast && (index % every !== 0 || lastIndex - index < every || (index === 0 && points.length > 12))) return;
    const anchor = isLast && points.length > 1 ? "end" : index === 0 && points.length > 1 ? "start" : "middle";
    out.push(`<text x="${x(index)}" y="${height - 6}" font-size="7" fill="${MUTED}" text-anchor="${anchor}">${formatMonthLabel(point.month)}</text>`);
  });

  // Line and shaded area, broken where a month has no figures.
  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  points.forEach((point, index) => {
    if (point.percent == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ index, value: point.percent });
    }
  });
  if (current.length) segments.push(current);

  for (const segment of segments) {
    const line = segment.map((p) => `${x(p.index).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    if (segment.length > 1) {
      const base = y(low).toFixed(1);
      const area = `${x(segment[0]!.index).toFixed(1)},${base} ${line} ${x(segment[segment.length - 1]!.index).toFixed(1)},${base}`;
      out.push(`<polygon points="${area}" fill="${colour}" fill-opacity="0.12" stroke="none"/>`);
      out.push(`<polyline points="${line}" fill="none" stroke="${colour}" stroke-width="${points.length > 24 ? 1.2 : 1.8}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    if (points.length <= 24) {
      for (const p of segment) out.push(`<circle cx="${x(p.index).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="1.6" fill="${colour}"/>`);
    }
  }

  // Label the first and latest values on the side away from the line: below
  // the point when the neighbouring month is higher, above it otherwise.
  const first = known[0]!;
  const last = known[known.length - 1]!;
  const firstAt = points.indexOf(first);
  const lastAt = points.indexOf(last);
  const labelY = (value: number, neighbour: number | undefined) =>
    neighbour != null && neighbour > value && y(value) + 11 < top + plotH ? y(value) + 11 : y(value) - 5;
  out.push(`<circle cx="${x(lastAt)}" cy="${y(last.percent!)}" r="2.6" fill="${colour}"/>`);
  out.push(`<text x="${x(lastAt) - 4}" y="${labelY(last.percent!, known[known.length - 2]?.percent ?? undefined)}" font-size="8" font-weight="bold" fill="${colour}" text-anchor="end">${pct(last.percent)}</text>`);
  if (firstAt !== lastAt && points.length <= 24) {
    out.push(`<text x="${x(firstAt) + 4}" y="${labelY(first.percent!, known[1]?.percent ?? undefined)}" font-size="7" fill="${MUTED}">${pct(first.percent)}</text>`);
  }
  out.push("</svg>");
  return out.join("");
}

// Diverging bars: each centre's change over the period, biggest fall first.
export function renderChangeChartSvg(rows: readonly EnrolmentQualityRow[], width = 515) {
  const withChange = rows.filter((row) => row.change != null).sort((a, b) => a.change! - b.change!);
  const rowH = 22;
  const labelW = 120;
  const top = 18;
  const height = top + withChange.length * rowH + 8;
  const max = Math.max(10, ...withChange.map((row) => Math.abs(row.change!)));
  const limit = Math.ceil(max / 10) * 10;
  const plotW = width - labelW - 40;
  const zero = labelW + plotW / 2;
  const scale = (value: number) => (value / limit) * (plotW / 2);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial">`];

  withChange.forEach((_, index) => {
    if (index % 2) out.push(`<rect x="0" y="${top + index * rowH}" width="${width}" height="${rowH}" fill="${ZEBRA}"/>`);
  });
  for (const tick of [-limit, -limit / 2, 0, limit / 2, limit]) {
    const tx = zero + scale(tick);
    out.push(`<line x1="${tx}" x2="${tx}" y1="${top - 4}" y2="${height - 6}" stroke="${tick === 0 ? INK : GRID}" stroke-width="${tick === 0 ? 0.8 : 0.6}"/>`);
    out.push(`<text x="${tx}" y="${top - 7}" font-size="7" fill="${MUTED}" text-anchor="middle">${tick > 0 ? "+" : ""}${tick}%</text>`);
  }
  withChange.forEach((row, index) => {
    const cy = top + index * rowH + rowH / 2;
    const value = row.change!;
    const barX = value < 0 ? zero + scale(value) : zero;
    const barW = Math.max(1, Math.abs(scale(value)));
    const colour = colourOf(row);
    out.push(`<text x="${labelW - 6}" y="${cy + 3}" font-size="9" fill="${INK}" text-anchor="end">${escapeXml(displayName(row))}</text>`);
    out.push(`<rect x="${barX.toFixed(1)}" y="${(cy - 6).toFixed(1)}" width="${barW.toFixed(1)}" height="12" rx="2" fill="${colour}"/>`);
    const labelX = value < 0 ? barX - 3 : barX + barW + 3;
    out.push(`<text x="${labelX.toFixed(1)}" y="${cy + 3}" font-size="8.5" font-weight="bold" fill="${colour}" text-anchor="${value < 0 ? "end" : "start"}">${formatChange(value)}</text>`);
  });
  out.push("</svg>");
  return out.join("");
}

// --- Document ------------------------------------------------------------------

function periodLabel(view: EnrolmentQualityView) {
  const first = view.rows[0]?.points[0]?.month;
  const last = view.rows[0]?.points[view.rows[0]!.points.length - 1]?.month;
  const months = rollWindowMonths(view.windowKey);
  const span = months >= 24 ? `${months / 12} years` : `${months} months`;
  return first && last ? `Last ${span}: ${formatMonthLabel(first)} to ${formatMonthLabel(last)} (this month to date)` : `Last ${span}`;
}

// Cover label: "12 MONTHS INFOCARE SNAPSHOT".
function coverLabel(view: EnrolmentQualityView) {
  const months = rollWindowMonths(view.windowKey);
  return `${months >= 24 ? `${months / 12} YEARS` : `${months} MONTHS`} INFOCARE SNAPSHOT`;
}

function summaryTable(rows: readonly EnrolmentQualityRow[]): PdfContent {
  const head = ["Centre", "Trend", "Start", "Latest", "Change", "Booked am / pm", "Places am / pm", "Capacity {licence}"].map((text, index) => ({
    text,
    bold: true,
    color: "#ffffff",
    fillColor: INK,
    alignment: index >= 2 ? "right" : "left",
  }));
  const body = rows.map((row, index) => {
    const fill = index % 2 ? ZEBRA : null;
    const colour = colourOf(row);
    const cell = (text: string, extra: Record<string, unknown> = {}) => ({ text, fillColor: fill, alignment: "right", ...extra });
    return [
      cell(displayName(row), { alignment: "left", bold: true }),
      cell(row.direction ? `${ARROW[row.direction]} ${row.direction}` : "-", { alignment: "left", color: colour, font: "Arial" }),
      cell(pct(row.startPercent), { color: bandColour(row.startPercent) }),
      cell(pct(row.latestPercent), { bold: true, color: bandColour(row.latestPercent) }),
      cell(formatChange(row.change), { color: colour, bold: row.direction === "fall" }),
      cell(row.latest && row.latest.openDays > 0 ? `${Math.round(row.latest.avgAm)} / ${Math.round(row.latest.avgPm)}` : "-"),
      cell(placesText(row)),
      cell(capacityText(row)),
    ];
  });
  return {
    table: { headerRows: 1, widths: ["*", 46, 34, 36, 38, 44, 44, 92], body: [head, ...body] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => GRID,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    fontSize: 8.5,
  };
}

function centreCard(row: EnrolmentQualityRow): PdfContent {
  const colour = colourOf(row);
  return {
    unbreakable: true,
    margin: [0, 0, 0, 12],
    stack: [
      {
        columns: [
          { text: displayName(row), bold: true, fontSize: 10.5, color: INK, width: "*" },
          {
            width: "auto",
            text: [
              { text: pct(row.latestPercent), bold: true, color: bandColour(row.latestPercent) },
              { text: row.direction ? `  ${ARROW[row.direction]} ${formatChange(row.change)}` : "", color: colour, bold: true },
            ],
            fontSize: 10.5,
          },
        ],
      },
      { svg: renderCentreChartSvg(row.points, colour), width: 250, font: "Arial", margin: [0, 4, 0, 2] },
      {
        text: `Capacity ${capacityText(row)}  ·  Places am / pm ${placesText(row)}  ·  Booked am / pm ${row.latest && row.latest.openDays > 0 ? `${Math.round(row.latest.avgAm)} / ${Math.round(row.latest.avgPm)}` : "-"}`,
        fontSize: 7.5,
        color: MUTED,
      },
    ],
  };
}


export async function generateEnrolmentQualityPdfBuffer(view: EnrolmentQualityView, now = new Date()): Promise<Buffer> {
  // All kindergartens first in the summary and the charts; the change chart
  // compares centres only.
  const rows = view.rows;
  const listed = view.organisation ? [view.organisation, ...rows] : rows;

  const cards: PdfContent[] = [];
  for (let index = 0; index < listed.length; index += 2) {
    cards.push({
      columns: [centreCard(listed[index]!), listed[index + 1] ? centreCard(listed[index + 1]!) : { text: "" }],
      columnGap: 15,
    });
  }

  return renderReportPdf(
    {
      title: "Enrolment Quality",
      coverKicker: "Marketing",
      coverLabel: `${coverLabel(view)}${view.slt ? `  ·  SLT ${view.slt.toUpperCase()}` : ""}`,
      subtitle: `% full roll by month  ·  ${view.slt ? `SLT ${view.slt}  ·  ` : ""}${periodLabel(view)}`,
      subject: `${view.slt ? `SLT ${view.slt}; ` : ""}${periodLabel(view)}`,
      footerNote: "% full roll = placements ÷ capacity  ·  capacity {licence}",
      content: [
        { text: "Summary", fontSize: 12, bold: true, color: INK, margin: [0, 0, 0, 6] },
        summaryTable(listed),
        { text: CAPACITY_NOTE, fontSize: 7.5, color: MUTED, margin: [0, 6, 0, 0] },
        { text: "Change over the period", fontSize: 12, bold: true, color: INK, margin: [0, 18, 0, 6], pageBreak: "before" },
        { svg: renderChangeChartSvg(rows), width: 515, font: "Arial" },
        { text: "Centres", fontSize: 12, bold: true, color: INK, margin: [0, 0, 0, 8], pageBreak: "before" },
        ...cards,
      ],
    },
    now,
  );
}

export function enrolmentQualityPdfFilename(view: EnrolmentQualityView, now = new Date()) {
  return `Enrolment-Quality-${view.windowKey}-${view.slt ? `${view.slt}-` : ""}${nzFileDate(now)}.pdf`;
}
