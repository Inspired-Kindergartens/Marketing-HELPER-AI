// The Centre Staff PDF (landing page, Centre Staff, Download): every open
// kindergarten with its head teacher, administrator and other staff, as the
// newest stored Infocare staff list names them, in the shared report layout.
import type { CentreStaffSection } from "../storage/centre-people-store.js";
import { dataTable, INK, MUTED, nzDateTime, nzFileDate, renderReportPdf, type PdfContent } from "./report-pdf.js";

// One kindergarten: its name, how to reach it, then who works there. Kept on
// one page so a kindergarten's staff are never split across two.
function centreBlock(section: CentreStaffSection, first: boolean): PdfContent {
  const reach = [section.email, section.seniorTeacher ? `Senior Teacher: ${section.seniorTeacher}` : ""].filter(Boolean).join("  ·  ");
  return {
    unbreakable: true,
    margin: [0, first ? 0 : 14, 0, 0],
    stack: [
      { text: section.kindergarten, fontSize: 12, bold: true, color: INK },
      ...(reach ? [{ text: reach, fontSize: 8, color: MUTED, margin: [0, 1, 0, 0] }] : []),
      {
        margin: [0, 5, 0, 0],
        ...(section.people.length
          ? dataTable(["Name", "Job"], section.people.map((person) => [person.name, person.job]), ["*", 150], { numericFrom: 99 })
          : { text: "No staff list from Infocare yet.", fontSize: 8.5, color: MUTED }),
      },
    ],
  };
}

export function buildCentreStaffContent(sections: readonly CentreStaffSection[]): PdfContent[] {
  return sections.map((section, index) => centreBlock(section, index === 0));
}

export async function generateCentreStaffPdfBuffer(sections: readonly CentreStaffSection[], listsReceivedAt: Date | null, now = new Date()): Promise<Buffer> {
  const source = listsReceivedAt ? `Infocare staff list of ${nzDateTime(listsReceivedAt)}` : "No Infocare staff list stored";
  return renderReportPdf(
    {
      title: "Centre Staff",
      coverKicker: "Marketing",
      coverLabel: "HEAD TEACHERS, ADMINISTRATORS AND STAFF",
      // One line, so the first kindergarten sits clear of the page header.
      subtitle: source,
      subject: "Head teacher, administrator and other staff of each kindergarten",
      infoTitle: "Centre Staff",
      footerNote: source,
      content: buildCentreStaffContent(sections),
    },
    now,
  );
}

export function centreStaffPdfFilename(now = new Date()) {
  return `Centre-Staff-${nzFileDate(now)}.pdf`;
}
