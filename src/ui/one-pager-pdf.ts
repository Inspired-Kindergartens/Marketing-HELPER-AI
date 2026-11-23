// A kindergarten's info sheet as an A4 PDF. The layout is the 2023 design
// (docs/One Pager), measured from those files in points: logo, teal name
// band, three photos, the orange tagline stroke,
// then About us and the team photo on the left and the contact and question
// sections on the right.
//
// It is always one page. The left column gives up team photo height first,
// then text size; the right column gives up line spacing, then text size.
// When a column still does not fit, the result says by how many lines.
import PdfPrinter from "pdfmake";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import type { OnePagerContent, OnePagerSlot } from "../one-pager/template.js";
import { ensureFontsConfigured, getLogoDataUri } from "./jd/jd-pdf.js";

type PdfContent = Record<string, unknown>;

export type OnePagerImages = Partial<Record<OnePagerSlot, { bytes: Buffer; mimeType: string } | null>>;

const PAGE = { width: 595.28, height: 841.89 };
const TEAL = "#3ab7b1";
const ORANGE = "#f5a02f";
const INK = "#1d1d1b";
// The newer sheets (Matua, Gwen Rogers, Otamarakau, Tai o Fenua and others,
// 2023-25) set the name, the tagline and every heading in a heavy sans; the
// text under them stays Calibri. Arial Bold is the one this computer has.
const HEADING_FONT = "Arial";

// pdfmake sets Calibri in a line box one em tall with the baseline 0.75 em
// down; the originals use these leadings (line box as a multiple of the size).
const LEFT_LEADING = 1.195;
const CAPTION_LEADING = 1.21;

// The box scripts/one-pager-logo-artwork.ts cuts the logo from.
const LOGO = { x: 214, y: 13, width: 170 };
const TAI_HEADER = { x: 250, y: 10, width: 310, height: 75 };
// Centred in the half-circle, its cut bottom edge on the bottom of the page.
const TAI_HIBISCUS = { x: 282.4, y: PAGE.height - 20.74, width: 27.2, height: 20.74 };
const BAND = { x: 36, y: 94.2, width: 523.2, height: 69.4 };
const PHOTOS = { y: 170.5, width: 172.4, height: 120.6, xs: [36, 211.4, 386.8] };
const BRUSH = { x: 150.4, y: 294.7, width: 311.1, height: 38.5 };
const BUTTERFLY = { x: 8, y: 670, width: 55.9, height: 51.1 };
// Mirrored artwork, hard against the left and bottom edges of the page, so
// its stems come in from the page edge.
const FERN = { x: 0, y: PAGE.height - 58.7, width: 110, height: 58.7 };
const HALF_CIRCLE = { x: 296, y: 863, radius: 48 };
const RULE = { x: 355, top: 340, bottom: 815 };

const COLUMNS_TOP = 342;
const COLUMNS_BOTTOM = 27;
const LEFT = { x: 37.6, width: 290 };
const RIGHT = { x: 369.6, width: 184 };

type LeftLevel = { photoHeight: number; fontSize: number };
// gap: space above a heading; lead: space between a heading and its text.
type RightLevel = { fontSize: number; lineHeight: number; gap: number; lead: number };

const TEAM_RATIO = 4 / 3;
const LEFT_LEVELS: LeftLevel[] = [
  { photoHeight: 194, fontSize: 10 },
  { photoHeight: 185, fontSize: 10 },
  { photoHeight: 175, fontSize: 10 },
  { photoHeight: 165, fontSize: 10 },
  { photoHeight: 155, fontSize: 10 },
  { photoHeight: 147, fontSize: 10 },
  { photoHeight: 140, fontSize: 10 },
  { photoHeight: 130, fontSize: 10 },
  { photoHeight: 120, fontSize: 10 },
  { photoHeight: 120, fontSize: 9.5 },
  { photoHeight: 110, fontSize: 9.5 },
  { photoHeight: 110, fontSize: 9 },
  { photoHeight: 100, fontSize: 9 },
  { photoHeight: 100, fontSize: 8.5 },
];
const RIGHT_LEVELS: RightLevel[] = [
  { fontSize: 9.8, lineHeight: 1.45, gap: 6.35, lead: 5.05 },
  { fontSize: 9.8, lineHeight: 1.35, gap: 5.5, lead: 4.5 },
  { fontSize: 9.8, lineHeight: 1.25, gap: 5, lead: 4 },
  { fontSize: 9.8, lineHeight: 1.15, gap: 4, lead: 3 },
  { fontSize: 9.3, lineHeight: 1.15, gap: 4, lead: 3 },
  { fontSize: 8.8, lineHeight: 1.1, gap: 3, lead: 2.5 },
];

