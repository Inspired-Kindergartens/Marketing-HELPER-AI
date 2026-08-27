import PdfPrinter from "pdfmake";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobDescriptionView } from "../../storage/jd-store.js";
import { formatNzClosingDate, formatNzDisplayDate, formatNzDateTimeInput, NZ_TIME_ZONE } from "./jd-date.js";
import { formatJdLocationDisplay } from "./jd-email.js";

// Matches the current PD template (see PLAN.md §6): logo top-right, bordered
// field table, grey "Applications only accepted by" band with qualifications
// side by side, grey "Job Description" band, ROLE AND RESPONSIBILITIES
// sections, footer review table. Administrator layout uses the shorter field
// table and adds the legacy header/footer band + REQUIRED SKILLS/REPORTS TO.
//
// pdfmake ships no bundled fonts and has no built-in standard-14 fallback in
// this version — it embeds whatever TTF files a font descriptor points at. On
// this local-only Windows app we point straight at the OS Arial install
// rather than bundling font files into the repo.

// pdfmake has no published TypeScript types; this is the minimal content
// shape this file actually uses.
type PdfContent = Record<string, unknown>;

const FONT_DIR = "C:/Windows/Fonts";
const FONTS = {
  Arial: {
    normal: `${FONT_DIR}/arial.ttf`,
    bold: `${FONT_DIR}/arialbd.ttf`,
    italics: `${FONT_DIR}/ariali.ttf`,
    bolditalics: `${FONT_DIR}/arialbi.ttf`,
  },
};

const FIELD_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#666666",
  vLineColor: () => "#666666",
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

const BODY_LEFT_OFFSET = 4;

let cachedLogoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const buffer = await readFile(join(process.cwd(), "src", "assets", "ik-logo.jpg"));
    cachedLogoDataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    return cachedLogoDataUri;
  } catch {
    return null;
  }
}

function titleText(label: string): string {
  const cleaned = label.replace(/[:;]\s*$/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  return cleaned
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "e-mail" || lower === "email") return "Email";
      if (/\d/.test(word)) return word;
      return word
        .split("/")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join("/");
    })
    .join(" ");
}

function fieldCell(label: string, bold = true): PdfContent {
  return { text: titleText(label), bold, fillColor: "#f2f2f2" };
}

function buildStandardFieldTable(jd: JobDescriptionView): PdfContent {
  return {
    table: {
      widths: ["25%", "25%", "25%", "25%"],
      body: [
        [fieldCell("Job Title"), jd.jobTitle, fieldCell("Job Category"), jd.jobCategory],
        [fieldCell("Location"), formatJdLocationDisplay(jd.locationDisplay), fieldCell("Collective Agreement"), jd.agreementText],
        [
          fieldCell("Position Type"),
          jd.fte ? `${jd.positionType} (${jd.fte} FTE)` : jd.positionType,
          fieldCell("Date Advertised"),
          formatNzDisplayDate(jd.dateAdvertised),
        ],
        [fieldCell("Level/Salary Range"), jd.salaryRangeText, fieldCell("Closing Date"), formatNzClosingDate(jd.closingAt)],
        [fieldCell("Senior Teacher:"), jd.seniorTeacherName, fieldCell("Start Date"), jd.startDateText],
      ],
    },
    layout: "jdFieldTable",
  };
}

function buildAdministratorFieldTable(jd: JobDescriptionView): PdfContent {
  return {
    table: {
      widths: ["25%", "25%", "25%", "25%"],
      body: [
        [fieldCell("Job Title"), jd.jobTitle, fieldCell("Job Category"), jd.jobCategory],
        [fieldCell("Location"), formatJdLocationDisplay(jd.locationDisplay), fieldCell("Position Hours"), jd.extras?.positionHours ?? ""],
      ],
    },
    layout: "jdFieldTable",
  };
}

