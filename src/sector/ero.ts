import { normaliseName } from "./names.js";

// When a centre opened, as near as the Education Review Office's public pages
// tell. Neither the Ministry's directory nor ERO publishes an opening date, so
// this reads the clues ERO's latest report gives, best first:
//   stated         the report says so ("was established in August 2018")
//   first-review   it is the service's first ERO review (open by then, and
//                  usually not long before)
//   earliest-review the oldest ERO report the page mentions (open by then)
//   no-review      ERO has no page for it yet: recently licensed
// Group pages (one report for a whole governing organisation) and reports in
// te reo Māori usually give none of these, and the column stays blank.
// The current licence counts: a service relicensed after a change of owner
// reads as new.

export type OpenedBasis = "stated" | "first-review" | "earliest-review" | "no-review" | "";

export type EroOpening = {
  basis: OpenedBasis;
  year: number | null;
  month: number | null; // 1-12
  evidence: string; // the words or dates it rests on
};

export const NO_OPENING: EroOpening = { basis: "", year: null, month: null, evidence: "" };

const ERO_BASE = "https://www.ero.govt.nz/institution";
const USER_AGENT = "MarketingHelperAI/1.0 (Inspired Kindergartens sector insight; one request at a time)";
const FETCH_TIMEOUT_MS = 20_000;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_PATTERN = MONTHS.join("|");
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthNumber(name: string | undefined): number | null {
  if (!name) return null;
  const index = MONTHS.indexOf(name.toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function validYear(year: number, now: Date): boolean {
  return year >= 1900 && year <= now.getFullYear();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// The report part of an ERO institution page as plain text: from the
// institution details to the end of the past-reports list.
export function eroPageText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\s+/g, " ");
  const start = text.indexOf("Education institution number:");
  if (start < 0) return "";
  const end = text.indexOf("Page updated:", start);
  return text.slice(start, end > start ? end : undefined);
}

type MonthYear = { year: number; month: number | null };

function monthKey(date: MonthYear): number {
  return date.year * 12 + (date.month ?? 1);
}

function monthYears(text: string, now: Date): MonthYear[] {
  return [...text.matchAll(new RegExp(`\\b(${MONTH_PATTERN}),?\\s+((?:19|20)\\d{2})\\b`, "gi"))]
    .map((match) => ({ month: monthNumber(match[1]), year: Number(match[2]) }))
    .filter((date) => validYear(date.year, now));
}

// "the 2018 ERO report", "ERO's 2015 review".
function yearOnlyReports(text: string, now: Date): MonthYear[] {
  return [...text.matchAll(/\b((?:19|20)\d{2}) (?:ERO )?(?:report|review|evaluation)\b/gi)]
    .map((match) => ({ month: null, year: Number(match[1]) }))
    .filter((date) => validYear(date.year, now));
}

function earliest(dates: MonthYear[]): MonthYear | null {
  return dates.reduce<MonthYear | null>((best, date) => (!best || monthKey(date) < monthKey(best) ? date : best), null);
}

// "<Centre> - July 2022" heading, or "Date of this report 25 July 2022".
function reportDate(text: string, now: Date): MonthYear | null {
  const dated = text.match(new RegExp(`Date of this report:?\\s+(?:\\d{1,2}\\s+)?(${MONTH_PATTERN}),?\\s+((?:19|20)\\d{2})`, "i"));
  if (dated && validYear(Number(dated[2]), now)) return { month: monthNumber(dated[1])!, year: Number(dated[2]) };
  const heading = text.match(new RegExp(`\\s[-–]\\s(${MONTH_PATTERN})\\s+((?:19|20)\\d{2})\\b`, "i"));
  if (heading && validYear(Number(heading[2]), now)) return { month: monthNumber(heading[1])!, year: Number(heading[2]) };
  return null;
}

// Every ERO report date the page mentions: this report, the "Most recent ERO
// report(s)" line inside it, and the Past Reports list.
function reportDates(text: string, now: Date): MonthYear[] {
  const dates: MonthYear[] = yearOnlyReports(text, now);
  const current = reportDate(text, now);
  if (current) dates.push(current);
  for (const marker of ["Most recent ERO report", "Past Reports"]) {
    let from = text.indexOf(marker);
    while (from >= 0) {
      const stop = text.slice(from + marker.length).search(/On this page|Print\b|Information About the Service|General Information/);
      dates.push(...monthYears(text.slice(from, stop >= 0 ? from + marker.length + stop : from + 300), now));
      from = text.indexOf(marker, from + marker.length);
    }
  }
  return dates;
}

const OPENING_VERB = new RegExp(
  "(?<![-\\w])(?:established|opened|founded|licensed|began operating|started operating|commenced operating|opened its doors)" +
    `(?:\\s+(?:in|on))?\\s+(?:(?:\\d{1,2})\\s+)?(?:(${MONTH_PATTERN}),?\\s+)?((?:19|20)\\d{2})\\b` +
    "|(?:has (?:been )?(?:operat(?:ed|ing)|open|running)|operating) since\\s+(?:(" +
    MONTH_PATTERN +
    "),?\\s+)?((?:19|20)\\d{2})\\b",
  "i",
);
// Words that make the thing opened something other than the service itself.
const NOT_THE_SERVICE = /\b(building|room|rooms|team|space|nursery|area|areas|programme|extension|playground|garden|premises|site|wing|toddler|infant|under-?2|over-?2|whanau room|kitchen|association|organisation|trust|group|company|board|leader|manager|curriculum|partnership)s?\b|re-?licen[cs]ed/i;
const SERVICE_SUBJECT = /\b(?:the|this) (?:service|centre|center|kindergarten|preschool|pre-school|early learning (?:centre|service)|playcentre|kōhanga(?: reo)?|kohanga(?: reo)?|puna reo|childcare centre)\b|^\s*it\b/i;

// "Otamarakau Kindergarten was established in August 2018": the service (by
// name or as "the service / the centre / it") is the subject of the opening.
export function statedOpening(text: string, centreName: string, now: Date): (EroOpening & { year: number }) | null {
  const name = normaliseName(centreName);
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const match = sentence.match(OPENING_VERB);
    if (!match || match.index == null) continue;
    const subject = sentence.slice(0, match.index);
    if (NOT_THE_SERVICE.test(subject)) continue;
    const namesService = (name.length >= 4 && normaliseName(subject).includes(name)) || SERVICE_SUBJECT.test(subject.trim());
    if (!namesService) continue;
    const year = Number(match[2] ?? match[4]);
    if (!validYear(year, now)) continue;
    return {
      basis: "stated",
      year,
      month: monthNumber(match[1] ?? match[3]),
      evidence: sentence.trim().slice(0, 300),
    };
  }
  return null;
}

