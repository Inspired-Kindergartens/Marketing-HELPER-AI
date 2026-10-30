import { buildExtractionDateRange, buildWeeklyExtractionDateRange } from "../infocare/extraction.js";
import { createInfocareClient } from "../infocare/client.js";
import {
  infocareChildListCategorySchema,
  parseInfocareCentreListResponse,
  parseInfocareChildResponse,
  parseInfocareChildListResponse,
  parseInfocareContactListResponse,
  parseInfocareLicenseListResponse,
  type CentreReference,
  type InfocareChild,
  type InfocareChildListCategory,
  type InfocareContact,
  type InfocareLicense,
} from "../infocare/models.js";

type InfocareClientLike = ReturnType<typeof createInfocareClient>;

type LiveInfocareIntent =
  | { kind: "centre_list" }
  | { kind: "centre_overview"; centre: CentreReference }
  | { kind: "child_list"; centre: CentreReference; category: InfocareChildListCategory; emailOnly: boolean }
  | { kind: "license"; centre: CentreReference };

export type LiveInfocareResult =
  | { kind: "centre_list"; centres: CentreReference[]; generatedAt: string }
  | { kind: "centre_overview"; centre: CentreReference; current: InfocareChild[]; waiting: InfocareChild[]; notStarted: InfocareChild[]; licenses: InfocareLicense[]; generatedAt: string }
  | { kind: "child_list"; centre: CentreReference; category: InfocareChildListCategory; children: InfocareChild[]; contactsByChildKey: Record<number, InfocareContact[]>; emailOnly: boolean; contactLookups: number; contactFailures: number; detailLookups: number; detailFailures: number; generatedAt: string }
  | { kind: "license"; centre: CentreReference; licenses: InfocareLicense[]; generatedAt: string };

const EMAIL_PATTERN = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;
const EMAIL_SCAN_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_KEY_PATTERN = /(phone|mobile|cell|telephone|contact_number)/i;
const MAX_LIST_ROWS = 80;
const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;
const DAYS_PER_YEAR = 365;
const MAX_CHILD_DETAIL_LOOKUPS = 150;
const CHILD_DETAIL_LOOKUP_DELAY_MS = 125;
const MAX_CONTACT_LOOKUPS = 180;
const CONTACT_LOOKUP_DELAY_MS = 125;
const RECENT_LEFT_LOOKBACK_DAYS = 90;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/kindergarten/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Centre names carry suffixes the user never types ("and Whanau Centre",
// "All Day"), so matching on the whole name misses prompts that do name the
// centre. Match on the distinctive leading words instead, and keep the longest
// match so "Papamoa Coast" wins over "Papamoa".
const CENTRE_NAME_NOISE_WORDS = new Set([
  "and",
  "the",
  "centre",
  "center",
  "all",
  "day",
  "whanau",
  "oscar",
  "early",
  "years",
  "service",
]);

function centreNameTokens(name: string) {
  return normalizeSearchText(name).split(" ").filter(Boolean);
}

function centreMatchPhrases(name: string) {
  const tokens = centreNameTokens(name);

  if (tokens.length === 0) {
    return [];
  }

  const distinctive = tokens.filter((token) => !CENTRE_NAME_NOISE_WORDS.has(token));
  const core = distinctive.length > 0 ? distinctive : tokens;
  const phrases: string[] = [tokens.join(" ")];

  // Longest-to-shortest prefixes of the distinctive words, so a multi-word
  // centre still matches when the user types only its leading name.
  for (let length = core.length; length >= 1; length -= 1) {
    phrases.push(core.slice(0, length).join(" "));
  }

  return uniqueValues(phrases).sort((a, b) => b.length - a.length);
}

function matchCentreInPrompt(normalizedPrompt: string, name: string) {
  const paddedPrompt = ` ${normalizedPrompt} `;

  for (const phrase of centreMatchPhrases(name)) {
    if (phrase.length > 0 && paddedPrompt.includes(` ${phrase} `)) {
      return phrase.length;
    }
  }

  return 0;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildChildListDateRange(category: InfocareChildListCategory, now: Date) {
  if (category !== "Left") {
    return buildExtractionDateRange(now);
  }

  const start = new Date(now);
  start.setDate(start.getDate() - RECENT_LEFT_LOOKBACK_DAYS);

  return {
    startDate: toIsoDateOnly(start),
    endDate: toIsoDateOnly(now),
  };
}

function extractEmailsFromValue(value: unknown): string[] {
  if (typeof value === "string") {
    const direct = value.trim();

    if (EMAIL_PATTERN.test(direct)) {
      return [direct.toLowerCase()];
    }

    return (direct.match(EMAIL_SCAN_PATTERN) ?? []).map((email) => email.toLowerCase());
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractEmailsFromValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(extractEmailsFromValue);
  }

  return [];
}

function extractPhonesFromValue(value: unknown, key = ""): string[] {
  if (typeof value === "string") {
    return PHONE_KEY_PATTERN.test(key) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPhonesFromValue(entry, key));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) =>
      extractPhonesFromValue(childValue, childKey),
    );
  }

  return [];
}

function extractChildEmails(child: InfocareChild) {
  return uniqueValues(extractEmailsFromValue(child));
}