function buildApplicationsAndQualifications(jd: JobDescriptionView): PdfContent {
  return {
    table: {
      widths: ["50%", "50%"],
      body: [
        [{ text: titleText("Applications only accepted by"), bold: true, fillColor: "#d9d9d9", colSpan: 2 }, {}],
        [
          {
            stack: [
              { text: titleText("E-MAIL"), bold: true, margin: [0, 4, 0, 2] },
              { text: "Appointments Secretary" },
              { text: "office@ikindergartens.nz", color: "#0563c1" },
            ],
          },
          {
            stack: [
              { text: titleText("QUALIFICATIONS AND EDUCATION REQUIREMENTS"), bold: true, fontSize: 9, margin: [0, 4, 0, 2] },
              { text: jd.qualificationsText, fontSize: 9 },
            ],
          },
        ],
      ],
    },
    layout: "jdFieldTable",
  };
}

function buildRoleSection(section: JobDescriptionView["roleSections"][number]): PdfContent[] {
  const stack: PdfContent[] = [{ text: titleText(section.heading), bold: true, margin: [0, 6, 0, 2] }];
  if (section.intro) stack.push({ text: section.intro, margin: [0, 0, 0, 3] });
  stack.push({
    ul: section.bullets.map((bullet) =>
      bullet.boldLeadIn ? { text: [{ text: bullet.boldLeadIn, bold: true }, ` ${bullet.text}`] } : bullet.text,
    ),
    margin: [0, 0, 0, 4],
  });
  return stack;
}

// Shared ROLE AND RESPONSIBILITIES renderer for both layout variants. The
// standard layout includes the intro paragraph before the sections; the
// administrator layout appends a REPORTS TO line after them.
function buildRoleAndResponsibilities(jd: JobDescriptionView): PdfContent[] {
  const isAdministrator = jd.layoutVariant === "administrator";
  const content: PdfContent[] = [{ text: "Job Description", bold: true, fillColor: "#d9d9d9", margin: [4, 4, 4, 4] }];

  if (!isAdministrator && jd.introParagraph) {
    content.push({ text: jd.introParagraph, margin: [BODY_LEFT_OFFSET, 8, 0, 8] });
  }
  content.push({ text: titleText("ROLE AND RESPONSIBILITIES"), bold: true, margin: [BODY_LEFT_OFFSET, 4, 0, 4] });

  if (!isAdministrator) {
    const midpoint = Math.ceil(jd.roleSections.length / 2);
    content.push({
      columns: [
        { width: "*", stack: jd.roleSections.slice(0, midpoint).flatMap(buildRoleSection) },
        { width: "*", stack: jd.roleSections.slice(midpoint).flatMap(buildRoleSection) },
      ],
      columnGap: 14,
      fontSize: 9.2,
      margin: [BODY_LEFT_OFFSET, 0, 0, 4],
    });
  } else {
    for (const section of jd.roleSections) {
      content.push(...buildRoleSection(section).map((item) => ({ ...item, margin: [BODY_LEFT_OFFSET, 0, 0, 4] })));
    }
  }

  if (isAdministrator && jd.extras?.reportsTo) {
    content.push({ text: [{ text: `${titleText("REPORTS TO")} `, bold: true }, jd.extras.reportsTo], margin: [BODY_LEFT_OFFSET, 8, 0, 0] });
  }

  return content;
}

function buildFooterTable(jd: JobDescriptionView): PdfContent {
  const now = new Date();
  const lastUpdatedDate = formatNzDateTimeInput(now).replace("T", " ");
  return {
    table: {
      widths: ["25%", "25%", "25%", "25%"],
      body: [
        [fieldCell("Reviewed By"), jd.reviewedByAcronym, fieldCell("Date"), ""],
        [fieldCell("Approved By"), jd.approvedByAcronym, fieldCell("Date"), ""],
        [fieldCell("Last Updated By"), jd.lastUpdatedByAcronym, fieldCell("Date/Time"), lastUpdatedDate],
      ],
    },
    layout: "jdFieldTable",
    margin: [BODY_LEFT_OFFSET, 12, 0, 0],
  };
}

