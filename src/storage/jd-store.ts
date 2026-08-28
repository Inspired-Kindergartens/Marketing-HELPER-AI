import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";
import { formatSalaryRange as formatSalaryRangePure, type PayScaleRow } from "./jd-pay-scale.js";
import { sanitizeJdBlurbHtml } from "./jd-sanitize-html.js";

// Prisma's nullable Json columns need the JsonNull sentinel instead of a bare
// `null` (a bare null would mean "don't change this field" on update).
function toJsonInput(value: object | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

// Centre names already end in "Kindergarten", so the old fallback
// (`${name.toUpperCase()} Kindergarten`) doubled the word and shouted the
// name. Collapse the repeat and keep the stored casing; display-side
// formatting lives in formatJdLocationDisplay (src/ui/jd/jd-email.ts).
function defaultLocationDisplay(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  return /\s*kindergarten$/i.test(cleaned) ? cleaned : `${cleaned} Kindergarten`;
}

// Job Descriptions: title/centre profiles drive defaults for a generated
// JobDescription, which is then editable independently (values are copied at
// creation, not referenced live). Mirrors the Tasks/Comms store conventions.

export type RoleSectionBullet = { text: string; boldLeadIn?: string };
export type RoleSection = { heading: string; intro?: string; bullets: RoleSectionBullet[] };
export type JdTitleExtras = {
  positionHours?: string;
  reportsTo?: string;
  remunerationText?: string;
  contractManagerName?: string;
  subjectLine?: string;
};

export type JdLayoutVariant = "standard" | "administrator" | "professional";

export type JdTitleProfileView = {
  id: number;
  jobTitle: string;
  sortOrder: number;
  jobCategory: string;
  payScaleKey: string | null;
  layoutVariant: JdLayoutVariant;
  defaultPositionType: string;
  agreementText: string;
  qualificationsText: string;
  roleSections: RoleSection[];
  extras: JdTitleExtras | null;
  // false for org-wide roles (e.g. office staff) not tied to a kindergarten.
  isCentreSpecific: boolean;
};

export type JdCentreProfileView = {
  centreKey: number;
  centreName: string;
  locationDisplay: string;
  introParagraph: string;
  seniorTeacherName: string;
  seniorTeacherAcronym: string;
  isEnviroschool: boolean;
};

export type JobDescriptionListItem = {
  id: number;
  jobTitle: string;
  locationDisplay: string;
  positionType: string;
  dateAdvertised: string | null;
  closingAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDescriptionView = JobDescriptionListItem & {
  centreKey: number | null;
  titleProfileId: number | null;
  fte: number | null;
  jobCategory: string;
  layoutVariant: JdLayoutVariant;
  agreementText: string;
  salaryRangeText: string;
  startDateText: string;
  qualificationsText: string;
  introParagraph: string;
  roleSections: RoleSection[];
  extras: JdTitleExtras | null;
  seniorTeacherName: string;
  blurbHtml: string | null;
  reviewedByAcronym: string;
  approvedByAcronym: string;
  lastUpdatedByAcronym: string;
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

const NZ_TIME_ZONE = "Pacific/Auckland";

function nzDateTimeParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: NZ_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  for (let i = 0; i < 3; i += 1) {
    const parts = nzDateTimeParts(utc);
    const actualAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = actualAsUtc - desiredAsUtc;
    if (diff === 0) break;
    utc = new Date(utc.getTime() - diff);
  }

  return utc;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(trimmed);
  const date = localMatch
    ? zonedDateTimeToUtc(
        Number(localMatch[1]),
        Number(localMatch[2]),
        Number(localMatch[3]),
        localMatch[4] ? Number(localMatch[4]) : 0,
        localMatch[5] ? Number(localMatch[5]) : 0,
      )
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function defaultClosingDate(advertisedDate: Date): Date {
  const advertised = nzDateTimeParts(advertisedDate);
  const localClosingDate = new Date(
    Date.UTC(Number(advertised.year), Number(advertised.month) - 1, Number(advertised.day) + 28),
  );
  const daysUntilFriday = (5 - localClosingDate.getUTCDay() + 7) % 7;
  localClosingDate.setUTCDate(localClosingDate.getUTCDate() + daysUntilFriday);

  return zonedDateTimeToUtc(
    localClosingDate.getUTCFullYear(),
    localClosingDate.getUTCMonth() + 1,
    localClosingDate.getUTCDate(),
    16,
    0,
  );
}

function resolveLayoutVariant(value: string): JdLayoutVariant {
  return value === "administrator" || value === "professional" ? value : "standard";
}

// --- Pay scale -------------------------------------------------------------

export async function getPayScaleRows(): Promise<PayScaleRow[]> {
  const rows = await prisma.jdPayScale.findMany({
    select: { scaleKey: true, step: true, effectiveFrom: true, annualRate: true },
  });
  return rows.map((row) => ({
    scaleKey: row.scaleKey,
    step: row.step,
    effectiveFrom: row.effectiveFrom,
    annualRate: Number(row.annualRate),
  }));
}

export async function formatSalaryRange(
  scaleKey: string,
  date: Date = new Date(),
  fte?: number | null,
): Promise<string | null> {
  const rows = await getPayScaleRows();
  return formatSalaryRangePure(rows, scaleKey, date, fte);
}

export type AgreementStatus = {
  latest: { name: string; effectiveFrom: string; expiresOn: string } | null;
  expired: boolean;
  expiringSoon: boolean; // within 90 days
  daysUntilExpiry: number | null;
};

export async function getAgreementStatus(now: Date = new Date()): Promise<AgreementStatus> {
  const latest = await prisma.jdAgreement.findFirst({ orderBy: { expiresOn: "desc" } });
  if (!latest) {
    return { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null };
  }
  const daysUntilExpiry = Math.round((latest.expiresOn.getTime() - now.getTime()) / 86400000);
  return {
    latest: {
      name: latest.name,
      effectiveFrom: latest.effectiveFrom.toISOString(),
      expiresOn: latest.expiresOn.toISOString(),
    },
    expired: daysUntilExpiry < 0,
    expiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 90,
    daysUntilExpiry,
  };
}

// --- Title profiles ----------------------------------------------------------

function toTitleProfileView(row: {
  id: number;
  jobTitle: string;
  sortOrder: number;
  jobCategory: string;
  payScaleKey: string | null;
  layoutVariant: string;
  defaultPositionType: string;
  agreementText: string;
  qualificationsText: string;
  roleSections: unknown;
  extras: unknown;
  isCentreSpecific: boolean;
}): JdTitleProfileView {
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    sortOrder: row.sortOrder,
    jobCategory: row.jobCategory,
    payScaleKey: row.payScaleKey,
    layoutVariant: resolveLayoutVariant(row.layoutVariant),
    defaultPositionType: row.defaultPositionType,
    agreementText: row.agreementText,
    qualificationsText: row.qualificationsText,
    roleSections: (row.roleSections as RoleSection[]) ?? [],
    extras: (row.extras as JdTitleExtras | null) ?? null,
    isCentreSpecific: row.isCentreSpecific,
  };
}

export async function listTitleProfiles(): Promise<JdTitleProfileView[]> {
  const rows = await prisma.jdTitleProfile.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toTitleProfileView);
}

export async function getTitleProfile(id: number): Promise<JdTitleProfileView | null> {
  const row = await prisma.jdTitleProfile.findUnique({ where: { id } });
  return row ? toTitleProfileView(row) : null;
}

export type JdTitleProfileInput = {
  jobTitle: string;
  sortOrder?: number;
  jobCategory: string;
  payScaleKey?: string | null;
  layoutVariant?: string;
  defaultPositionType?: string;
  agreementText?: string;
  qualificationsText: string;
  roleSections: RoleSection[];
  extras?: JdTitleExtras | null;
  // false for org-wide roles (e.g. office staff) with no kindergarten.
  isCentreSpecific?: boolean;
};

export async function upsertTitleProfile(input: JdTitleProfileInput): Promise<number> {
  const jobTitle = input.jobTitle.trim();
  if (!jobTitle) throw new Error("Job title is required");
  const data = {
    sortOrder: input.sortOrder ?? 0,
    jobCategory: input.jobCategory,
    payScaleKey: emptyToNull(input.payScaleKey),
    layoutVariant: resolveLayoutVariant(input.layoutVariant ?? "standard"),
    defaultPositionType: input.defaultPositionType ?? "Full Time",
    agreementText: input.agreementText ?? "Kindergarten Teachers Collective Agreement",
    qualificationsText: input.qualificationsText,
    roleSections: toJsonInput(input.roleSections as object),
    extras: toJsonInput(input.extras ?? null),
    isCentreSpecific: input.isCentreSpecific ?? true,
  };
  const row = await prisma.jdTitleProfile.upsert({
    where: { jobTitle },
    update: data,
    create: { jobTitle, ...data },
    select: { id: true },
  });
  return row.id;
}

// --- Centre profiles ---------------------------------------------------------

// Most centres have no saved JdCentreProfile yet, so Settings would show them
// as blank rows. Fall back to the earliest Job Description written for that
// centre, which is where the original website intro paragraph and the Senior
// Teacher were first captured. This only prefills the form for editing -
// nothing is written back until the user saves the row.
type CentreFallback = { introParagraph: string; seniorTeacherName: string; seniorTeacherAcronym: string };

async function listCentreFallbacks(centreKeys: number[]): Promise<Map<number, CentreFallback>> {
  if (centreKeys.length === 0) return new Map();

  const rows = await prisma.jobDescription.findMany({
    where: { centreKey: { in: centreKeys } },
    // Oldest first so the first JD written for a centre wins.
    orderBy: { createdAt: "asc" },
    select: {
      centreKey: true,
      introParagraph: true,
      seniorTeacherName: true,
      // A JD stores the centre's Senior Teacher acronym as reviewedByAcronym
      // (see createJobDescription, which copies it from the centre profile).
      reviewedByAcronym: true,
    },
  });

  const fallbacks = new Map<number, CentreFallback>();
  for (const row of rows) {
    if (row.centreKey == null) continue;
    const current = fallbacks.get(row.centreKey) ?? {
      introParagraph: "",
      seniorTeacherName: "",
      seniorTeacherAcronym: "",
    };
    // Keep the first non-empty value seen per field, so a later JD can supply
    // something the earliest one left blank.
    if (!current.introParagraph) current.introParagraph = row.introParagraph ?? "";
    if (!current.seniorTeacherName) current.seniorTeacherName = row.seniorTeacherName ?? "";
    if (!current.seniorTeacherAcronym) current.seniorTeacherAcronym = row.reviewedByAcronym ?? "";
    fallbacks.set(row.centreKey, current);
  }
  return fallbacks;
}

export async function listCentreProfiles(): Promise<JdCentreProfileView[]> {
  const rows = await prisma.centreReference.findMany({
    where: { openStatus: "Open", ignored: false },
    orderBy: { name: "asc" },
    select: { centreKey: true, name: true, jdCentreProfile: true },
  });
  const fallbacks = await listCentreFallbacks(rows.map((row) => row.centreKey));

  return rows.map((row) => {
    const fallback = fallbacks.get(row.centreKey);
    return {
      centreKey: row.centreKey,
      centreName: row.name,
      locationDisplay: row.jdCentreProfile?.locationDisplay ?? defaultLocationDisplay(row.name),
      introParagraph: row.jdCentreProfile?.introParagraph || fallback?.introParagraph || "",
      seniorTeacherName: row.jdCentreProfile?.seniorTeacherName || fallback?.seniorTeacherName || "",
      seniorTeacherAcronym: row.jdCentreProfile?.seniorTeacherAcronym || fallback?.seniorTeacherAcronym || "",
      isEnviroschool: row.jdCentreProfile?.isEnviroschool ?? false,
    };
  });
}

export async function getCentreProfile(centreKey: number): Promise<JdCentreProfileView | null> {
  const row = await prisma.centreReference.findUnique({
    where: { centreKey },
    select: { centreKey: true, name: true, jdCentreProfile: true },
  });
  if (!row) return null;
  return {
    centreKey: row.centreKey,
    centreName: row.name,
    locationDisplay: row.jdCentreProfile?.locationDisplay ?? defaultLocationDisplay(row.name),
    introParagraph: row.jdCentreProfile?.introParagraph ?? "",
    seniorTeacherName: row.jdCentreProfile?.seniorTeacherName ?? "",
    seniorTeacherAcronym: row.jdCentreProfile?.seniorTeacherAcronym ?? "",
    isEnviroschool: row.jdCentreProfile?.isEnviroschool ?? false,
  };
}

export type JdCentreProfileInput = {
  locationDisplay: string;
  introParagraph?: string | null;
  seniorTeacherName?: string | null;
  seniorTeacherAcronym?: string | null;
  isEnviroschool?: boolean;
};

export async function upsertCentreProfile(
  centreKey: number,
  input: JdCentreProfileInput,
): Promise<void> {
  const data = {
    locationDisplay: input.locationDisplay.trim(),
    introParagraph: input.introParagraph?.trim() ?? "",
    seniorTeacherName: input.seniorTeacherName?.trim() ?? "",
    seniorTeacherAcronym: input.seniorTeacherAcronym?.trim() ?? "",
    isEnviroschool: input.isEnviroschool ?? false,
  };
  await prisma.jdCentreProfile.upsert({
    where: { centreKey },
    update: data,
    create: { centreKey, ...data },
  });
}

// --- Global JD settings ------------------------------------------------------

// Settings that apply to every job description rather than a single centre or
// title. Stored as a single pinned row (id 1).
export type JdGlobalSettingsView = {
  lastReviewedByAcronym: string;
};

export async function getGlobalSettings(): Promise<JdGlobalSettingsView> {
  const row = await prisma.jdGlobalSetting.findUnique({ where: { id: 1 } });
  return { lastReviewedByAcronym: row?.lastReviewedByAcronym ?? "" };
}

export async function updateGlobalSettings(input: { lastReviewedByAcronym?: string | null }): Promise<void> {
  const lastReviewedByAcronym = input.lastReviewedByAcronym?.trim() ?? "";
  await prisma.jdGlobalSetting.upsert({
    where: { id: 1 },
    update: { lastReviewedByAcronym },
    create: { id: 1, lastReviewedByAcronym },
  });
}

// --- Job Descriptions --------------------------------------------------------

const JOB_DESCRIPTION_SELECT = {
  id: true,
  jobTitle: true,
  titleProfileId: true,
  centreKey: true,
  locationDisplay: true,
  positionType: true,
  fte: true,
  jobCategory: true,
  layoutVariant: true,
  agreementText: true,
  salaryRangeText: true,
  dateAdvertised: true,
  closingAt: true,
  startDateText: true,
  qualificationsText: true,
  introParagraph: true,
  roleSections: true,
  extras: true,
  seniorTeacherName: true,
  blurbHtml: true,
  reviewedByAcronym: true,
  approvedByAcronym: true,
  lastUpdatedByAcronym: true,
  createdAt: true,
  updatedAt: true,
} as const;

type JobDescriptionRow = {
  id: number;
  jobTitle: string;
  titleProfileId: number | null;
  centreKey: number | null;
  locationDisplay: string;
  positionType: string;
  fte: unknown;
  jobCategory: string;
  layoutVariant: string;
  agreementText: string;
  salaryRangeText: string;
  dateAdvertised: Date | null;
  closingAt: Date | null;
  startDateText: string;
  qualificationsText: string;
  introParagraph: string;
  roleSections: unknown;
  extras: unknown;
  seniorTeacherName: string;
  blurbHtml: string | null;
  reviewedByAcronym: string;
  approvedByAcronym: string;
  lastUpdatedByAcronym: string;
  createdAt: Date;
  updatedAt: Date;
};

function toJobDescriptionView(row: JobDescriptionRow): JobDescriptionView {
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    titleProfileId: row.titleProfileId,
    centreKey: row.centreKey,
    locationDisplay: row.locationDisplay,
    positionType: row.positionType,
    fte: row.fte != null ? Number(row.fte) : null,
    jobCategory: row.jobCategory,
    layoutVariant: resolveLayoutVariant(row.layoutVariant),
    agreementText: row.agreementText,
    salaryRangeText: row.salaryRangeText,
    dateAdvertised: row.dateAdvertised ? row.dateAdvertised.toISOString() : null,
    closingAt: row.closingAt ? row.closingAt.toISOString() : null,
    startDateText: row.startDateText,
    qualificationsText: row.qualificationsText,
    introParagraph: row.introParagraph,
    roleSections: (row.roleSections as RoleSection[]) ?? [],
    extras: (row.extras as JdTitleExtras | null) ?? null,
    seniorTeacherName: row.seniorTeacherName,
    blurbHtml: row.blurbHtml,
    reviewedByAcronym: row.reviewedByAcronym,
    approvedByAcronym: row.approvedByAcronym,
    lastUpdatedByAcronym: row.lastUpdatedByAcronym,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listJobDescriptions(): Promise<JobDescriptionListItem[]> {
  const rows = await prisma.jobDescription.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      jobTitle: true,
      locationDisplay: true,
      positionType: true,
      dateAdvertised: true,
      closingAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    jobTitle: row.jobTitle,
    locationDisplay: row.locationDisplay,
    positionType: row.positionType,
    dateAdvertised: row.dateAdvertised ? row.dateAdvertised.toISOString() : null,
    closingAt: row.closingAt ? row.closingAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getJobDescription(id: number): Promise<JobDescriptionView | null> {
  const row = await prisma.jobDescription.findUnique({
    where: { id },
    select: JOB_DESCRIPTION_SELECT,
  });
  return row ? toJobDescriptionView(row as JobDescriptionRow) : null;
}

export type CreateJobDescriptionInput = {
  jobTitleProfileId: number;
  centreKey: number;
  positionType?: string | null;
  fte?: number | null;
  dateAdvertised?: string | null;
  closingAt?: string | null;
  startDateText?: string | null;
  lastUpdatedByAcronym?: string | null;
};

// Composes a new JobDescription from the title profile + centre profile +
// effective pay scale. All values are copied (not referenced), so the JD can
// be edited afterwards without touching the shared profiles.
export async function createJobDescription(input: CreateJobDescriptionInput): Promise<number> {
  const titleProfile = await getTitleProfile(input.jobTitleProfileId);
  if (!titleProfile) throw new Error("Unknown job title profile");
  const centreProfile = await getCentreProfile(input.centreKey);
  if (!centreProfile) throw new Error("Unknown centre");

  const positionType = emptyToNull(input.positionType) ?? titleProfile.defaultPositionType;
  const fte = positionType === "Part-time" ? (input.fte ?? 1) : null;
  const now = new Date();
  const dateAdvertised = parseDate(input.dateAdvertised) ?? now;
  const salaryRangeText = titleProfile.payScaleKey
    ? (await formatSalaryRange(titleProfile.payScaleKey, dateAdvertised, fte)) ?? ""
    : "";

  const row = await prisma.jobDescription.create({
    data: {
      jobTitle: titleProfile.jobTitle,
      titleProfileId: titleProfile.id,
      centreKey: centreProfile.centreKey,
      locationDisplay: centreProfile.locationDisplay,
      positionType,
      fte,
      jobCategory: titleProfile.jobCategory,
      layoutVariant: titleProfile.layoutVariant,
      agreementText: titleProfile.layoutVariant === "administrator" ? "" : titleProfile.agreementText,
      salaryRangeText,
      dateAdvertised,
      closingAt: parseDate(input.closingAt) ?? defaultClosingDate(dateAdvertised),
      startDateText: emptyToNull(input.startDateText) ?? "To be negotiated",
      qualificationsText: titleProfile.qualificationsText,
      introParagraph: centreProfile.introParagraph,
      roleSections: toJsonInput(titleProfile.roleSections as object),
      extras: toJsonInput(titleProfile.extras ?? null),
      seniorTeacherName: centreProfile.seniorTeacherName,
      reviewedByAcronym: centreProfile.seniorTeacherAcronym,
      approvedByAcronym: "PM",
      // Falls back to the global "Last Reviewed by" setting so the PDF footer's
      // Last Updated By row is populated rather than printing blank.
      lastUpdatedByAcronym:
        emptyToNull(input.lastUpdatedByAcronym) ?? (await getGlobalSettings()).lastReviewedByAcronym,
    },
    select: { id: true },
  });
  return row.id;
}

export type UpdateJobDescriptionInput = {
  jobTitle?: string;
  titleProfileId?: number | null;
  centreKey?: number | null;
  locationDisplay?: string;
  positionType?: string;
  fte?: number | null;
  jobCategory?: string;
  layoutVariant?: JdLayoutVariant;
  agreementText?: string;
  salaryRangeText?: string;
  dateAdvertised?: string | null;
  closingAt?: string | null;
  startDateText?: string;
  qualificationsText?: string;
  introParagraph?: string;
  roleSections?: RoleSection[];
  extras?: JdTitleExtras | null;
  seniorTeacherName?: string;
  reviewedByAcronym?: string;
  approvedByAcronym?: string;
  lastUpdatedByAcronym?: string;
};

export async function updateJobDescription(
  id: number,
  input: UpdateJobDescriptionInput,
): Promise<void> {
  await prisma.jobDescription.update({
    where: { id },
    data: {
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.titleProfileId !== undefined ? { titleProfileId: input.titleProfileId } : {}),
      ...(input.centreKey !== undefined ? { centreKey: input.centreKey } : {}),
      ...(input.locationDisplay !== undefined ? { locationDisplay: input.locationDisplay } : {}),
      ...(input.positionType !== undefined ? { positionType: input.positionType } : {}),
      ...(input.fte !== undefined ? { fte: input.fte } : {}),
      ...(input.jobCategory !== undefined ? { jobCategory: input.jobCategory } : {}),
      ...(input.layoutVariant !== undefined ? { layoutVariant: input.layoutVariant } : {}),
      ...(input.agreementText !== undefined ? { agreementText: input.agreementText } : {}),
      ...(input.salaryRangeText !== undefined ? { salaryRangeText: input.salaryRangeText } : {}),
      ...(input.dateAdvertised !== undefined ? { dateAdvertised: parseDate(input.dateAdvertised) } : {}),
      ...(input.closingAt !== undefined ? { closingAt: parseDate(input.closingAt) } : {}),
      ...(input.startDateText !== undefined ? { startDateText: input.startDateText } : {}),
      ...(input.qualificationsText !== undefined ? { qualificationsText: input.qualificationsText } : {}),
      ...(input.introParagraph !== undefined ? { introParagraph: input.introParagraph } : {}),
      ...(input.roleSections !== undefined ? { roleSections: toJsonInput(input.roleSections as object) } : {}),
      ...(input.extras !== undefined ? { extras: toJsonInput(input.extras) } : {}),
      ...(input.seniorTeacherName !== undefined ? { seniorTeacherName: input.seniorTeacherName } : {}),
      ...(input.reviewedByAcronym !== undefined ? { reviewedByAcronym: input.reviewedByAcronym } : {}),
      ...(input.approvedByAcronym !== undefined ? { approvedByAcronym: input.approvedByAcronym } : {}),
      ...(input.lastUpdatedByAcronym !== undefined
        ? { lastUpdatedByAcronym: input.lastUpdatedByAcronym }
        : {}),
    },
  });
}

export async function deleteJobDescription(id: number): Promise<void> {
  await prisma.jobDescription.delete({ where: { id } });
}

export async function duplicateJobDescription(id: number): Promise<number> {
  const source = await prisma.jobDescription.findUnique({ where: { id } });
  if (!source) throw new Error("Job description not found");
  const row = await prisma.jobDescription.create({
    data: {
      jobTitle: source.jobTitle,
      titleProfileId: source.titleProfileId,
      centreKey: source.centreKey,
      locationDisplay: source.locationDisplay,
      positionType: source.positionType,
      fte: source.fte,
      jobCategory: source.jobCategory,
      layoutVariant: source.layoutVariant,
      agreementText: source.agreementText,
      salaryRangeText: source.salaryRangeText,
      dateAdvertised: new Date(),
      closingAt: source.closingAt,
      startDateText: source.startDateText,
      qualificationsText: source.qualificationsText,
      introParagraph: source.introParagraph,
      roleSections: toJsonInput(source.roleSections as object),
      extras: toJsonInput(source.extras as object | null),
      seniorTeacherName: source.seniorTeacherName,
      blurbHtml: source.blurbHtml,
      reviewedByAcronym: source.reviewedByAcronym,
      approvedByAcronym: source.approvedByAcronym,
      lastUpdatedByAcronym: source.lastUpdatedByAcronym,
    },
    select: { id: true },
  });
  return row.id;
}

// --- Blurbs ------------------------------------------------------------------

export type JdBlurbVersion = { id: number; contentHtml: string; savedAt: string };
export type JdIntroParagraphExample = {
  id: number;
  centreKey: number | null;
  centreName: string | null;
  introParagraph: string;
  source: "job-description" | "centre-profile";
};

// Writes the JD's current blurb and appends a history row. A new row is
// written on every save (AI-generated or hand-edited) so nothing is ever
// overwritten in JdBlurb — it doubles as the AI's reference corpus.
export async function saveBlurb(jobDescriptionId: number, rawHtml: string): Promise<void> {
  const contentHtml = sanitizeJdBlurbHtml(rawHtml);
  const jd = await prisma.jobDescription.findUnique({
    where: { id: jobDescriptionId },
    select: { centreKey: true },
  });
  if (!jd?.centreKey) throw new Error("Job description has no centre");

  await prisma.$transaction([
    prisma.jobDescription.update({
      where: { id: jobDescriptionId },
      data: { blurbHtml: contentHtml },
    }),
    prisma.jdBlurb.create({
      data: { centreKey: jd.centreKey, jobDescriptionId, contentHtml },
    }),
  ]);
}

export async function listBlurbsForCentre(
  centreKey: number,
  limit = 10,
): Promise<JdBlurbVersion[]> {
  const rows = await prisma.jdBlurb.findMany({
    where: { centreKey },
    orderBy: { savedAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    contentHtml: row.contentHtml,
    savedAt: row.savedAt.toISOString(),
  }));
}

export async function listRecentBlurbsAcrossCentres(
  limit = 6,
  excludeCentreKey?: number | null,
): Promise<JdBlurbVersion[]> {
  const rows = await prisma.jdBlurb.findMany({
    where: excludeCentreKey != null ? { centreKey: { not: excludeCentreKey } } : undefined,
    orderBy: { savedAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    contentHtml: row.contentHtml,
    savedAt: row.savedAt.toISOString(),
  }));
}

export async function listIntroParagraphExamples(options: {
  centreKey?: number | null;
  excludeCentreKey?: number | null;
  limit?: number;
} = {}): Promise<JdIntroParagraphExample[]> {
  const limit = options.limit ?? 6;
  const centreFilter =
    options.centreKey != null
      ? { centreKey: options.centreKey }
      : options.excludeCentreKey != null
        ? { centreKey: { not: options.excludeCentreKey } }
        : {};

  const rows = await prisma.jobDescription.findMany({
    where: {
      ...centreFilter,
      introParagraph: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      centreKey: true,
      locationDisplay: true,
      introParagraph: true,
      centre: { select: { name: true } },
    },
  });

  const examples = rows.map((row) => ({
    id: row.id,
    centreKey: row.centreKey,
    centreName: row.centre?.name ?? row.locationDisplay,
    introParagraph: row.introParagraph,
    source: "job-description" as const,
  }));

  if (examples.length >= limit || options.centreKey != null) {
    return examples;
  }

  const centreRows = await prisma.jdCentreProfile.findMany({
    where: {
      ...(options.excludeCentreKey != null ? { centreKey: { not: options.excludeCentreKey } } : {}),
      introParagraph: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
    take: limit - examples.length,
    select: {
      id: true,
      centreKey: true,
      locationDisplay: true,
      introParagraph: true,
      centre: { select: { name: true } },
    },
  });

  return [
    ...examples,
    ...centreRows.map((row) => ({
      id: row.id,
      centreKey: row.centreKey,
      centreName: row.centre?.name ?? row.locationDisplay,
      introParagraph: row.introParagraph,
      source: "centre-profile" as const,
    })),
  ];
}

export async function listBlurbVersions(jobDescriptionId: number): Promise<JdBlurbVersion[]> {
  const rows = await prisma.jdBlurb.findMany({
    where: { jobDescriptionId },
    orderBy: { savedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    contentHtml: row.contentHtml,
    savedAt: row.savedAt.toISOString(),
  }));
}

export async function restoreBlurbVersion(jobDescriptionId: number, blurbId: number): Promise<void> {
  const version = await prisma.jdBlurb.findFirst({
    where: { id: blurbId, jobDescriptionId },
    select: { contentHtml: true },
  });
  if (!version) throw new Error("Blurb version not found");
  await saveBlurb(jobDescriptionId, version.contentHtml);
}

// --- Knowledge docs ------------------------------------------------------------

export type JdKnowledgeDocView = {
  id: number;
  kind: "generic" | "service";
  centreKey: number | null;
  label: string;
  contentHtml: string;
  updatedAt: string;
};

function toKnowledgeDocView(row: {
  id: number;
  kind: string;
  centreKey: number | null;
  label: string;
  contentHtml: string;
  updatedAt: Date;
}): JdKnowledgeDocView {
  return {
    id: row.id,
    kind: row.kind === "generic" ? "generic" : "service",
    centreKey: row.centreKey,
    label: row.label,
    contentHtml: row.contentHtml,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listKnowledgeDocsForCentre(centreKey: number): Promise<JdKnowledgeDocView[]> {
  const rows = await prisma.jdKnowledgeDoc.findMany({
    where: { OR: [{ kind: "generic" }, { kind: "service", centreKey }] },
    orderBy: [{ kind: "asc" }, { label: "asc" }],
  });
  return rows.map(toKnowledgeDocView);
}

export async function getGenericKnowledgeDoc(): Promise<JdKnowledgeDocView | null> {
  const row = await prisma.jdKnowledgeDoc.findFirst({ where: { kind: "generic" } });
  return row ? toKnowledgeDocView(row) : null;
}

export async function upsertKnowledgeDoc(input: {
  kind: "generic" | "service";
  centreKey?: number | null;
  label: string;
  contentHtml: string;
}): Promise<number> {
  const centreKey = input.kind === "generic" ? null : (input.centreKey ?? null);
  // Prisma's compound @@unique can't match a null `centreKey` (the generic
  // doc), so upsert manually via findFirst instead of the generated key.
  const existing = await prisma.jdKnowledgeDoc.findFirst({
    where: { kind: input.kind, centreKey, label: input.label },
    select: { id: true },
  });
  if (existing) {
    await prisma.jdKnowledgeDoc.update({ where: { id: existing.id }, data: { contentHtml: input.contentHtml } });
    return existing.id;
  }
  const row = await prisma.jdKnowledgeDoc.create({
    data: { kind: input.kind, centreKey, label: input.label, contentHtml: input.contentHtml },
    select: { id: true },
  });
  return row.id;
}

export async function deleteKnowledgeDoc(id: number): Promise<void> {
  await prisma.jdKnowledgeDoc.delete({ where: { id } });
}
