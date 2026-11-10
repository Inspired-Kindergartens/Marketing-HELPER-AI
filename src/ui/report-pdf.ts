// The shared shape of the dashboard's printable PDF reports (Enrolment
// Quality, Infocare Analytics, Waitlist Quality): a bare cover page, a header
// with the title and logo, a footer with page numbers, print colours, a
// stacked bar chart, and the print settings stored in the file.
import PdfPrinter from "pdfmake";
import { ensureFontsConfigured, getLogoDataUri } from "./jd/jd-pdf.js";

export type PdfContent = Record<string, unknown>;

// Print colours: the Light theme's tokens.
export const INK = "#1f2937";
export const MUTED = "#6b7280";
export const GRID = "#e5e7eb";
export const ZEBRA = "#f6f7f9";
export const WAIT_COLOUR = {
  short: "#16a34a",
  typical: "#0e9384",
  longRunning: "#f79009", // lighter than the Light theme token so it stands apart from very long in print
  veryLongRunning: "#d92d20",
} as const;

export function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// "Tuesday November 10 2026", NZ date.
export function coverDate(date: Date) {
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-NZ", { ...options, timeZone: "Pacific/Auckland" });
  return `${part({ weekday: "long" })} ${part({ month: "long" })} ${part({ day: "numeric" })} ${part({ year: "numeric" })}`;
}

// "10 November 2026, 1:42 pm", NZ time.
export function nzDateTime(date: Date) {
  const day = date.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" });
  const time = date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Pacific/Auckland" });
  return `${day}, ${time}`;
}