const JD_PDF_ASSET_BASE_URL = "https://inspiredkindergartens.nz/assets/Job-Descriptions";

function nzAdvertisedDateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: NZ_TIME_ZONE,
      year: "numeric",
      month: "long",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

function nzTimestampParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: NZ_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

function slugPart(value: string): string {
  return value
    .replace(/\s*Kindergarten\s*$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function jdPdfFilename(jd: JobDescriptionView): string {
  const advertisedDate = new Date(jd.dateAdvertised ?? jd.createdAt ?? Date.now());
  const timestampDate = new Date(jd.updatedAt ?? jd.createdAt ?? jd.dateAdvertised ?? Date.now());
  const advertised = nzAdvertisedDateParts(Number.isNaN(advertisedDate.getTime()) ? new Date() : advertisedDate);
  const timestamp = nzTimestampParts(Number.isNaN(timestampDate.getTime()) ? new Date() : timestampDate);
  const timestampPart = `${timestamp.year}${timestamp.month.padStart(2, "0")}${timestamp.day.padStart(2, "0")}-${timestamp.hour.padStart(2, "0")}${timestamp.minute.padStart(2, "0")}${timestamp.second.padStart(2, "0")}`;

  return [
    "PD",
    slugPart(jd.jobTitle),
    slugPart(jd.locationDisplay),
    advertised.month,
    advertised.day,
    advertised.year,
    timestampPart,
  ]
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-")
    .concat(".pdf");
}

export function jdPdfAssetUrl(jd: JobDescriptionView): string {
  return `${JD_PDF_ASSET_BASE_URL}/${encodeURIComponent(jdPdfFilename(jd)).replace(/%2F/gi, "/")}`;
}

let fontsConfigured = false;

function ensureFontsConfigured() {
  if (fontsConfigured) return;
  PdfPrinter.setLocalAccessPolicy((path: string) => path.toLowerCase().startsWith(FONT_DIR.toLowerCase()));
  PdfPrinter.setUrlAccessPolicy(() => false);
  PdfPrinter.setFonts(FONTS);
  PdfPrinter.setTableLayouts({ jdFieldTable: FIELD_TABLE_LAYOUT });
  fontsConfigured = true;
}

export async function generateJdPdfBuffer(jd: JobDescriptionView): Promise<Buffer> {
  ensureFontsConfigured();
  const logo = await getLogoDataUri();
  const isAdministrator = jd.layoutVariant === "administrator";

  const header: PdfContent[] = [];
  if (isAdministrator) {
    header.push({ text: "Inspired Kindergartens 'Private and Confidential'", fontSize: 9, margin: [0, 0, 0, 8] });
  }
  header.push({
    columns: [
      { text: "", width: "*" },
      logo ? { image: logo, width: 140 } : { text: "inspired kindergartens", bold: true, fontSize: 16 },
    ],
    margin: [0, 0, 0, 8],
  });

  const body: PdfContent[] = isAdministrator
    ? [buildAdministratorFieldTable(jd), ...buildRoleAndResponsibilities(jd)]
    : [buildStandardFieldTable(jd), buildApplicationsAndQualifications(jd), ...buildRoleAndResponsibilities(jd)];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, isAdministrator ? 60 : 40],
    content: [...header, ...body, buildFooterTable(jd)],
    footer: isAdministrator
      ? () => ({
          columns: [
            { text: "Inspired Kindergartens", fontSize: 8, margin: [40, 0, 0, 0] },
            { text: "'Private and Confidential'", fontSize: 8, alignment: "right", margin: [0, 0, 40, 0] },
          ],
        })
      : undefined,
    defaultStyle: { font: "Arial", fontSize: 10 },
  };

  const doc = PdfPrinter.createPdf(docDefinition);
  return doc.getBuffer();
}
