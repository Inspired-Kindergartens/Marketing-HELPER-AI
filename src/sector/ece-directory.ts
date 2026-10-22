// The Ministry of Education's ECE directory (every licensed early childhood
// service in New Zealand, refreshed daily) through data.govt.nz's CKAN
// datastore API. It is the backbone of Sector Insight: which services exist,
// where, what kind, who owns them and how many places they hold.

const API_BASE = "https://catalogue.data.govt.nz/api/3/action";
const DATASET = "directory-of-educational-institutions";
// The ECE directory resource as of 2026-10; looked up again from the dataset
// if it ever moves.
const FALLBACK_RESOURCE_ID = "a9d65b07-8483-4b05-bdfd-d2abe4f38827";
const PAGE_SIZE = 1000;
const FETCH_TIMEOUT_MS = 60_000;

export const HOME_REGION = "Bay of Plenty Region";

export type DirectoryService = {
  eceId: number;
  name: string;
  serviceType: string;
  authority: string;
  address: string;
  suburb: string;
  city: string;
  district: string;
  region: string;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  licensedPlaces: number | null;
  under2Places: number | null;
  roll: number | null;
  rollDate: Date | null;
  twentyHoursEce: boolean | null;
};

type DirectoryRecord = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function integer(value: unknown): number | null {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: unknown): number | null {
  const parsed = Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function readDirectoryRecord(record: DirectoryRecord): DirectoryService | null {
  const eceId = integer(record.ECE_Id);
  const name = text(record.Org_Name);
  if (eceId == null || !name) return null;
  const rollDate = text(record.Roll_Date);
  const twenty = text(record["20_Hrs_ECE"]).toLowerCase();
  return {
    eceId,
    name,
    serviceType: text(record.Org_Type),
    authority: text(record.Authority),
    address: text(record.Add1_Line1),
    suburb: text(record.Add1_Suburb),
    city: text(record.Add1_City),
    district: text(record.Territorial_Authority),
    region: text(record.Regional_Council),
    phone: text(record.Telephone),
    email: text(record.Email).toLowerCase(),
    latitude: decimal(record.Latitude),
    longitude: decimal(record.Longitude),
    licensedPlaces: integer(record.All_Children),
    under2Places: integer(record.Under_2s),
    roll: integer(record.Total),
    rollDate: rollDate && !Number.isNaN(Date.parse(rollDate)) ? new Date(rollDate) : null,
    twentyHoursEce: twenty === "yes" ? true : twenty === "no" ? false : null,
  };
}

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`ECE directory request failed with HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.success !== true) throw new Error("ECE directory request was not successful.");
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveResourceId(): Promise<string> {
  try {
    const dataset = await getJson(`${API_BASE}/package_show?id=${DATASET}`);
    const resource = (dataset?.resources ?? []).find(
      (item: { url?: string; datastore_active?: boolean }) => /ecedirectory/i.test(item.url ?? "") && item.datastore_active,
    );
    return resource?.id ?? FALLBACK_RESOURCE_ID;
  } catch {
    return FALLBACK_RESOURCE_ID;
  }
}

async function searchServices(resourceId: string, filters: Record<string, unknown>): Promise<DirectoryService[]> {
  const services: DirectoryService[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      resource_id: resourceId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      filters: JSON.stringify(filters),
    });
    const result = await getJson(`${API_BASE}/datastore_search?${params}`);
    const records: DirectoryRecord[] = result?.records ?? [];
    for (const record of records) {
      const service = readDirectoryRecord(record);
      if (service) services.push(service);
    }
    if (records.length < PAGE_SIZE) break;
  }
  return services;
}

// Every service in the Bay of Plenty region, plus every service in the
// districts of Inspired's centres outside it (Waihi, Whangamatā, Thames), so
// each of our centres has its local competitors listed.
export async function fetchDirectoryServices(ownLicenceNumbers: readonly number[]): Promise<DirectoryService[]> {
  const resourceId = await resolveResourceId();
  const byId = new Map<number, DirectoryService>();
  for (const service of await searchServices(resourceId, { Regional_Council: HOME_REGION })) byId.set(service.eceId, service);

  const outside = ownLicenceNumbers.filter((id) => !byId.has(id));
  if (outside.length > 0) {
    const ownServices = await searchServices(resourceId, { ECE_Id: outside });
    const districts = [...new Set(ownServices.map((service) => service.district).filter(Boolean))];
    if (districts.length > 0) {
      for (const service of await searchServices(resourceId, { Territorial_Authority: districts })) byId.set(service.eceId, service);
    }
  }
  return [...byId.values()];
}

// Free mail providers say nothing about a centre's website; any other email
// domain usually is its (or its group's) website. kohanga.ac.nz hands each
// kōhanga reo a mailbox (k05c035@…), not a site.
const GENERIC_MAIL_DOMAINS =
  /(^|\.)(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|protonmail|proton|xtra|slingshot|orcon|vodafone|clear|paradise|ihug|actrix|windowslive|bigpond|kinect|farmside|wave|inspire|snap|spark|zoho|gmx|mail|yandex|2degrees|nowmail)\.|\.govt\.nz$|\.health\.nz$|(^|\.)kohanga\.ac\.nz$/i;

export function websiteFromEmail(email: string): string {
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!domain || !domain.includes(".") || GENERIC_MAIL_DOMAINS.test(domain)) return "";
  return `https://${domain}/`;
}