const FIRST_REVIEW =
  /First ERO (?:review|report|evaluation) of the service|This is (?:its|the service's|their|the) first ERO (?:review|report|evaluation)|first ERO (?:review|report|evaluation) (?:for|of) (?:this|the) (?:service|centre|kindergarten)/i;
const GROUP_PAGE = /part of a larger group of early childhood services operated by one organisation/i;

function monthYearText(date: MonthYear): string {
  if (date.month == null) return String(date.year);
  const name = MONTHS[date.month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.year}`;
}

// Reads one ERO institution page and, since mid-2025 when ERO moved report
// bodies into PDFs, the report PDF's text (its "About the Service" section
// often says when the service opened). `hasPage` is false when ERO has no page
// for the institution (it redirects to its report search).
export function readEroOpening(html: string, hasPage: boolean, centreName: string, now = new Date(), reportPdfText = ""): EroOpening {
  if (!hasPage) return { basis: "no-review", year: null, month: null, evidence: "No ERO report yet" };
  const pageText = eroPageText(html);
  if (!pageText || GROUP_PAGE.test(pageText)) return NO_OPENING;
  const text = reportPdfText ? `${pageText} ${reportPdfText.replace(/\s+/g, " ")}` : pageText;

  const dates = reportDates(text, now);
  const oldest = earliest(dates);
  const stated = statedOpening(text, centreName, now);
  // A stated year after an older ERO report is about something else (a move,
  // a new licence), so the report dates win.
  if (stated && (!oldest || stated.year <= oldest.year)) return stated;

  const current = reportDate(text, now);
  if (current && FIRST_REVIEW.test(text) && (!oldest || monthKey(current) <= monthKey(oldest))) {
    return { basis: "first-review", year: current.year, month: current.month, evidence: `First ERO review, ${monthYearText(current)}` };
  }
  if (oldest) {
    return { basis: "earliest-review", year: oldest.year, month: oldest.month, evidence: `Earliest ERO report, ${monthYearText(oldest)}` };
  }
  return NO_OPENING;
}

const BASIS_RANK: Record<OpenedBasis, number> = { stated: 4, "first-review": 3, "earliest-review": 2, "no-review": 1, "": 0 };

// What is kept after a new reading. ERO pages only show the latest report, so
// a first-review or stated reading would vanish once the next report is out:
// the better reading is kept, and an older report date always wins.
export function mergeOpening(current: EroOpening, found: EroOpening): EroOpening {
  if (found.basis === "") return current;
  if (current.basis === "") return found;
  const foundEarlier = found.year != null && current.year != null && found.year < current.year;
  if (found.basis === "earliest-review" && foundEarlier) return found;
  if (BASIS_RANK[found.basis] > BASIS_RANK[current.basis]) return found;
  return current;
}

export function openedLabel(opening: Pick<EroOpening, "basis" | "year" | "month">): string {
  switch (opening.basis) {
    case "stated":
      return opening.year == null ? "" : opening.month ? `${MONTH_SHORT[opening.month - 1]} ${opening.year}` : String(opening.year);
    case "first-review":
      return opening.year == null ? "" : `c. ${opening.year}`;
    case "earliest-review":
      return opening.year == null ? "" : `${opening.year} or earlier`;
    case "no-review":
      return "Recent";
    default:
      return "";
  }
}

// ERO also has no page of its own for a centre reviewed as part of its group
// (kindergarten associations, Evolve's brands), however old. Licence numbers
// are issued in order, so "no page" only means "recently licensed" from the
// lowest licence number that ERO itself dates to the last three years.
// Null when there is no such centre (then no missing page reads as recent).
export const RECENT_YEARS = 3;

export function recentLicenceThreshold(centres: ReadonlyArray<{ eceId: number | null; openedBasis: string; openedYear: number | null }>, now = new Date()): number | null {
  const ids = centres
    .filter((centre) => centre.eceId != null && (centre.openedBasis === "stated" || centre.openedBasis === "first-review") && centre.openedYear != null && centre.openedYear >= now.getFullYear() - RECENT_YEARS)
    .map((centre) => centre.eceId!);
  return ids.length ? Math.min(...ids) : null;
}

export const GROUP_REVIEWED_EVIDENCE = "No ERO page of its own (reviewed as part of its group)";

// The same label from a stored centre row.
export function centreOpenedLabel(centre: { openedBasis: string; openedYear: number | null; openedMonth: number | null }): string {
  return openedLabel({ basis: centre.openedBasis as OpenedBasis, year: centre.openedYear, month: centre.openedMonth });
}

export function eroPageUrl(eceId: number): string {
  return `${ERO_BASE}/${eceId}/report`;
}

// ERO's guidance documents are linked from every report; the report itself
// is the other PDF in the report part of the page.
const GUIDANCE_PDF = /framework|poutama|rubric|indicators|guide|terms/i;

export function reportPdfUrl(html: string): string | null {
  const start = html.indexOf("Education institution number");
  const end = html.indexOf("Page updated", start);
  if (start < 0) return null;
  const section = html.slice(start, end > start ? end : undefined);
  for (const match of section.matchAll(/href="([^"]+\.pdf)"/gi)) {
    const href = decodeEntities(match[1]);
    if (GUIDANCE_PDF.test(decodeURIComponent(href))) continue;
    try {
      const url = new URL(href, "https://www.ero.govt.nz/");
      if (/(^|\.)ero\.govt\.nz$/i.test(url.hostname)) return url.toString();
    } catch {
      // not a usable link
    }
  }
  return null;
}

// The institution page is fetched without following redirects (a redirect to
// the report search means ERO has no page for it); report PDFs redirect to
// their document store and are followed, within ERO's site only.
async function fetchWithTimeout(url: string, accept: string, followRedirects = false): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      redirect: followRedirects ? "follow" : "manual",
      signal: controller.signal,
    });
    if (followRedirects && !/(^|\.)ero\.govt\.nz$/i.test(new URL(response.url || url).hostname)) {
      return new Response(null, { status: 404 });
    }
    // Read the body inside the timeout.
    const body = await response.arrayBuffer();
    return new Response(response.status >= 200 && response.status < 300 ? body : null, { status: response.status, headers: response.headers });
  } finally {
    clearTimeout(timeout);
  }
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

async function readReportPdf(url: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(url, "application/pdf", true);
    if (!response.ok) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) return "";
    const { extractPdfText } = await import("../ai/document-reader.js");
    return (await extractPdfText(buffer)).text;
  } catch {
    return "";
  }
}

// One ERO page (and its report PDF). Null when ERO could not be reached, so
// nothing is changed.
export async function fetchEroOpening(eceId: number, centreName: string, pause: () => Promise<unknown> = async () => undefined): Promise<EroOpening | null> {
  try {
    const response = await fetchWithTimeout(eroPageUrl(eceId), "text/html");
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      return /review-reports/i.test(location) ? readEroOpening("", false, centreName) : null;
    }
    if (!response.ok) return null;
    const html = await response.text();
    const pdf = reportPdfUrl(html);
    let pdfText = "";
    if (pdf) {
      await pause();
      pdfText = await readReportPdf(pdf);
    }
    return readEroOpening(html, true, centreName, new Date(), pdfText);
  } catch {
    return null;
  }
}
