import type { JobDescriptionView } from "../../storage/jd-store.js";
import { NZ_TIME_ZONE } from "./jd-date.js";

export const JD_EMAIL_RECIPIENT = "office@ikindergartens.nz";
const JD_VACANCY_BASE_URL = "https://inspiredkindergartens.nz/employment-and-careers/vacancies";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Words that stay lower-case inside a name unless they lead it, plus the
// Te Reo / Pacific particles that appear in centre names ("Tai o Fenua").
const LOWER_CASE_SMALL_WORDS = new Set(["a", "and", "o", "of", "the", "me", "ki", "na", "nga"]);

// Names already stored in mixed case can carry an intentional acronym
// ("OPEYS"); an all-caps word of 2-5 letters with no vowel pattern of a real
// word is kept as-is rather than flattened to "Opeys".
const PRESERVED_ACRONYMS = new Set(["OPEYS"]);

function titleCaseWord(value: string, isFirst: boolean): string {
  return value
    .split("/")
    .map((part, partIndex) => {
      if (!part) return part;
      if (PRESERVED_ACRONYMS.has(part)) return part;
      const lower = part.toLowerCase();
      if (!(isFirst && partIndex === 0) && LOWER_CASE_SMALL_WORDS.has(lower)) return lower;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("/");
}

function toTitleCase(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => titleCaseWord(word, index === 0))
    .join(" ");
}

// Centre locationDisplay values are stored upper-cased and often carry a
// duplicated trailing "Kindergarten" (the fallback in jd-store builds
// `${name.toUpperCase()} Kindergarten` over names that already end in
// KINDERGARTEN). Title-case and collapse the repeat so display text reads
// "Gwen Rogers Kindergarten". Shared by the email and the blurb boilerplate.
const RE_ADJACENT_REPEAT = /(?:\s+Kindergarten){2,}$/i;
const RE_TRAILING = /\s+Kindergarten$/i;
const RE_WORD = /\bkindergarten\b/i;
export function formatJdLocationDisplay(locationDisplay: string): string {
  const titleCased = toTitleCase(locationDisplay);
  // Collapse adjacent repeats ("Arataki Kindergarten Kindergarten"), then
  // drop a trailing one that only duplicates an earlier mid-string
  // occurrence ("Maungaarangi Kindergarten and Whanau Centre Kindergarten").
  const collapsed = titleCased.replace(RE_ADJACENT_REPEAT, " Kindergarten");
  const withoutTrailing = collapsed.replace(RE_TRAILING, "");
  return RE_WORD.test(withoutTrailing) ? withoutTrailing : collapsed;
}

export const formatJdEmailLocation = formatJdLocationDisplay;

export function formatJdEmailJobTitle(jobTitle: string): string {
  return toTitleCase(jobTitle);
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function utmPart(value: string): string {
  return slugPart(value).replace(/-/g, "_");
}

function compactCampaignJobTitle(value: string): string {
  return value
    .replace(/\s*\/\s*kaiako\b/gi, "")
    .replace(/\bkaiako\b/gi, "")
    .replace(/\bposition\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function advertisedYear(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? String(date.getUTCFullYear()) : String(new Date().getFullYear());
}

// The website page title. The month+year suffix keeps each posting's
// auto-generated URL unique, so re-advertising the same role at the same
// centre doesn't collide with the previous vacancy page. Sourced from
// dateAdvertised so the title agrees with the utm_campaign year.
function advertisedMonthYear(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe.toLocaleDateString("en-NZ", { timeZone: NZ_TIME_ZONE, month: "long", year: "numeric" });
}

// "Full Time" is the stored value; the page title reads "Full-time".
function titlePositionType(positionType: string): string {
  const trimmed = positionType.replace(/\s+/g, " ").trim();
  return /^full[\s-]?time$/i.test(trimmed) ? "Full-time" : toTitleCase(trimmed);
}

export function buildJdWebsitePageTitle(
  jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay" | "positionType" | "dateAdvertised">,
): string {
  // The job title may already carry its own "Part-time"/"Full Time" prefix
  // (e.g. the "Part-time Teacher" title profile); strip it so the position
  // type is stated once, from positionType.
  const role = formatJdEmailJobTitle(jd.jobTitle)
    .replace(/^\s*(full|part)[\s-]?time\s+/i, "")
    .trim();
  // Kaiako means teacher, so only teaching roles take the bilingual pairing.
  const isTeaching = /teacher/i.test(role);
  const roleWithKaiako = !isTeaching || /kaiako/i.test(role) ? role : role + " / Kaiako";
  const withPosition = /position/i.test(roleWithKaiako) ? roleWithKaiako : roleWithKaiako + " Position";
  const location = formatJdLocationDisplay(jd.locationDisplay);
  return `${titlePositionType(jd.positionType)} ${withPosition} - ${location} ${advertisedMonthYear(jd.dateAdvertised)}`;
}

// The emailed link IS the live vacancy page URL, so its slug must be the
// slugified page title -- that is what the website generates the page at.
export function buildJdVacancyUtmUrl(
  jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay" | "positionType" | "dateAdvertised">,
) {
  const jobTitle = formatJdEmailJobTitle(jd.jobTitle);
  const location = formatJdEmailLocation(jd.locationDisplay);
  const pathSlug = slugPart(buildJdWebsitePageTitle(jd));
  const campaign = [
    utmPart(location.replace(/\s*Kindergarten\s*$/i, "")),
    utmPart(compactCampaignJobTitle(jobTitle)),
    advertisedYear(jd.dateAdvertised),
  ]
    .filter(Boolean)
    .join("_");
  const params = new URLSearchParams({
    utm_source: "education_gazette",
    utm_medium: "referral",
    utm_campaign: campaign,
  });

  return `${JD_VACANCY_BASE_URL}/${pathSlug}?${params.toString()}`;
}

export function buildJdEmailSubject(jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay">) {
  return `${formatJdEmailLocation(jd.locationDisplay)} ${formatJdEmailJobTitle(jd.jobTitle)} Job is Now Live`;
}

export function buildJdEmailHtml(jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay" | "positionType" | "dateAdvertised">) {
  const location = formatJdEmailLocation(jd.locationDisplay);
  const jobTitle = formatJdEmailJobTitle(jd.jobTitle);
  const vacancyUrl = buildJdVacancyUtmUrl(jd);

  return [
    "<p>Kia ora,</p>",
    `<p>The job application for the ${escapeHtml(location)} ${escapeHtml(jobTitle)} role is now live on the website.</p>`,
    `<p>The link for Ed Gazette is <a href="${escapeHtml(vacancyUrl)}">${escapeHtml(vacancyUrl)}</a></p>`,
  ].join("\n");
}

export function buildJdEmailText(jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay" | "positionType" | "dateAdvertised">) {
  const location = formatJdEmailLocation(jd.locationDisplay);
  const jobTitle = formatJdEmailJobTitle(jd.jobTitle);
  const vacancyUrl = buildJdVacancyUtmUrl(jd);

  return [
    "Kia ora,",
    "",
    `The job application for the ${location} ${jobTitle} role is now live on the website.`,
    "",
    "The link for Ed Gazette is",
    vacancyUrl,
  ].join("\n");
}

export function buildJdGenerateEmailHref(jd: Pick<JobDescriptionView, "jobTitle" | "locationDisplay" | "positionType" | "dateAdvertised">) {
  return `mailto:${JD_EMAIL_RECIPIENT}?subject=${encodeURIComponent(buildJdEmailSubject(jd))}&body=${encodeURIComponent(buildJdEmailText(jd))}`;
}