export type OnePagerFit = {
  // 0 when the column fits; otherwise roughly how many lines too long it is.
  leftOverflowLines: number;
  rightOverflowLines: number;
};

export type OnePagerPdf = { buffer: Buffer; fits: boolean; fit: OnePagerFit };

const ASSET_DIR = join("src", "assets", "one-pager");
const artworkCache = new Map<string, string | null>();

async function artwork(name: string): Promise<string | null> {
  if (!artworkCache.has(name)) {
    const data = await readFile(join(process.cwd(), ASSET_DIR, name)).then(
      (buffer) => `data:image/png;base64,${buffer.toString("base64")}`,
      () => null,
    );
    artworkCache.set(name, data);
  }
  return artworkCache.get(name) ?? null;
}

// A one-pixel picture that stands in for the team photo while a column is
// measured: it takes the photo's space without the photo's bytes.
const PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function dataUri(image: { bytes: Buffer; mimeType: string }): string {
  return `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
}

// ---- The two columns --------------------------------------------------------

// The preview's badges ("Staff photo needed", "Email sent"), one under the
// other from (x, y) measured from where the column has got to. They are
// placed apart from the column's flow, so they take no room in it.
// They look like the app's own controls (its Default look): a black box with
// a green border and green text.
const BADGE = { fontSize: 15, height: 23, pitch: 28, padding: 8, radius: 3, fill: "#040404", green: "#7fbe6f" };

// How wide a badge's words are, in points, in the bold text font.
function badgeTextWidth(text: string): number {
  const context = createCanvas(1, 1).getContext("2d");
  context.font = `bold ${BADGE.fontSize}px Calibri`;
  return context.measureText(text).width;
}

function badgeStack(badges: string[], x: number, y: number): PdfContent[] {
  // Each badge is a drawn box with its words placed on it. Both are drawn
  // after the photo, so they are on top of it (a table's fill would be drawn
  // under it).
  return badges.flatMap((text, index) => badgeBox({
    text: `  ${text}  `,
    fontSize: BADGE.fontSize,
    bold: true,
    color: BADGE.green,
  }, x, y + index * BADGE.pitch));
}

function badgeBox(label: PdfContent & { text: string }, x: number, y: number): PdfContent[] {
  const words = label.text.trim();
  const box = { type: "rect", x: 0.5, y: 0.5, w: Math.ceil(badgeTextWidth(words)) + 2 * BADGE.padding, h: BADGE.height, r: BADGE.radius, color: BADGE.fill, lineColor: BADGE.green, lineWidth: 1 };
  return [
    { canvas: [box], relativePosition: { x, y } },
    { ...label, text: words, relativePosition: { x: x + 0.5 + BADGE.padding, y: y + (BADGE.height - BADGE.fontSize) / 2 } },
  ];
}

function leftColumn(content: OnePagerContent, level: LeftLevel, team: string | "placeholder" | null, teamRatio = TEAM_RATIO, badges: string[] = []): PdfContent[] {
  const stack: PdfContent[] = [{ text: "About us", font: HEADING_FONT, fontSize: 16, bold: true, color: TEAL, margin: [0, 0, 0, content.about.length ? 5.5 : 8] }];
  // A blank line between paragraphs; a little less before the team photo.
  const gap = level.fontSize * LEFT_LEADING;

  content.about.forEach((block, index) => {
    const margin = [block.type === "list" ? 14 : 0, 0, 0, index === content.about.length - 1 ? 8 : gap];
    if (block.type === "paragraph") {
      stack.push({ text: block.text, fontSize: level.fontSize, lineHeight: LEFT_LEADING, margin });
    } else {
      stack.push({ ul: block.items, fontSize: level.fontSize, lineHeight: LEFT_LEADING, margin });
    }
  });

  if (team) {
    // Keep the whole team visible, whatever shape the photo is.
    const width = Math.min(LEFT.width, level.photoHeight * teamRatio);
    const height = width / teamRatio;
    const margin = [(LEFT.width - width) / 2, 0, 0, 5];
    stack.push(
      team === "placeholder"
        ? { image: PLACEHOLDER_IMAGE, width, height, margin }
        : { image: team, width, height, margin },
    );
    // Drawn after the photo, so they sit on top of it, in its top left corner.
    stack.push(...badgeStack(badges, margin[0] + 6, 6 - height - margin[3]));
    if (content.teamCaption) {
      stack.push({ text: content.teamCaption, fontSize: 7.6, alignment: "center", lineHeight: CAPTION_LEADING });
    }
  } else {
    // No team photo yet: the badges go where it would start.
    stack.push(...badgeStack(badges, 0, 0));
  }
  return stack;
}

const RIGHT_BULLET = /^\s*[-•*]\s+/;

function rightColumn(content: OnePagerContent, level: RightLevel): PdfContent[] {
  return content.sections.flatMap((section, index) => {
    const lines = section.text.split("\n").filter((line) => line.trim());
    // A section typed as bullets (the All Day fees) is set as a list, so a
    // long item wraps under its own text.
    const body = lines.length > 1 && lines.every((line) => RIGHT_BULLET.test(line))
      ? { ul: lines.map((line) => line.replace(RIGHT_BULLET, "")), fontSize: level.fontSize, lineHeight: level.lineHeight }
      : { text: section.text, fontSize: level.fontSize, lineHeight: level.lineHeight };
    return [{ text: section.heading, font: HEADING_FONT, fontSize: 12, bold: true, color: ORANGE, margin: [0, index === 0 ? 0 : level.gap, 0, level.lead] }, body];
  });
}

// ---- Fitting -----------------------------------------------------------------

async function render(definition: PdfContent): Promise<{ buffer: Buffer; pages: number }> {
  let pages = 1;
  const doc = PdfPrinter.createPdf({
    ...definition,
    footer: (_currentPage: number, pageCount: number) => {
      pages = pageCount;
      return { text: "" };
    },
  });
  const buffer = (await doc.getBuffer()) as Buffer;
  return { buffer, pages };
}

// One column alone on a page as tall as the real one plus `extra` points:
// does it stay on a single page?
async function columnFits(stack: PdfContent[], width: number, extra = 0): Promise<boolean> {
  const { pages } = await render({
    pageSize: { width: PAGE.width, height: PAGE.height + extra },
    pageMargins: [LEFT.x, COLUMNS_TOP, PAGE.width - LEFT.x - width, COLUMNS_BOTTOM],
    content: [{ stack }],
    defaultStyle: { font: "Calibri", fontSize: 10, color: INK },
  });
  return pages === 1;
}

// How many lines too long a column is at its tightest setting. pdfmake
// changes the content it is given, so each try gets a newly built column.
async function overflowLines(build: () => PdfContent[], width: number, linePoints: number): Promise<number> {
  let low = 0;
  let high = 1600;
  if (!(await columnFits(build(), width, high))) return Math.ceil(high / linePoints);
  while (high - low > linePoints / 2) {
    const middle = (low + high) / 2;
    if (await columnFits(build(), width, middle)) high = middle;
    else low = middle;
  }
  return Math.max(1, Math.ceil(high / linePoints));
}

async function firstFit<T>(levels: T[], build: (level: T) => PdfContent[], width: number): Promise<{ level: T; fits: boolean }> {
  for (const level of levels) {
    if (await columnFits(build(level), width)) return { level, fits: true };
  }
  return { level: levels[levels.length - 1], fits: false };
}

// ---- The page ----------------------------------------------------------------

// Text centred in a box `width` wide whose left edge is at x.
function centred(text: string, x: number, y: number, width: number, style: PdfContent): PdfContent {
  return { columns: [{ width, text, alignment: "center", ...style }], absolutePosition: { x, y } };
}

// The top of a line of heading text `size` points tall whose capitals look
// centred on `middle` (Arial's capitals sit 0.55 em below the top of its line).
const centredTop = (middle: number, size: number) => middle - 0.55 * size;

async function logoArtwork(): Promise<string | null> {
  // The info sheet's logo carries the te reo name under it; the app's own
  // logo stands in if that file is missing.
  return (await artwork("logo.png")) ?? (await getLogoDataUri());
}

async function background(content: OnePagerContent, images: OnePagerImages): Promise<PdfContent[]> {
  const [logo, band, brush, butterfly, fern] = await Promise.all([
    logoArtwork(),
    artwork("band.png"),
    artwork("brush.png"),
    artwork("butterfly.png"),
    artwork("fern.png"),
  ]);
  const layer: PdfContent[] = [];
  const place = (image: string | null, box: { x: number; y: number; width: number; height?: number }) => {
    if (image) layer.push({ image, width: box.width, ...(box.height ? { height: box.height } : {}), absolutePosition: { x: box.x, y: box.y } });
  };

  layer.push({
    canvas: [
      { type: "ellipse", x: HALF_CIRCLE.x, y: HALF_CIRCLE.y, r1: HALF_CIRCLE.radius, r2: HALF_CIRCLE.radius, color: TEAL },
      { type: "line", x1: RULE.x, y1: RULE.top, x2: RULE.x, y2: RULE.bottom, lineWidth: 0.75, lineColor: INK },
    ],
    absolutePosition: { x: 0, y: 0 },
  });
  place(fern, FERN);
  place(butterfly, BUTTERFLY);
  // The one exception to the shared design: Tai o Fenua's own artwork, as on
  // its original sheet: its logo beside ours at the top, and its hibiscus in
  // the teal half-circle at the foot. Without the logo artwork it gets the
  // usual logo like everyone else.
  const taiOFenua = content.ownLogo === "tai-o-fenua";
  const ownHeader = taiOFenua ? await artwork("tai-o-fenua-header.png") : null;
  if (ownHeader) place(ownHeader, TAI_HEADER);
  else place(logo, LOGO);
  if (taiOFenua) place(await artwork("tai-o-fenua-hibiscus.png"), TAI_HIBISCUS);

  if (band) place(band, BAND);
  else layer.push({ canvas: [{ type: "rect", x: 0, y: 0, w: BAND.width, h: BAND.height, color: TEAL }], absolutePosition: { x: BAND.x, y: BAND.y } });
  // The name sits on one line in the band: long names step the size down.
  const nameSize = content.name.length > 34 ? 20 : content.name.length > 26 ? 24 : 28;
  layer.push(centred(content.name, BAND.x, centredTop(BAND.y + BAND.height / 2, nameSize), BAND.width, { font: HEADING_FONT, fontSize: nameSize, bold: true, color: "#ffffff" }));

  (["photo1", "photo2", "photo3"] as const).forEach((slot, index) => {
    const image = images[slot];
    if (!image) return;
    layer.push({
      image: dataUri(image),
      cover: { width: PHOTOS.width, height: PHOTOS.height, valign: "center", align: "center" },
      absolutePosition: { x: PHOTOS.xs[index], y: PHOTOS.y },
    });
  });

  if (brush) place(brush, BRUSH);
  layer.push(centred(content.tagline, BRUSH.x, centredTop(BRUSH.y + BRUSH.height / 2, 16), BRUSH.width, { font: HEADING_FONT, fontSize: 16, bold: true, color: "#ffffff" }));
  return layer;
}

// `teamBadges` are drawn over the team photo. They are for the preview on the
// page only: the PDF that is downloaded is made without them.
export async function renderOnePagerPdf(content: OnePagerContent, images: OnePagerImages = {}, options: { teamBadges?: string[] } = {}): Promise<OnePagerPdf> {
  ensureFontsConfigured();

  const team = images.team ? dataUri(images.team) : null;
  const teamSize = images.team ? await loadImage(images.team.bytes) : null;
  const teamRatio = teamSize ? teamSize.width / teamSize.height : TEAM_RATIO;
  // With no team photo there is only the text to fit.
  const leftLevels = team ? LEFT_LEVELS : LEFT_LEVELS.filter((level, index, all) => all.findIndex((other) => other.fontSize === level.fontSize) === index);
  const left = await firstFit(leftLevels, (level) => leftColumn(content, level, team ? "placeholder" : null, teamRatio), LEFT.width);
  const right = await firstFit(RIGHT_LEVELS, (level) => rightColumn(content, level), RIGHT.width);

  const fit: OnePagerFit = {
    leftOverflowLines: left.fits ? 0 : await overflowLines(() => leftColumn(content, left.level, team ? "placeholder" : null, teamRatio), LEFT.width, left.level.fontSize * LEFT_LEADING),
    rightOverflowLines: right.fits ? 0 : await overflowLines(() => rightColumn(content, right.level), RIGHT.width, right.level.fontSize * right.level.lineHeight),
  };

  const layer = await background(content, images);
  const { buffer } = await render({
    pageSize: "A4",
    pageMargins: [LEFT.x, COLUMNS_TOP, 0, COLUMNS_BOTTOM],
    // Only the first page carries the design; an overflowing draft's second
    // page is plain so the spill is easy to see.
    background: (currentPage: number) => (currentPage === 1 ? layer : []),
    content: [
      {
        columns: [
          { width: LEFT.width, stack: leftColumn(content, left.level, team, teamRatio, options.teamBadges ?? []) },
          { width: RIGHT.width, stack: rightColumn(content, right.level) },
        ],
        columnGap: RIGHT.x - LEFT.x - LEFT.width,
      },
    ],
    defaultStyle: { font: "Calibri", fontSize: 10, color: INK },
    info: { title: `${content.name} info sheet`, author: "Inspired Kindergartens" },
  });

  return { buffer, fits: left.fits && right.fits, fit };
}

// ---- Print resolution --------------------------------------------------------

// What a photo needs to print sharply: this many of its pixels to an inch of paper.
export const ONE_PAGER_PRINT_DPI = 300;

// How many of a photo's pixels land on an inch of paper where its slot puts
// it: the three top photos fill their box, the team photo is at its largest.
export function onePagerPhotoDpi(slot: OnePagerSlot, width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 0;
  if (slot === "team") return (width / Math.min(LEFT.width, LEFT_LEVELS[0].photoHeight * (width / height))) * 72;
  return 72 / Math.max(PHOTOS.width / width, PHOTOS.height / height);
}

// True when the photo (after a tight crop, say) has too few pixels for its slot.
export async function onePagerPhotoIsTooSmall(slot: OnePagerSlot, bytes: Buffer): Promise<boolean> {
  const image = await loadImage(bytes).catch(() => null);
  return image ? onePagerPhotoDpi(slot, image.width, image.height) < ONE_PAGER_PRINT_DPI : false;
}

// "About us is 3 lines too long." for the editor; "" when everything fits.
export function describeOnePagerFit(fit: OnePagerFit): string {
  const lines = (count: number) => `${count} line${count === 1 ? "" : "s"} too long`;
  return [
    fit.leftOverflowLines ? `The left column (About us, team photo and caption) is ${lines(fit.leftOverflowLines)}.` : "",
    fit.rightOverflowLines ? `The right column (contact, hours and questions) is ${lines(fit.rightOverflowLines)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
