import { prisma } from "../db.js";
import { normalizeLinkUrl } from "./link-url.js";
import { categorisePromotion } from "../sector/promotions.js";
import type { SectorQueryCentre } from "../sector/query.js";

// Sector Insight storage: competitor and other ECE centres, the promotions
// they advertise, and the update runs that refresh them (src/sector/sync.ts).

export type SectorPromotionView = {
  id: number;
  text: string;
  category: string;
  sourceUrl: string;
  origin: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  endedAt: string | null;
};

export type SectorCentreView = SectorQueryCentre & {
  eceId: number | null;
  authority: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string;
  website: string;
  promotionUrl: string;
  roll: number | null;
  rollDate: string | null;
  twentyHoursEce: boolean | null;
  verified: boolean;
  notes: string;
  lastCrawledAt: string | null;
  updatedAt: string;
  promotions: SectorPromotionView[]; // active only
  pastPromotions: SectorPromotionView[]; // filled by getSectorCentre only
};

export type SectorCrawlRunView = {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  centresAdded: number;
  centresUpdated: number;
  centresClosed: number;
  sitesChecked: number;
  sitesFailed: number;
  promotionsAdded: number;
  promotionsEnded: number;
  message: string;
};

type PromotionRow = {
  id: number;
  text: string;
  category: string;
  sourceUrl: string;
  origin: string;
  active: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
};

function toPromotionView(row: PromotionRow): SectorPromotionView {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    sourceUrl: row.sourceUrl,
    origin: row.origin,
    active: row.active,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

type CentreRow = Awaited<ReturnType<typeof prisma.sectorCentre.findFirstOrThrow>> & { promotions: PromotionRow[] };

function toCentreView(row: CentreRow): SectorCentreView {
  const promotions = [...row.promotions].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  return {
    id: row.id,
    eceId: row.eceId,
    name: row.name,
    operator: row.operator,
    serviceType: row.serviceType,
    authority: row.authority,
    isOwn: row.isOwn,
    address: row.address,
    suburb: row.suburb,
    city: row.city,
    district: row.district,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    email: row.email,
    website: row.website,
    promotionUrl: row.promotionUrl,
    licensedPlaces: row.licensedPlaces,
    under2Places: row.under2Places,
    roll: row.roll,
    rollDate: row.rollDate?.toISOString() ?? null,
    twentyHoursEce: row.twentyHoursEce,
    meals: row.meals,
    providesMeals: row.providesMeals,
    transport: row.transport,
    providesTransport: row.providesTransport,
    verified: row.verified,
    inDirectory: row.inDirectory,
    notes: row.notes,
    lastCrawledAt: row.lastCrawledAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    promotions: promotions.filter((promotion) => promotion.active).map(toPromotionView),
    pastPromotions: [],
  };
}

export async function listSectorCentres(): Promise<SectorCentreView[]> {
  const rows = await prisma.sectorCentre.findMany({
    include: { promotions: { where: { active: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toCentreView);
}

export async function getSectorCentre(id: number): Promise<SectorCentreView | null> {
  const row = await prisma.sectorCentre.findUnique({ where: { id }, include: { promotions: true } });
  if (!row) return null;
  const view = toCentreView(row);
  view.pastPromotions = row.promotions
    .filter((promotion) => !promotion.active)
    .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))
    .map(toPromotionView);
  return view;
}

function readText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// "yes" / "no" / anything else (unknown) from the editor's selects.
function readTriState(value: unknown): boolean | null {
  if (value === true || value === "yes") return true;
  if (value === false || value === "no") return false;
  return null;
}

function readUrl(value: unknown): string {
  const text = readText(value, 2000);
  return text ? normalizeLinkUrl(text) : "";
}

// The fields a person can correct by hand. Directory fields (address, places,
// roll) are not editable: the next update would overwrite them anyway.
export async function updateSectorCentre(id: number, input: Record<string, unknown>): Promise<boolean> {
  const data: Record<string, unknown> = {};
  if ("operator" in input) {
    data.operator = readText(input.operator, 200);
    data.verified = data.operator !== "";
  }
  if ("website" in input) data.website = readUrl(input.website);
  if ("promotionUrl" in input) data.promotionUrl = readUrl(input.promotionUrl);
  if ("meals" in input) data.meals = readText(input.meals, 300);
  if ("providesMeals" in input) data.providesMeals = readTriState(input.providesMeals);
  if ("transport" in input) data.transport = readText(input.transport, 300);
  if ("providesTransport" in input) data.providesTransport = readTriState(input.providesTransport);
  if ("notes" in input) data.notes = readText(input.notes, 4000);
  const result = await prisma.sectorCentre.updateMany({ where: { id }, data });
  return result.count > 0;
}

export async function addSectorPromotion(centreId: number, input: Record<string, unknown>): Promise<boolean> {
  const text = readText(input.text, 300).replace(/\s+/g, " ");
  if (!text) return false;
  const centre = await prisma.sectorCentre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) return false;
  const now = new Date();
  await prisma.sectorPromotion.upsert({
    where: { centreId_text: { centreId, text } },
    create: { centreId, text, category: categorisePromotion(text), sourceUrl: readUrl(input.sourceUrl), origin: "manual" },
    update: { active: true, endedAt: null, lastSeenAt: now, origin: "manual" },
  });
  return true;
}

export async function endSectorPromotion(id: number): Promise<boolean> {
  const result = await prisma.sectorPromotion.updateMany({
    where: { id, active: true },
    data: { active: false, endedAt: new Date() },
  });
  return result.count > 0;
}

export async function deleteSectorPromotion(id: number): Promise<boolean> {
  const result = await prisma.sectorPromotion.deleteMany({ where: { id } });
  return result.count > 0;
}

export async function listSectorCrawlRuns(limit = 12): Promise<SectorCrawlRunView[]> {
  const rows = await prisma.sectorCrawlRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  return rows.map((row) => ({
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    centresAdded: row.centresAdded,
    centresUpdated: row.centresUpdated,
    centresClosed: row.centresClosed,
    sitesChecked: row.sitesChecked,
    sitesFailed: row.sitesFailed,
    promotionsAdded: row.promotionsAdded,
    promotionsEnded: row.promotionsEnded,
    message: row.message,
  }));
}

// --- CSV export ---------------------------------------------------------------

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function yesNo(value: boolean | null): string {
  return value === true ? "Yes" : value === false ? "No" : "";
}

// The same columns as the BOP competitor spreadsheet, then the directory
// fields, so the export opens straight into the team's existing sheet.
export function sectorCentresToCsv(centres: readonly SectorCentreView[]): string {
  const header = [
    "Centre", "Operator / service group", "Promotion category", "Meals", "Transport", "City", "Suburb",
    "Operator source URL", "Promotion source URL", "Service type", "Ownership", "District", "Address",
    "Licensed places", "Under-2 places", "Roll", "Phone", "Email", "MoE licence number", "Inspired centre", "Notes",
  ];
  const rows = centres.map((centre) => [
    centre.name,
    centre.operator || "Unverified",
    centre.promotions.map((promotion) => promotion.text).join("; "),
    centre.meals || yesNo(centre.providesMeals),
    centre.transport || yesNo(centre.providesTransport),
    centre.city,
    centre.suburb,
    centre.website,
    centre.promotions[0]?.sourceUrl || centre.promotionUrl,
    centre.serviceType,
    centre.authority,
    centre.district,
    centre.address,
    centre.licensedPlaces,
    centre.under2Places,
    centre.roll,
    centre.phone,
    centre.email,
    centre.eceId,
    centre.isOwn ? "Yes" : "",
    centre.notes,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