// YYYY-MM-DD in NZ time, for file names.
export function nzFileDate(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

// The cover is deliberately bare so a copy left lying around gives nothing
// away: title, a short label, the created date and the logo only.
function coverPage(title: string, coverLabel: string, logo: string | null, now: Date): PdfContent[] {
  return [
    { text: title, fontSize: 34, bold: true, color: INK, alignment: "center", margin: [0, 230, 0, 0] },
    { text: coverLabel, fontSize: 11, bold: true, color: MUTED, characterSpacing: 2, alignment: "center", margin: [0, 10, 0, 0] },
    { text: `document created ${coverDate(now)}`, fontSize: 7.5, color: MUTED, alignment: "center", margin: [0, 6, 0, 0] },
    logo
      ? { image: logo, width: 160, alignment: "center", margin: [0, 60, 0, 0] }
      : { text: "Inspired Kindergartens", fontSize: 18, bold: true, alignment: "center", margin: [0, 60, 0, 0] },
  ];
}

export function sectionTitle(text: string, options: { pageBreak?: boolean; marginTop?: number } = {}): PdfContent {
  return {
    text,
    fontSize: 12,
    bold: true,
    color: INK,
    margin: [0, options.marginTop ?? 0, 0, 6],
    ...(options.pageBreak ? { pageBreak: "before" } : {}),
  };
}

export function noteText(text: string): PdfContent {
  return { text, fontSize: 7.5, color: MUTED, margin: [0, 6, 0, 0] };
}

// A zebra table with a dark header row. Columns from `numericFrom` on are
// right-aligned. Cells may be plain strings or pdfmake cell objects.
export function dataTable(
  headings: string[],
  rows: Array<Array<string | PdfContent>>,
  widths: Array<number | string>,
  options: { numericFrom?: number; boldFirstColumn?: boolean; totalRow?: boolean } = {},
): PdfContent {
  const numericFrom = options.numericFrom ?? 1;
  const head = headings.map((text, index) => ({
    text,
    bold: true,
    color: "#ffffff",
    fillColor: INK,
    alignment: index >= numericFrom ? "right" : "left",
  }));
  const body = rows.map((row, rowIndex) => {
    const isTotal = options.totalRow && rowIndex === 0;
    const fill = isTotal ? "#d0d5dd" : rowIndex % 2 ? ZEBRA : null;
    return row.map((cell, index) => {
      const base = typeof cell === "string" ? { text: cell } : cell;
      return {
        fillColor: fill,
        alignment: index >= numericFrom ? "right" : "left",
        ...(index === 0 && options.boldFirstColumn !== false ? { bold: true } : {}),
        ...(isTotal ? { bold: true } : {}),
        ...base,
      };
    });
  });
  return {
    table: { headerRows: 1, widths, body: [head, ...body] },
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

export type StackedSeries = { label: string; values: number[]; colour: string };

// Horizontal stacked bars, one row per label, with an x axis on round
// numbers and the row total at the end of each bar.
export function renderStackedBarSvg(labels: readonly string[], series: readonly StackedSeries[], width = 515, labelW = 150) {
  const rowH = 15;
  const top = 6;
  const axisH = 16;
  const height = top + labels.length * rowH + axisH;
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
  const rawMax = Math.max(1, ...totals);
  const step = rawMax > 100 ? 50 : rawMax > 40 ? 20 : rawMax > 20 ? 10 : 5;
  const limit = Math.ceil(rawMax / step) * step;
  const plotW = width - labelW - 30;
  const scale = (value: number) => (value / limit) * plotW;
  const plotBottom = top + labels.length * rowH;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial">`];

  labels.forEach((_, index) => {
    if (index % 2) out.push(`<rect x="0" y="${top + index * rowH}" width="${width}" height="${rowH}" fill="${ZEBRA}"/>`);
  });
  for (let tick = 0; tick <= limit; tick += step) {
    const x = labelW + scale(tick);
    out.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${plotBottom}" stroke="${tick === 0 ? INK : GRID}" stroke-width="${tick === 0 ? 0.8 : 0.6}"/>`);
    out.push(`<text x="${x.toFixed(1)}" y="${plotBottom + 11}" font-size="7" fill="${MUTED}" text-anchor="middle">${tick}</text>`);
  }
  labels.forEach((label, index) => {
    const y = top + index * rowH;
    out.push(`<text x="${labelW - 6}" y="${y + rowH / 2 + 3}" font-size="8" fill="${INK}" text-anchor="end">${escapeXml(label)}</text>`);
    let x = labelW;
    for (const item of series) {
      const value = item.values[index] ?? 0;
      if (value <= 0) continue;
      const w = scale(value);
      out.push(`<rect x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" width="${w.toFixed(1)}" height="${rowH - 6}" fill="${item.colour}"/>`);
      x += w;
    }
    out.push(`<text x="${(x + 3).toFixed(1)}" y="${y + rowH / 2 + 3}" font-size="7.5" font-weight="bold" fill="${INK}">${totals[index]}</text>`);
  });
  out.push("</svg>");
  return out.join("");
}

// A colour key for a chart: swatch and label for each series.
export function chartLegend(series: ReadonlyArray<{ label: string; colour: string }>): PdfContent {
  return {
    text: series.flatMap((item, index) => [
      { text: "■ ", color: item.colour, fontSize: 9 },
      { text: `${item.label}${index < series.length - 1 ? "      " : ""}`, color: MUTED },
    ]),
    fontSize: 7.5,
    margin: [0, 4, 0, 0],
  };
}

export type ReportDefinition = {
  title: string; // cover and page header
  coverLabel: string; // e.g. "12 MONTHS INFOCARE SNAPSHOT"
  subtitle: string; // page header line under the title
  subject: string; // PDF file properties
  footerNote: string;
  content: PdfContent[]; // the pages after the cover
};

// Builds the whole PDF: cover, then the content with a header and footer on
// every page but the cover, numbered from the first page after it.
export async function renderReportPdf(report: ReportDefinition, now = new Date()): Promise<Buffer> {
  ensureFontsConfigured();
  const logo = await getLogoDataUri();
  const generated = now.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" });
  const [first, ...rest] = report.content;

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, 70, 40, 40],
    info: { title: `${report.title} - Infocare snapshot`, subject: report.subject, author: "Marketing, Inspired Kindergartens" },
    header: (page: number) => page === 1 ? null : ({
      margin: [40, 24, 40, 0],
      columns: [
        {
          width: "*",
          stack: [
            { text: report.title, fontSize: 15, bold: true, color: INK },
            { text: report.subtitle, fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] },
          ],
        },
        logo ? { image: logo, width: 95 } : { text: "inspired kindergartens", bold: true, width: "auto" },
      ],
    }),
    footer: (page: number, pages: number) => page === 1 ? null : ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: `Generated ${generated}${report.footerNote ? `  ·  ${report.footerNote}` : ""}`, fontSize: 7.5, color: MUTED },
        { text: `Page ${page - 1} of ${pages - 1}`, fontSize: 7.5, color: MUTED, alignment: "right", width: "auto" },
      ],
    }),
    content: [
      ...coverPage(report.title, report.coverLabel, logo, now),
      ...(first ? [{ ...first, pageBreak: "before" }] : []),
      ...rest,
    ],
    defaultStyle: { font: "Arial", fontSize: 9, color: INK },
    // Makes pdfkit create the ViewerPreferences dictionary that the print
    // settings are added to.
    displayTitle: true,
  };

  const output = PdfPrinter.createPdf(docDefinition) as unknown as { getStream(): Promise<PdfKitDocument> };
  const pdf = await output.getStream();
  Object.assign(pdf._root.data.ViewerPreferences?.data ?? {}, PRINT_PREFERENCES);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}

// Print settings stored in the PDF (ViewerPreferences): A4 portrait, actual
// size, single-sided, 7 copies. Adobe Acrobat/Reader applies them in its Print
// dialog; browser viewers mostly ignore them. A PDF cannot ask for stapling or
// page order (reverse printing): those are printer driver settings.
// pdfkit writes plain strings as PDF names (/None) and numbers as numbers.
export const PRINT_PREFERENCES = {
  PrintScaling: "None", // actual size, no shrink-to-fit
  Duplex: "Simplex", // single-sided
  PickTrayByPDFSize: true, // A4 paper
  NumCopies: 7,
};

type PdfKitDocument = {
  _root: { data: { ViewerPreferences?: { data: Record<string, unknown> } } };
  on(event: string, listener: (...args: any[]) => void): void;
  end(): void;
};