function extractChildPhones(child: InfocareChild) {
  return uniqueValues(extractPhonesFromValue(child));
}

function extractContactEmails(contact: InfocareContact) {
  return uniqueValues(extractEmailsFromValue(contact));
}

function extractContactPhones(contact: InfocareContact) {
  return uniqueValues([
    contact.mobile ?? "",
    contact.daytime_telephone ?? "",
    contact.evening_telephone ?? "",
    ...extractPhonesFromValue(contact),
  ]);
}

function getChildName(child: InfocareChild) {
  return uniqueValues([child.first_name ?? "", child.last_name ?? ""]).join(" ");
}

function getContactName(contact: InfocareContact) {
  return uniqueValues([contact.first_name ?? "", contact.last_name ?? ""]).join(" ");
}

function getChildField(child: InfocareChild, field: string) {
  const value = (child as Record<string, unknown>)[field];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getWaitlistAgeDate(child: InfocareChild) {
  return getChildField(child, "application_date") ?? child.starting_date ?? null;
}

function getWaitlistAgeDays(child: InfocareChild, now: Date) {
  const ageDate = getWaitlistAgeDate(child);

  if (!ageDate) {
    return null;
  }

  const parsed = new Date(ageDate);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const days = Math.floor((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000));

  return Math.max(0, days);
}

export function resolveWaitAgeThresholdDays(prompt: string) {
  const match = prompt.match(
    /\b(?:over|more than|longer than|older than|above|greater than|at least|past|beyond|exceeding|\+)\s*(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i,
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();

  if (unit.startsWith("day")) {
    return { days: amount, label: `${amount} day${amount === 1 ? "" : "s"}` };
  }

  if (unit.startsWith("week")) {
    return { days: amount * DAYS_PER_WEEK, label: `${amount} week${amount === 1 ? "" : "s"}` };
  }

  if (unit.startsWith("month")) {
    return { days: amount * DAYS_PER_MONTH, label: `${amount} month${amount === 1 ? "" : "s"}` };
  }

  return { days: amount * DAYS_PER_YEAR, label: `${amount} year${amount === 1 ? "" : "s"}` };
}

export function summariseWaitlistAges(children: InfocareChild[], thresholdDays: number, now: Date) {
  const dated = children
    .map((child) => ({ child, days: getWaitlistAgeDays(child, now) }))
    .filter((row): row is { child: InfocareChild; days: number } => row.days !== null);
  const overThreshold = dated.filter((row) => row.days >= thresholdDays);

  return {
    totalCount: children.length,
    datedCount: dated.length,
    undatedCount: children.length - dated.length,
    overThresholdCount: overThreshold.length,
    overThreshold: [...overThreshold].sort((left, right) => right.days - left.days),
  };
}

function extractRequestedChildFirstNames(prompt: string) {
  const names = [
    ...[...prompt.matchAll(/\bchild(?:'s)?\s+first\s+name\s+(?:of\s+|is\s+|=|:)?["']?([A-Za-z][A-Za-z'-]*)["']?/gi)]
      .map((match) => match[1]),
    ...[...prompt.matchAll(/\bfirst\s+name\s+(?:of\s+|is\s+|=|:)?["']([A-Za-z][A-Za-z'-]*)["']/gi)]
      .map((match) => match[1]),
  ];

  return uniqueValues(names.map((name) => name.toLowerCase()));
}

function isEmailRequest(prompt: string) {
  return /\b(email|emails|e-mail|outlook|to field|recipient|recipients)\b/i.test(prompt);
}

function isContactRequest(prompt: string) {
  return /\b(contact|contacts|phone|mobile|cell|email|emails|outlook|parent|parents|caregiver|caregivers|primary caregiver|whanau|family|families)\b/i.test(prompt);
}

function isPrimaryCaregiverRequest(prompt: string) {
  return /\bprimary\s+caregiver|primary\s+caregivers\b/i.test(prompt);
}

function shouldDefaultContactRequestToCurrentEnrolments(prompt: string) {
  return isContactRequest(prompt) &&
    /\b(list|give|show|pull|get|send|export|emails?|e-mail|mobile|phone|contacts?|caregivers?|parents?|whanau|families)\b/i.test(prompt);
}

function resolveCategory(prompt: string): InfocareChildListCategory | null {
  const normalized = prompt.toLowerCase();

  if (/\bwait\s*list|waitlist|waiting list\b/.test(normalized)) {
    return "Waiting list";
  }

  if (/\bnot started|future enrol|starting soon|upcoming children|new starters\b/.test(normalized)) {
    return "Not started";
  }

  if (/\bleft|leavers|children who left|past enrol|unenrol|unenrolled|recently unenrolled|no longer enrolled/i.test(normalized)) {
    return "Left";
  }

  if (/\bcurrent enrol|currently enrolled|current roll|roll|enrolled children|children attending\b/.test(normalized)) {
    return "Current enrolments";
  }

  if (shouldDefaultContactRequestToCurrentEnrolments(prompt)) {
    return "Current enrolments";
  }

  return null;
}

function isCentreListPrompt(prompt: string) {
  return /\b(centre|centres|kindergarten|kindergartens)\b/i.test(prompt) &&
    /\b(list|all|open centres|open kindergartens)\b/i.test(prompt) &&
    !/\b(wait\s*list|waitlist|enrol|roll|license|licence|capacity|contact|email)\b/i.test(prompt);
}

function isLicensePrompt(prompt: string) {
  return /\b(license|licence|capacity|max children|max u2|max o2|under 2 capacity|over 2 capacity)\b/i.test(prompt);
}

export function isLiveInfocarePrompt(prompt: string) {
  return (
    /\binfor?care\b/i.test(prompt) ||
    isCentreListPrompt(prompt) ||
    isLicensePrompt(prompt) ||
    resolveCategory(prompt) !== null ||
    (/\b(child|children|parent|parents|caregiver|caregivers|primary caregiver|whanau|family|families|kindergarten)\b/i.test(prompt) &&
      /\b(check|find|search|look|lookup|has|have|email|emails|left|unenrol|unenrolled|enrol|enrolled|caregiver|contact)\b/i.test(prompt)) ||
    (/\b(live|latest|fresh|api|connect|pull|get|show)\b/i.test(prompt) &&
      /\b(centre|kindergarten|wait\s*list|waitlist|enrol|roll|children|parent|caregiver|whanau|capacity|contact|email)\b/i.test(prompt))
  );
}

// A reply of just the centre name ("Papamoa Coast") does not look like a live
// request on its own, so the pending question would otherwise be dropped. When
// the previous turn asked which centre, stitch that earlier request together
// with this answer so the lookup still runs.
const CENTRE_CLARIFY_MARKERS = [
  "found multiple matching centres",
  "could not identify the centre",
  "please name one centre",
  "which one they mean",
  "which papamoa",
  "confirm the centre",
  "confirm the full centre name",
  "please confirm",
];

export function resolvePendingLiveInfocarePrompt(
  prompt: string,
  history: readonly { role: string; content: string }[] | undefined,
) {
  if (isLiveInfocarePrompt(prompt)) {
    return null;
  }

  const rows = (Array.isArray(history) ? history : [])
    .filter((row) => (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
    .map((row) => ({ role: row.role, content: row.content.trim() }))
    .filter((row) => row.content.length > 0);

  // The current prompt may or may not already be persisted in history.
  const trailing = rows.length > 0 && rows[rows.length - 1].role === "user" &&
    rows[rows.length - 1].content === prompt.trim()
    ? rows.slice(0, -1)
    : rows;
  const lastAssistant = [...trailing].reverse().find((row) => row.role === "assistant");

  if (!lastAssistant) {
    return null;
  }

  const askedForCentre = CENTRE_CLARIFY_MARKERS.some((marker) =>
    lastAssistant.content.toLowerCase().includes(marker),
  );

  if (!askedForCentre) {
    return null;
  }

  const priorRequest = [...trailing].reverse().find(
    (row) => row.role === "user" && isLiveInfocarePrompt(row.content),
  );

  if (!priorRequest) {
    return null;
  }

  // The earlier turn carries the intent; this turn carries the centre.
  return `${priorRequest.content} ${prompt}`.trim();
}

export function resolveLiveInfocareCentre(
  prompt: string,
  centres: readonly CentreReference[],
  selectedCentreKey?: number | null,
) {
  const openCentres = centres.filter((centre) => !centre.ignored && centre.openStatus === "Open");
  const selectedCentre =
    selectedCentreKey == null
      ? null
      : openCentres.find((centre) => centre.centreKey === selectedCentreKey) ?? null;
  const normalizedPrompt = normalizeSearchText(prompt);
  const scored = openCentres
    .map((centre) => ({ centre, score: matchCentreInPrompt(normalizedPrompt, centre.name) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    // The longest phrase wins, so "Papamoa Coast" beats "Papamoa". Only a
    // genuine tie is ambiguous.
    const best = scored[0];
    const tied = scored.filter((entry) => entry.score === best.score);

    if (tied.length === 1) {
      return { centre: best.centre, reason: null };
    }

    return {
      centre: null,
      reason: `I found multiple matching centres: ${tied.map((entry) => entry.centre.name).join(", ")}. Please name one centre.`,
    };
  }

  if (selectedCentre) {
    return { centre: selectedCentre, reason: null };
  }

  return {
    centre: null,
    reason: "I could not identify the centre. Please include the centre name, for example Arataki Kindergarten.",
  };
}

export function planLiveInfocareRequest(
  prompt: string,
  centres: readonly CentreReference[],
  selectedCentreKey?: number | null,
): { intent: LiveInfocareIntent | null; error: string | null } {
  if (!isLiveInfocarePrompt(prompt)) {
    return { intent: null, error: null };
  }

  if (isCentreListPrompt(prompt)) {
    return { intent: { kind: "centre_list" }, error: null };
  }

  const centreResolution = resolveLiveInfocareCentre(prompt, centres, selectedCentreKey);

  if (!centreResolution.centre) {
    return { intent: null, error: centreResolution.reason };
  }

  if (isLicensePrompt(prompt)) {
    return { intent: { kind: "license", centre: centreResolution.centre }, error: null };
  }

  const category = resolveCategory(prompt);

  if (category) {
    const parsedCategory = infocareChildListCategorySchema.parse(category);

    return {
      intent: {
        kind: "child_list",
        centre: centreResolution.centre,
        category: parsedCategory,
        emailOnly: isEmailRequest(prompt) || isContactRequest(prompt),
      },
      error: null,
    };
  }

  return { intent: { kind: "centre_overview", centre: centreResolution.centre }, error: null };
}

async function fetchChildList(
  client: InfocareClientLike,
  centre: CentreReference,
  category: InfocareChildListCategory,
  now: Date,
) {
  const dateRange = buildChildListDateRange(category, now);
  const response = await client.request("get_child_list", {
    centre_key: centre.centreKey,
    category,
    start_date: dateRange.startDate,
    end_date: dateRange.endDate,
  });
  const parsed = parseInfocareChildListResponse(response);

  return parsed.child_list;
}

async function fetchChildDetail(client: InfocareClientLike, childKey: number) {
  const response = await client.request("get_child", {
    child_key: childKey,
  });
  const parsed = parseInfocareChildResponse(response);

  return parsed.child;
}

async function fetchContactList(client: InfocareClientLike, childKey: number) {
  const response = await client.request("get_contact_list", {
    child_key: childKey,
  });
  const parsed = parseInfocareContactListResponse(response);

  return parsed.contact_list;
}

async function fetchContactListsForChildren(
  client: InfocareClientLike,
  children: InfocareChild[],
) {
  const contactsByChildKey: Record<number, InfocareContact[]> = {};
  let contactFailures = 0;
  const lookupChildren = children.slice(0, MAX_CONTACT_LOOKUPS);

  for (const [index, child] of lookupChildren.entries()) {
    if (index > 0) {
      await sleep(CONTACT_LOOKUP_DELAY_MS);
    }

    try {
      contactsByChildKey[child.child_key] = await fetchContactList(client, child.child_key);
    } catch {
      contactFailures += 1;
      contactsByChildKey[child.child_key] = [];
    }
  }

  return {
    contactsByChildKey,
    contactLookups: lookupChildren.length,
    contactFailures,
  };
}

async function fetchChildDetailsForContactRequest(
  client: InfocareClientLike,
  children: InfocareChild[],
) {
  const detailedChildren: InfocareChild[] = [];
  let detailFailures = 0;
  const lookupChildren = children.slice(0, MAX_CHILD_DETAIL_LOOKUPS);

  for (const [index, child] of lookupChildren.entries()) {
    if (index > 0) {
      await sleep(CHILD_DETAIL_LOOKUP_DELAY_MS);
    }

    try {
      detailedChildren.push(await fetchChildDetail(client, child.child_key));
    } catch {
      detailFailures += 1;
      detailedChildren.push(child);
    }
  }

  return {
    children: [
      ...detailedChildren,
      ...children.slice(MAX_CHILD_DETAIL_LOOKUPS),
    ],
    detailLookups: lookupChildren.length,
    detailFailures,
  };
}

async function fetchLicenseList(client: InfocareClientLike, centre: CentreReference) {
  // A week-wide range guarantees at least one open weekday; a single date can
  // land on a weekend/closure where every capacity reads 0.
  const dateRange = buildWeeklyExtractionDateRange();
  const response = await client.request("get_license_list", {
    centre_key: centre.centreKey,
    start_date: dateRange.startDate,
    end_date: dateRange.endDate,
  });
  const parsed = parseInfocareLicenseListResponse(response);

  return parsed.license_list;
}

export async function runLiveInfocareRequest(
  intent: LiveInfocareIntent,
  options: { client?: InfocareClientLike; now?: Date } = {},
): Promise<LiveInfocareResult> {
  const client = options.client ?? createInfocareClient();
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();

  if (intent.kind === "centre_list") {
    const response = await client.request("get_centre_list", {});
    const parsed = parseInfocareCentreListResponse(response);

    return {
      kind: "centre_list",
      centres: parsed.centre_list.map((centre) => ({
        centreKey: centre.centre_key,
        name: centre.name.trim(),
        openStatus: centre.open_status.trim(),
        licenseNumber: centre.license_number,
        regionName: centre.region_name?.trim() || undefined,
        areaName: centre.area_name?.trim() || undefined,
        subgroupName: centre.subgroup_name?.trim() || undefined,
        ignored: false,
        lastSyncedAt: generatedAt,
      })),
      generatedAt,
    };
  }

  if (intent.kind === "license") {
    return {
      kind: "license",
      centre: intent.centre,
      licenses: await fetchLicenseList(client, intent.centre),
      generatedAt,
    };
  }

  if (intent.kind === "child_list") {
    const children = await fetchChildList(client, intent.centre, intent.category, now);
    const needsContacts = intent.emailOnly;
    const contactResult = needsContacts
      ? await fetchContactListsForChildren(client, children)
      : { contactsByChildKey: {}, contactLookups: 0, contactFailures: 0 };
    const needsDetails =
      !needsContacts && children.every((child) => extractChildEmails(child).length === 0);
    const detailResult = needsDetails
      ? await fetchChildDetailsForContactRequest(client, children)
      : { children, detailLookups: 0, detailFailures: 0 };

    return {
      kind: "child_list",
      centre: intent.centre,
      category: intent.category,
      children: detailResult.children,
      contactsByChildKey: contactResult.contactsByChildKey,
      emailOnly: intent.emailOnly,
      contactLookups: contactResult.contactLookups,
      contactFailures: contactResult.contactFailures,
      detailLookups: detailResult.detailLookups,
      detailFailures: detailResult.detailFailures,
      generatedAt,
    };
  }

  const current = await fetchChildList(client, intent.centre, "Current enrolments", now);
  const waiting = await fetchChildList(client, intent.centre, "Waiting list", now);
  const notStarted = await fetchChildList(client, intent.centre, "Not started", now);
  const licenses = await fetchLicenseList(client, intent.centre);

  return {
    kind: "centre_overview",
    centre: intent.centre,
    current,
    waiting,
    notStarted,
    licenses,
    generatedAt,
  };
}

// Infocare returns one licence row per day, and closed days read 0. The
// centre's licensed capacity is the largest of those, not the first row.
function selectPrimaryLicense(licenses: readonly InfocareLicense[]) {
  return licenses.reduce<InfocareLicense | undefined>(
    (best, license) => (license.max_children > (best?.max_children ?? 0) ? license : best),
    undefined,
  );
}

function formatLicense(license: InfocareLicense) {
  return [
    `max ${license.max_children}`,
    license.max_u2 != null ? `U2 ${license.max_u2}` : null,
    license.max_o2 != null ? `O2 ${license.max_o2}` : null,
    license.license_number != null ? `licence ${license.license_number}` : null,
  ].filter(Boolean).join(", ");
}

function formatChildRow(child: InfocareChild, includeContacts: boolean) {
  const name = getChildName(child) || `Child ${child.child_key}`;
  const dates = [
    child.birth_date ? `birth ${child.birth_date}` : null,
    child.starting_date ? `start ${child.starting_date}` : null,
    child.leaving_date ? `leaving ${child.leaving_date}` : null,
    getChildField(child, "application_date") ? `application ${getChildField(child, "application_date")}` : null,
  ].filter(Boolean);
  const contacts = includeContacts
    ? [
        ...extractChildEmails(child),
        ...extractChildPhones(child),
      ]
    : [];
  const meta = [...dates, ...contacts].join("; ");

  return `- ${name}${meta ? ` (${meta})` : ""}`;
}

function formatRequestedMatchAnswer(result: Extract<LiveInfocareResult, { kind: "child_list" }>, prompt: string) {
  const requestedEmails = uniqueValues((prompt.match(EMAIL_SCAN_PATTERN) ?? []).map((email) => email.toLowerCase()));
  const requestedFirstNames = extractRequestedChildFirstNames(prompt);

  if (requestedEmails.length === 0 && requestedFirstNames.length === 0) {
    return null;
  }

  const matches: string[] = [];
  const matchedEmails = new Set<string>();
  const matchedFirstNames = new Set<string>();

  for (const child of result.children) {
    const childName = getChildName(child) || `Child ${child.child_key}`;
    const childFirstName = (child.first_name ?? "").trim().toLowerCase();
    const childEmails = extractChildEmails(child);
    const contacts = result.contactsByChildKey[child.child_key] ?? [];
    const contactEmailRows = contacts.flatMap((contact) =>
      extractContactEmails(contact).map((email) => ({ email, contact })),
    );
    const emailMatches = requestedEmails.filter((email) =>
      childEmails.includes(email) || contactEmailRows.some((row) => row.email === email),
    );
    const firstNameMatches = requestedFirstNames.filter((name) => childFirstName === name);

    if (emailMatches.length === 0 && firstNameMatches.length === 0) {
      continue;
    }

    emailMatches.forEach((email) => matchedEmails.add(email));
    firstNameMatches.forEach((name) => matchedFirstNames.add(name));

    const contactDescriptions = emailMatches.flatMap((email) =>
      contactEmailRows
        .filter((row) => row.email === email)
        .map((row) => {
          const relationship = row.contact.relationship ? `, ${row.contact.relationship}` : "";
          const primary = row.contact.primary_caregiver ? ", primary caregiver" : "";

          return `${email} (${getContactName(row.contact) || "contact"}${relationship}${primary})`;
        }),
    );
    const directChildEmailDescriptions = emailMatches
      .filter((email) => childEmails.includes(email))
      .map((email) => `${email} (child record)`);
    const dates = [
      child.leaving_date ? `leaving ${child.leaving_date}` : null,
      child.starting_date ? `start ${child.starting_date}` : null,
    ].filter(Boolean);
    const reasons = [
      ...firstNameMatches.map((name) => `child first name "${name}"`),
      ...directChildEmailDescriptions,
      ...contactDescriptions,
    ];

    matches.push(`- ${childName}${dates.length > 0 ? ` (${dates.join("; ")})` : ""}: ${reasons.join("; ")}`);
  }

  const checked = `I checked Infocare ${result.category.toLowerCase()} records for ${result.centre.name}.`;
  const requestSummary = [
    requestedEmails.length > 0 ? `email${requestedEmails.length === 1 ? "" : "s"} ${requestedEmails.join(", ")}` : null,
    requestedFirstNames.length > 0 ? `child first name${requestedFirstNames.length === 1 ? "" : "s"} ${requestedFirstNames.map((name) => `"${name}"`).join(", ")}` : null,
  ].filter(Boolean).join(" or ");
  const noMatches = [
    ...requestedEmails.filter((email) => !matchedEmails.has(email)),
    ...requestedFirstNames.filter((name) => !matchedFirstNames.has(name)).map((name) => `child first name "${name}"`),
  ];

  if (matches.length === 0) {
    return [
      checked,
      `No matching ${requestSummary} was found in the returned ${result.category.toLowerCase()} records.`,
      `Checked ${result.children.length} child record${result.children.length === 1 ? "" : "s"} and ${result.contactLookups} contact list${result.contactLookups === 1 ? "" : "s"}.`,
      "No Infocare records were changed.",
    ].join("\n\n");
  }

  return [
    checked,
    `Found ${matches.length} matching ${result.category.toLowerCase()} record${matches.length === 1 ? "" : "s"} for ${requestSummary}:`,
    matches.join("\n"),
    noMatches.length > 0 ? `No match found for: ${noMatches.join(", ")}.` : "",
    `Checked ${result.children.length} child record${result.children.length === 1 ? "" : "s"} and ${result.contactLookups} contact list${result.contactLookups === 1 ? "" : "s"}.`,
    "No Infocare records were changed.",
  ].filter(Boolean).join("\n\n");
}

function formatEmailList(result: Extract<LiveInfocareResult, { kind: "child_list" }>, prompt: string) {
  const requestedMatchAnswer = formatRequestedMatchAnswer(result, prompt);

  if (requestedMatchAnswer) {
    return requestedMatchAnswer;
  }

  const primaryCaregiversOnly = isPrimaryCaregiverRequest(prompt);
  const rows = result.children.map((child) => ({
    childName: getChildName(child),
    emails: uniqueValues(primaryCaregiversOnly
      ? (result.contactsByChildKey[child.child_key] ?? [])
          .filter((contact) => contact.primary_caregiver)
          .flatMap(extractContactEmails)
      : [
          ...extractChildEmails(child),
          ...(result.contactsByChildKey[child.child_key] ?? []).flatMap(extractContactEmails),
        ]),
    phones: uniqueValues(primaryCaregiversOnly
      ? (result.contactsByChildKey[child.child_key] ?? [])
          .filter((contact) => contact.primary_caregiver)
          .flatMap(extractContactPhones)
      : [
          ...extractChildPhones(child),
          ...(result.contactsByChildKey[child.child_key] ?? []).flatMap(extractContactPhones),
        ]),
    contacts: primaryCaregiversOnly
      ? (result.contactsByChildKey[child.child_key] ?? []).filter((contact) => contact.primary_caregiver)
      : result.contactsByChildKey[child.child_key] ?? [],
  }));
  const emails = uniqueValues(rows.flatMap((row) => row.emails));
  const phoneFallbackRows = rows.filter((row) => row.emails.length === 0 && row.phones.length > 0);

  if (emails.length === 0) {
    const detailText =
      result.contactLookups > 0
        ? ` I also checked ${result.contactLookups} contact list${result.contactLookups === 1 ? "" : "s"} using read-only Infocare contact lookups.`
        : result.detailLookups > 0
          ? ` I also checked ${result.detailLookups} detailed child record${result.detailLookups === 1 ? "" : "s"} using read-only Infocare child lookups.`
        : "";

    return [
      `I checked Infocare ${result.category.toLowerCase()} records for ${result.centre.name}.`,
      `There are ${result.children.length} record${result.children.length === 1 ? "" : "s"}, but I could not find any email addresses in the returned records.${detailText}`,
      "No Infocare records were changed.",
    ].join("\n\n");
  }

  return [
    `Infocare ${result.category.toLowerCase()} ${primaryCaregiversOnly ? "primary caregiver " : ""}emails for ${result.centre.name} (${emails.length} unique):`,
    "",
    emails.join("; "),
    "",
    phoneFallbackRows.length > 0
      ? [
          "Missing email - phone instead:",
          phoneFallbackRows
            .slice(0, MAX_LIST_ROWS)
            .map((row) => `- ${row.childName || "Infocare record"}: ${row.phones.join("; ")}`)
            .join("\n"),
          "",
        ].join("\n")
      : "",
    "Matched records:",
    rows
      .filter((row) => row.emails.length > 0)
      .map((row) => {
        const contactNames = row.contacts
          .filter((contact) => extractContactEmails(contact).length > 0)
          .map((contact) => {
            const relationship = contact.relationship ? `, ${contact.relationship}` : "";

            return `${getContactName(contact) || "contact"}${relationship}`;
          });

        return `- ${row.childName || "Infocare record"}: ${row.emails.join("; ")}${contactNames.length > 0 ? ` (${contactNames.join("; ")})` : ""}`;
      })
      .slice(0, MAX_LIST_ROWS)
      .join("\n"),
    "",
    result.contactLookups > 0
      ? `Checked ${result.contactLookups} contact list${result.contactLookups === 1 ? "" : "s"} from Infocare before preparing this list.${result.contactFailures > 0 ? ` ${result.contactFailures} contact lookup${result.contactFailures === 1 ? "" : "s"} failed.` : ""}`
      : result.detailLookups > 0
        ? `Checked ${result.detailLookups} detailed child record${result.detailLookups === 1 ? "" : "s"} from Infocare before preparing this list.${result.detailFailures > 0 ? ` ${result.detailFailures} detail lookup${result.detailFailures === 1 ? "" : "s"} failed and were skipped back to list data.` : ""}`
      : "",
    "",
    "No Infocare records were changed.",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}

export function formatLiveInfocareAnswer(result: LiveInfocareResult, prompt = "") {
  if (result.kind === "centre_list") {
    const openCentres = result.centres.filter((centre) => centre.openStatus === "Open");

    return [
      `Live Infocare centre list: ${openCentres.length} open centre${openCentres.length === 1 ? "" : "s"}.`,
      openCentres.slice(0, MAX_LIST_ROWS).map((centre) => `- ${centre.name} (${centre.centreKey})`).join("\n"),
      "No Infocare records were changed.",
    ].join("\n\n");
  }

  if (result.kind === "license") {
    return [
      `Live Infocare licence/capacity for ${result.centre.name}:`,
      result.licenses.length > 0
        ? [...new Set(result.licenses.map((license) => formatLicense(license)))]
            .map((line) => `- ${line}`)
            .join("\n")
        : "- No licence rows were returned.",
      "No Infocare records were changed.",
    ].join("\n\n");
  }

  if (result.kind === "child_list") {
    if (result.emailOnly) {
      return formatEmailList(result, prompt);
    }

    const includeContacts = isContactRequest(prompt);
    const waitAgeThreshold =
      result.category === "Waiting list" ? resolveWaitAgeThresholdDays(prompt) : null;

    if (waitAgeThreshold) {
      const summary = summariseWaitlistAges(
        result.children,
        waitAgeThreshold.days,
        new Date(result.generatedAt),
      );

      return [
        `${summary.overThresholdCount} of ${summary.totalCount} waiting list record${summary.totalCount === 1 ? "" : "s"} for ${result.centre.name} have been waiting over ${waitAgeThreshold.label} (${waitAgeThreshold.days}+ days).`,
        summary.overThreshold.length > 0
          ? summary.overThreshold
              .map(({ child, days }) => {
                const name = getChildName(child) || `Child ${child.child_key}`;
                const ageDate = getWaitlistAgeDate(child);

                return `- ${name} (${ageDate ? `since ${ageDate}; ` : ""}${days} days)`;
              })
              .join("\n")
          : "- No records met that wait length.",
        summary.undatedCount > 0
          ? `${summary.undatedCount} record${summary.undatedCount === 1 ? "" : "s"} had no usable application or start date and could not be aged. The count above covers the ${summary.datedCount} dated record${summary.datedCount === 1 ? "" : "s"}.`
          : "",
        "No Infocare records were changed.",
      ].filter(Boolean).join("\n\n");
    }

    const isWaitingList = result.category === "Waiting list";
    const rows = (isWaitingList ? result.children : result.children.slice(0, MAX_LIST_ROWS))
      .map((child) => formatChildRow(child, includeContacts));
    const limitNote =
      !isWaitingList && result.children.length > MAX_LIST_ROWS
        ? `\nShowing first ${MAX_LIST_ROWS} of ${result.children.length} records.`
        : "";

    return [
      `Infocare ${result.category.toLowerCase()} records for ${result.centre.name}: ${result.children.length} record${result.children.length === 1 ? "" : "s"}.${limitNote}`,
      rows.length > 0 ? rows.join("\n") : "- No records were returned.",
      "No Infocare records were changed.",
    ].join("\n\n");
  }

  const primaryLicense = selectPrimaryLicense(result.licenses);

  return [
    `Live Infocare overview for ${result.centre.name}:`,
    [
      `- Current enrolments: ${result.current.length}`,
      `- Waiting list: ${result.waiting.length}`,
      `- Not started: ${result.notStarted.length}`,
      `- Licence/capacity: ${primaryLicense ? formatLicense(primaryLicense) : "not returned"}`,
    ].join("\n"),
    "Ask for a specific live list, contacts, emails, waitlist, current enrolments, not-started children, or capacity to pull the matching Infocare slice.",
    "No Infocare records were changed.",
  ].join("\n\n");
}

function formatChildGroundingRow(child: InfocareChild) {
  return {
    childKey: child.child_key,
    firstName: child.first_name ?? null,
    lastName: child.last_name ?? null,
    fullName: getChildName(child) || null,
    birthDate: child.birth_date ?? null,
    startingDate: child.starting_date ?? null,
    leavingDate: child.leaving_date ?? null,
    applicationDate: getChildField(child, "application_date"),
  };
}

function formatContactGroundingRow(contact: InfocareContact) {
  return {
    contactKey: contact.contact_key,
    firstName: contact.first_name ?? null,
    lastName: contact.last_name ?? null,
    fullName: getContactName(contact) || null,
    relationship: contact.relationship ?? null,
    primaryCaregiver: contact.primary_caregiver ?? null,
    emergencyContact: contact.emergency_contact ?? null,
    collectionPermitted: contact.collection_permitted ?? null,
    emails: extractContactEmails(contact),
    phones: extractContactPhones(contact),
  };
}

// When the app cannot pin the prompt to a single centre, the request must still
// reach the model: it can reason about a partially-typed or ambiguous centre
// name far better than a regex can. This hands the model the reason and the
// list of real centres instead of terminating the turn with a canned string.
export function buildUnresolvedLiveInfocareGrounding(
  reason: string | null,
  centres: readonly CentreReference[],
) {
  const openCentres = centres.filter((centre) => !centre.ignored && centre.openStatus === "Open");

  return [
    "Live Infocare lookup note:",
    "This app DOES have live read-only access to Infocare. The only problem is that the prompt did not pin down exactly one centre, so the lookup has not run yet.",
    reason ? `Reason: ${reason}` : "Reason: the centre named in the prompt did not match a single known centre.",
    "Your entire reply must be one short clarifying question that names the closest candidate centres from the list below and asks the user which one they mean.",
    "Use conversation history and the centre list to interpret partial, shortened, or misspelled names.",
    "Tell the user you will run the live lookup as soon as they confirm the centre.",
    "Do NOT say you lack access to Infocare, that the data is unavailable, or that this information is not in the provided context.",
    "Do NOT tell the user to contact the kindergarten, visit a website, or check another system. The data is available here once the centre is confirmed.",
    openCentres.length > 0
      ? `Known open centres: ${openCentres.map((centre) => centre.name.replace(/\s+/g, " ").trim()).join(", ")}`
      : "No open centres are on record.",
  ].join("\n");
}

export function buildLiveInfocareGrounding(result: LiveInfocareResult, prompt: string) {
  const instructions = [
    "Live Infocare read-only grounding:",
    "The app has already performed the relevant read-only Infocare API lookup. Do not say you cannot access Infocare, external databases, school records, or email systems.",
    "Use this data as evidence, but answer through AI chat in plain language.",
    "Before finalising, verify that the response answers the user's exact request.",
    "Do not dump a list unless the user asked for a list.",
    "If the user asks whether a named child is recently unenrolled, search the Left records by first name, last name, and full name. Answer yes/no/unclear and cite the matching leaving/start date if present.",
    "If the user asks for caregiver, parent, whanau, primary-caregiver, contact, or email checks, search the child records and contact records in this grounding. Match email addresses case-insensitively.",
    "If no matching name is present in the retrieved records, say that no matching record was found in this Infocare slice; do not substitute current enrolments or unrelated child details.",
    `User prompt: ${prompt}`,
  ];

  if (result.kind === "child_list") {
    const waitAgeThreshold =
      result.category === "Waiting list" ? resolveWaitAgeThresholdDays(prompt) : null;
    const waitAgeSummary = waitAgeThreshold
      ? summariseWaitlistAges(result.children, waitAgeThreshold.days, new Date(result.generatedAt))
      : null;

    return [
      ...instructions,
      ...(waitAgeSummary
        ? [
            `The app has already counted wait ages across all ${waitAgeSummary.totalCount} records. Report ${waitAgeSummary.overThresholdCount} as the answer; do not recount from the record list, which may be truncated.`,
            waitAgeSummary.undatedCount > 0
              ? `${waitAgeSummary.undatedCount} record(s) have no usable date and are excluded from that count. Mention this exclusion.`
              : "",
          ].filter(Boolean)
        : []),
      JSON.stringify({
        kind: result.kind,
        centre: result.centre.name,
        centreKey: result.centre.centreKey,
        category: result.category,
        generatedAt: result.generatedAt,
        recordCount: result.children.length,
        ...(waitAgeSummary
          ? {
              waitAgeThresholdDays: waitAgeThreshold?.days,
              waitAgeThresholdLabel: waitAgeThreshold?.label,
              countOverThreshold: waitAgeSummary.overThresholdCount,
              datedRecordCount: waitAgeSummary.datedCount,
              undatedRecordCount: waitAgeSummary.undatedCount,
            }
          : {}),
        records: result.children.slice(0, MAX_LIST_ROWS).map((child) => ({
          ...formatChildGroundingRow(child),
          childEmails: extractChildEmails(child),
          childPhones: extractChildPhones(child),
          contacts: (result.contactsByChildKey[child.child_key] ?? []).map(formatContactGroundingRow),
        })),
        truncated: result.children.length > MAX_LIST_ROWS,
        contactLookups: result.contactLookups,
        contactFailures: result.contactFailures,
        detailLookups: result.detailLookups,
        detailFailures: result.detailFailures,
      }),
    ].join("\n");
  }

  if (result.kind === "centre_overview") {
    return [
      ...instructions,
      JSON.stringify({
        kind: result.kind,
        centre: result.centre.name,
        centreKey: result.centre.centreKey,
        generatedAt: result.generatedAt,
        currentCount: result.current.length,
        waitingCount: result.waiting.length,
        notStartedCount: result.notStarted.length,
        licenses: [...new Set(result.licenses.map(formatLicense))],
      }),
    ].join("\n");
  }

  if (result.kind === "license") {
    return [
      ...instructions,
      JSON.stringify({
        kind: result.kind,
        centre: result.centre.name,
        centreKey: result.centre.centreKey,
        generatedAt: result.generatedAt,
        licenses: [...new Set(result.licenses.map(formatLicense))],
      }),
    ].join("\n");
  }

  return [
    ...instructions,
    JSON.stringify({
      kind: result.kind,
      generatedAt: result.generatedAt,
      openCentres: result.centres
        .filter((centre) => centre.openStatus === "Open")
        .slice(0, MAX_LIST_ROWS)
        .map((centre) => ({ centreKey: centre.centreKey, name: centre.name })),
    }),
  ].join("\n");
}
