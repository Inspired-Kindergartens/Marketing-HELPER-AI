// Sector Insight's print button: the Centres list as an A4 PDF, the rows and
// order shown on screen (the page sends the visible centres and a line
// describing its filters). Cover, header, footer and print settings come from
// report-pdf.ts, like the dashboard's reports.
import type { SectorCentreView } from "../storage/sector-store.js";
import { centreOpenedLabel } from "../sector/ero.js";
import { isClosedCentre } from "../sector/query.js";
import { dataTable, INK, MUTED, nzFileDate, renderReportPdf, type PdfContent } from "./report-pdf.js";
import { serviceTypeLabel } from "./sector/sector-list-panel.js";

// The competitors the Centres table lists (own and closed centres are not
// shown there), in its order.
export function sectorCompetitors(centres: readonly SectorCentreView[]) {
  return centres.filter((centre) => !centre.isOwn && !isClosedCentre(centre));
}

// The centres to print: the ids sent by the page, in list order; without
// ids, the list as it first opens (centres running a promotion).
export function selectSectorPrintCentres(centres: readonly SectorCentreView[], ids: ReadonlySet<number> | null) {
  const competitors = sectorCompetitors(centres);
  return ids ? competitors.filter((centre) => ids.has(centre.id)) : competitors.filter((centre) => centre.promotions.length > 0);
}

function feature(provided: boolean | null, detail: string) {
  const answer = provided === true ? "Yes" : provided === false ? "No" : "";
  const extra = detail && !/^(yes|no)$/i.test(detail) ? detail : "";
  return [answer, extra].filter(Boolean).join(" - ") || "Not known";
}

function headlineFigures(centres: readonly SectorCentreView[]): PdfContent {
  const figures: Array<[string, number]> = [
    ["Centres", centres.length],
    ["Running a promotion", centres.filter((centre) => centre.promotions.length > 0).length],
    ["Provide meals", centres.filter((centre) => centre.providesMeals === true).length],
    ["Provide transport", centres.filter((centre) => centre.providesTransport === true).length],
  ];
  return {
    table: {
      widths: figures.map(() => "*"),
      body: [
        figures.map(([label]) => ({ text: label.toUpperCase(), fontSize: 7, color: MUTED, bold: true })),
        figures.map(([, value]) => ({ text: String(value), fontSize: 15, bold: true, color: INK })),
      ],
    },
    layout: "noBorders",
    margin: [0, 0, 0, 12],
  };
}

function centresTable(centres: readonly SectorCentreView[]): PdfContent {
  const rows = centres.map((centre) => [
    {
      stack: [
        { text: centre.name, bold: true },
        { text: centre.operator || "Operator not verified", fontSize: 7, color: MUTED, bold: false },
      ],
    },
    serviceTypeLabel(centre.serviceType),
    centre.suburb && centre.suburb !== centre.city ? `${centre.city}\n${centre.suburb}` : centre.city,
    centre.licensedPlaces != null ? `${centre.licensedPlaces}${centre.under2Places ? `\n${centre.under2Places} U2` : ""}` : "",
    centreOpenedLabel(centre),
    feature(centre.providesMeals, centre.meals),
    feature(centre.providesTransport, centre.transport),
    centre.promotions.length ? centre.promotions.map((promotion) => promotion.text).join("\n") : "None found",
  ]);
  const table = dataTable(
    ["Centre", "Type", "Town", "Places", "Opened", "Meals", "Transport", "Promotions"],
    rows,
    [92, 52, 52, 30, 38, 50, 50, "*"],
    { numericFrom: 3, boldFirstColumn: false },
  );
  // Only Places is a number; the columns after it read left to right.
  const body = (table.table as { body: Array<Array<Record<string, unknown>>> }).body;
  for (const row of body) {
    row.forEach((cell, index) => {
      if (index > 3) cell.alignment = "left";
    });
  }
  return { ...table, fontSize: 7.5 };
}

export async function generateSectorPdfBuffer(centres: readonly SectorCentreView[], filters: string, now = new Date()): Promise<Buffer> {
  const subtitle = `${centres.length} centre${centres.length === 1 ? "" : "s"}${filters ? ` - ${filters}` : ""}`;
  return renderReportPdf(
    {
      title: "Sector Insight",
      coverLabel: "COMPETITOR CENTRES",
      subtitle,
      subject: `Sector Insight: ${subtitle}`,
      footerNote: "Sources: MoE ECE directory and competitor websites",
      infoTitle: "Sector Insight - competitor centres",
      content: centres.length
        ? [headlineFigures(centres), centresTable(centres)]
        : [{ text: "No centres match these filters.", color: MUTED }],
    },
    now,
  );
}

export function sectorPdfFilename(now = new Date()) {
  return `Sector-Insight-${nzFileDate(now)}.pdf`;
}
