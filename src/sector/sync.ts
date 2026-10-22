import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import type { AiConfig } from "../ai/config.js";
import { runLocalJson } from "../ai/client.js";
import { advanceSyncCursor, readSyncCursor } from "../storage/sync-cursor-store.js";
import { normalizeLinkUrl } from "../storage/link-url.js";
import { decodeCsvBytes, readSectorCsv } from "./csv.js";
import { fetchDirectoryServices, websiteFromEmail, type DirectoryService } from "./ece-directory.js";
import { buildExtractionMessages, EXCERPT_MAX_CHARS, EXTRACTION_SCHEMA, readExtraction, type SiteFindings } from "./extract.js";
import { findBestNameMatch, normaliseName, shortDistrictName } from "./names.js";
import { buildPageExcerpt, centreWindows, embeddedPayloadRecords, pageVisibleText, pickFollowLinks, type PayloadRecord } from "./page-text.js";
import { categorisePromotion, findMatchingPromotion, isSupportedByPage } from "./promotions.js";

// One Sector Insight update: seed from the BOP CSV (first run only), refresh
// every service from the Ministry's ECE directory, then read each competitor
// website for promotions, meals and transport. Runs monthly from the server's
// background loop, or from the page's "Update now" button.

type Logger = {
  info: (payload: object, message?: string) => void;
  warn: (payload: object, message?: string) => void;
};

export type SectorSyncConfig = {
  ai: AiConfig;
  rootDir: string;
};

const COMPLETED_KEY = "sector:completed-at";
export const SECTOR_REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const SEED_CSV_PATTERN = /^Bay_of_Plenty_ECE_Competitor_Promotions_.*\.csv$/i;
const OWN_OPERATOR = "Inspired Kindergartens";
// The directory returns ~400 services for our area; far fewer means a bad
// pull, and nothing is marked closed on the strength of it.
const MIN_DIRECTORY_SIZE = 100;
const USER_AGENT = "MarketingHelperAI/1.0 (Inspired Kindergartens sector insight; one request at a time)";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const REQUEST_DELAY_MS = 800;
const FOLLOW_LINKS_PER_SITE = 3;

// --- Progress ------------------------------------------------------------------

export type SectorSyncProgress = {
  running: boolean;
  runId: number | null;
  phase: string;
  done: number;
  total: number;
};

let progress: SectorSyncProgress = { running: false, runId: null, phase: "", done: 0, total: 0 };

export function getSectorSyncProgress(): SectorSyncProgress {
  return { ...progress };
}

type Counts = {
  centresAdded: number;
  centresUpdated: number;
  centresClosed: number;
  sitesChecked: number;
  sitesFailed: number;
  promotionsAdded: number;
  promotionsEnded: number;
};

// --- Directory fields ----------------------------------------------------------

function directoryFields(service: DirectoryService, ownIds: ReadonlySet<number>) {
  return {
    eceId: service.eceId,
    name: service.name,
    serviceType: service.serviceType,
    authority: service.authority,
    address: service.address,
    suburb: service.suburb,
    city: service.city,
    district: service.district,
    latitude: service.latitude,
    longitude: service.longitude,
    phone: service.phone,
    email: service.email,
    licensedPlaces: service.licensedPlaces,
    under2Places: service.under2Places,
    roll: service.roll,
    rollDate: service.rollDate,
    twentyHoursEce: service.twentyHoursEce,
    inDirectory: true,
    isOwn: ownIds.has(service.eceId),
  };
}

const DIRECTORY_COMPARE_KEYS = ["name", "serviceType", "authority", "address", "suburb", "city", "licensedPlaces", "under2Places", "roll", "phone", "email"] as const;

function directoryChanged(current: Record<string, unknown>, next: ReturnType<typeof directoryFields>): boolean {
  return DIRECTORY_COMPARE_KEYS.some((key) => (current[key] ?? null) !== (next[key] ?? null)) || current.inDirectory !== true || current.isOwn !== next.isOwn;
}

function serviceTowns(service: { city: string; suburb: string; district: string }): string[] {
  return [service.city, service.suburb, shortDistrictName(service.district)].filter(Boolean);
}

// --- CSV seed -----------------------------------------------------------------

async function findSeedCsv(rootDir: string): Promise<{ path: string; seenAt: Date } | null> {
  const docs = join(rootDir, "docs");
  const files = (await readdir(docs).catch(() => [] as string[])).filter((file) => SEED_CSV_PATTERN.test(file)).sort();
  const latest = files.at(-1);
  if (!latest) return null;
  const dated = latest.match(/(\d{4}-\d{2}-\d{2})/);
  return { path: join(docs, latest), seenAt: dated ? new Date(`${dated[1]}T00:00:00Z`) : new Date() };
}

// First run only: the CSV's centres, matched to their directory entries so the
// directory pass that follows updates rather than duplicates them.
async function seedFromCsv(config: SectorSyncConfig, directory: DirectoryService[], ownIds: ReadonlySet<number>, counts: Counts, log: Logger) {
  const seed = await findSeedCsv(config.rootDir);
  if (!seed) return;
  const rows = readSectorCsv(decodeCsvBytes(await readFile(seed.path)));
  const used = new Set<number>();
  const created = new Map<string, number>(); // normalised name|town → centre id
  let unmatched = 0;

  for (const row of rows) {
    const available = directory.filter((service) => !used.has(service.eceId));
    const match = findBestNameMatch(row.name, row.city, available, (service) => ({ name: service.name, towns: serviceTowns(service) }));
    const key = `${normaliseName(row.name)}|${normaliseName(row.city)}`;
    let centreId = !match ? created.get(key) : undefined;

    if (centreId == null) {
      if (match) used.add(match.eceId);
      else unmatched++;
      const centre = await prisma.sectorCentre.create({
        data: {
          ...(match ? directoryFields(match, ownIds) : { name: row.name, city: row.city, suburb: row.suburb }),
          operator: match && ownIds.has(match.eceId) ? OWN_OPERATOR : row.operator,
          verified: row.verified || (match != null && ownIds.has(match.eceId)),
          website: normalizeLinkUrl(row.operatorUrl),
          promotionUrl: normalizeLinkUrl(row.promotionUrl),
          meals: row.meals,
          providesMeals: row.providesMeals,
          transport: row.transport,
          providesTransport: row.providesTransport,
        },
      });
      centreId = centre.id;
      created.set(key, centre.id);
      counts.centresAdded++;
    }

    for (const text of row.promotions) {
      await prisma.sectorPromotion.upsert({
        where: { centreId_text: { centreId, text } },
        create: {
          centreId,
          text,
          category: categorisePromotion(text),
          sourceUrl: normalizeLinkUrl(row.promotionUrl),
          origin: "csv",
          firstSeenAt: seed.seenAt,
          lastSeenAt: seed.seenAt,
        },
        update: {},
      });
    }
  }
  log.info({ rows: rows.length, unmatched }, "Sector sync: seeded from CSV");
}

// --- Directory refresh ---------------------------------------------------------

// Opening words too common to identify a group on their own.
const GENERIC_PREFIX_WORDS = new Set(["little", "central", "kids", "kidz", "early", "first", "happy", "bright", "learning", "above", "future", "new", "busy"]);

// Group names shared by the start of every centre's name ("BestStart …",
// "Central Kids Kindergartens - …"), so a centre from the directory is filed
// under its group. Two words, or one distinctive one ("BestStart"), so
// "Little …" never matches.
export function operatorPrefixes(centres: Array<{ name: string; operator: string }>): Array<[string, string]> {
  const byOperator = new Map<string, string[][]>();
  for (const centre of centres) {
    if (!centre.operator || centre.operator === OWN_OPERATOR) continue;
    const words = normaliseName(centre.name).split(" ");
    byOperator.set(centre.operator, [...(byOperator.get(centre.operator) ?? []), words]);
  }
  const prefixes: Array<[string, string]> = [];
  for (const [operator, names] of byOperator) {
    if (names.length < 2) continue;
    const common: string[] = [];
    for (let index = 0; names.every((words) => words[index] != null && words[index] === names[0][index]); index++) common.push(names[0][index]);
    const distinctive = common.length >= 2 || (common.length === 1 && common[0].length >= 6 && !GENERIC_PREFIX_WORDS.has(common[0]));
    if (distinctive) prefixes.push([common.join(" "), operator]);
  }
  return prefixes.sort((a, b) => b[0].length - a[0].length);
}

// Files every unverified competitor whose name starts with a group's shared
// opening under that group: new directory centres, and older ones a group
// has since been recognised for.
async function fileUnverifiedUnderGroups(counts: Counts) {
  const centres = await prisma.sectorCentre.findMany({ select: { id: true, name: true, operator: true, isOwn: true } });
  const prefixes = operatorPrefixes(centres);
  for (const centre of centres) {
    if (centre.operator || centre.isOwn) continue;
    const normalised = normaliseName(centre.name);
    const operator = prefixes.find(([prefix]) => normalised.startsWith(`${prefix} `))?.[1];
    if (operator) {
      await prisma.sectorCentre.update({ where: { id: centre.id }, data: { operator } });
      counts.centresUpdated++;
    }
  }
}

async function refreshFromDirectory(directory: DirectoryService[], ownIds: ReadonlySet<number>, counts: Counts) {
  const existing = await prisma.sectorCentre.findMany();
  const byEceId = new Map(existing.filter((centre) => centre.eceId != null).map((centre) => [centre.eceId!, centre]));
  const unlinked = existing.filter((centre) => centre.eceId == null);

  for (const service of directory) {
    const fields = directoryFields(service, ownIds);
    const current = byEceId.get(service.eceId);
    if (current) {
      if (directoryChanged(current, fields)) {
        await prisma.sectorCentre.update({ where: { id: current.id }, data: fields });
        counts.centresUpdated++;
      }
      continue;
    }

    // A CSV-only centre that turns out to be this service is linked, not duplicated.
    const csvMatch = findBestNameMatch(service.name, service.city, unlinked, (centre) => ({ name: centre.name, towns: serviceTowns(centre) }));
    if (csvMatch) {
      unlinked.splice(unlinked.indexOf(csvMatch), 1);
      await prisma.sectorCentre.update({ where: { id: csvMatch.id }, data: fields });
      counts.centresUpdated++;
      continue;
    }

    const isOwn = ownIds.has(service.eceId);
    await prisma.sectorCentre.create({ data: { ...fields, operator: isOwn ? OWN_OPERATOR : "", verified: isOwn } });
    counts.centresAdded++;
  }

  if (directory.length >= MIN_DIRECTORY_SIZE) {
    const listed = new Set(directory.map((service) => service.eceId));
    const closed = existing.filter((centre) => centre.eceId != null && centre.inDirectory && !listed.has(centre.eceId));
    if (closed.length > 0) {
      await prisma.sectorCentre.updateMany({ where: { id: { in: closed.map((centre) => centre.id) } }, data: { inDirectory: false } });
      counts.centresClosed += closed.length;
    }
  }
}

// Centres with no website get their group's (the one most of its centres
// use) or, failing that, their email domain's.
async function fillMissingWebsites() {
  const centres = await prisma.sectorCentre.findMany({ select: { id: true, operator: true, website: true, email: true, isOwn: true } });
  const groupSite = new Map<string, string>();
  const tally = new Map<string, Map<string, number>>();
  for (const centre of centres) {
    if (!centre.operator || !centre.website) continue;
    const sites = tally.get(centre.operator) ?? new Map<string, number>();
    sites.set(centre.website, (sites.get(centre.website) ?? 0) + 1);
    tally.set(centre.operator, sites);
  }
  for (const [operator, sites] of tally) groupSite.set(operator, [...sites.entries()].sort((a, b) => b[1] - a[1])[0][0]);

  for (const centre of centres) {
    if (centre.website || centre.isOwn) continue;
    const website = (centre.operator && groupSite.get(centre.operator)) || websiteFromEmail(centre.email);
    if (website) await prisma.sectorCentre.update({ where: { id: centre.id }, data: { website } });
  }
}

// --- Polite fetching -------------------------------------------------------------

const robotsCache = new Map<string, string[]>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<{ ok: boolean; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: controller.signal, redirect: "follow" });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || (type && !/html|text\/plain/i.test(type))) return { ok: false, html: "" };
    const html = await response.text();
    return { ok: true, html: html.slice(0, MAX_PAGE_BYTES) };
  } catch {
    return { ok: false, html: "" };
  } finally {
    clearTimeout(timeout);
  }
}

// The Disallow rules for every crawler ("*") or for us by name.
export function parseRobots(robots: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  let inAgents = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(field ?? "")) {
      if (!inAgents) applies = false;
      inAgents = true;
      if (value === "*" || /marketinghelper/i.test(value)) applies = true;
    } else if (field) {
      inAgents = false;
      if (applies && /^disallow$/i.test(field) && value) disallow.push(value);
    }
  }
  return disallow;
}

// A Disallow rule is a path prefix where "*" matches anything and a trailing
// "$" anchors the end ("/*?author=*" blocks author archives, not the site).
export function robotsRuleMatches(rule: string, path: string): boolean {
  if (!rule) return false;
  const anchored = rule.endsWith("$");
  const pattern = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

async function allowedByRobots(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!robotsCache.has(parsed.origin)) {
    const robots = await fetchPage(`${parsed.origin}/robots.txt`);
    robotsCache.set(parsed.origin, robots.ok ? parseRobots(robots.html) : []);
  }
  const path = parsed.pathname + parsed.search;
  return !(robotsCache.get(parsed.origin) ?? []).some((rule) => robotsRuleMatches(rule, path));
}

type SitePages = { urls: string[]; text: string; records: PayloadRecord[] };

// The site's page plus up to three same-site pages about fees, offers, food
// or transport, one request at a time.
async function readSite(url: string): Promise<SitePages | null> {
  if (!(await allowedByRobots(url))) return null;
  const first = await fetchPage(url);
  if (!first.ok) return null;
  const pages = [{ url, html: first.html }];
  for (const link of pickFollowLinks(first.html, url, FOLLOW_LINKS_PER_SITE)) {
    await sleep(REQUEST_DELAY_MS);
    if (!(await allowedByRobots(link))) continue;
    const page = await fetchPage(link);
    if (page.ok) pages.push({ url: link, html: page.html });
  }
  return {
    urls: pages.map((page) => page.url),
    text: pages.map((page) => pageVisibleText(page.html)).join("\n"),
    records: pages.flatMap((page) => embeddedPayloadRecords(page.html)),
  };
}

// --- Applying what a site says ----------------------------------------------------

type CrawlCentre = { id: number; name: string; providesMeals: boolean | null; providesTransport: boolean | null };

async function applyFindings(site: string, pages: SitePages, pageText: string, findings: SiteFindings, centres: CrawlCentre[], counts: Counts) {
  const now = new Date();
  const sourceUrls = new Set([site, ...pages.urls]);

  for (const centre of centres) {
    const promotions = await prisma.sectorPromotion.findMany({ where: { centreId: centre.id } });
    const seen = new Set<number>();

    for (const found of findings.promotions.filter((promotion) => promotion.centres.includes(centre.name))) {
      const match = findMatchingPromotion(found.text, promotions);
      if (match) {
        seen.add(match.id);
        if (!match.active) counts.promotionsAdded++;
        await prisma.sectorPromotion.update({ where: { id: match.id }, data: { active: true, endedAt: null, lastSeenAt: now } });
      } else {
        const createdPromotion = await prisma.sectorPromotion.create({
          data: { centreId: centre.id, text: found.text, category: categorisePromotion(found.text), sourceUrl: site, origin: "crawl" },
        });
        promotions.push(createdPromotion);
        seen.add(createdPromotion.id);
        counts.promotionsAdded++;
      }
    }

    // An offer from this site that wasn't found again ends, unless its wording
    // is still on the page (the model may simply have missed it this time).
    for (const promotion of promotions) {
      if (!promotion.active || seen.has(promotion.id) || promotion.origin === "manual" || !sourceUrls.has(promotion.sourceUrl)) continue;
      if (isSupportedByPage(promotion.text, pageText)) {
        await prisma.sectorPromotion.update({ where: { id: promotion.id }, data: { lastSeenAt: now } });
      } else {
        await prisma.sectorPromotion.update({ where: { id: promotion.id }, data: { active: false, endedAt: now } });
        counts.promotionsEnded++;
      }
    }

    const data: Record<string, unknown> = { lastCrawledAt: now };
    // A "yes" from the page always wins; a "no" only fills an unknown.
    if (findings.meals?.centres.includes(centre.name) && (findings.meals.provided || centre.providesMeals == null)) {
      data.providesMeals = findings.meals.provided;
      if (findings.meals.detail) data.meals = findings.meals.detail;
    }
    if (findings.transport?.centres.includes(centre.name) && (findings.transport.provided || centre.providesTransport == null)) {
      data.providesTransport = findings.transport.provided;
      if (findings.transport.detail) data.transport = findings.transport.detail;
    }
    await prisma.sectorCentre.update({ where: { id: centre.id }, data });
  }
}

async function crawlWebsites(config: SectorSyncConfig, counts: Counts, notes: string[], log: Logger) {
  const centres = await prisma.sectorCentre.findMany({
    where: { isOwn: false, OR: [{ inDirectory: true }, { eceId: null }] },
    select: { id: true, name: true, website: true, promotionUrl: true, providesMeals: true, providesTransport: true },
  });
  const sites = new Map<string, CrawlCentre[]>();
  for (const centre of centres) {
    for (const url of new Set([centre.promotionUrl, centre.website].filter(Boolean))) {
      sites.set(url, [...(sites.get(url) ?? []), centre]);
    }
  }

  const aiReady = config.ai.AI_PROVIDER === "ollama";
  if (!aiReady) notes.push("Local AI is off, so websites were not read for promotions.");
  const today = new Date().toISOString().slice(0, 10);
  progress = { ...progress, phase: "Reading competitor websites", done: 0, total: sites.size };

  let aiFailures = 0;
  for (const [site, siteCentres] of sites) {
    progress = { ...progress, done: progress.done + 1 };
    if (!aiReady) break;
    counts.sitesChecked++;
    try {
      const pages = await readSite(site);
      if (!pages) {
        counts.sitesFailed++;
        continue;
      }
      const names = siteCentres.map((centre) => centre.name);
      const pageText = [pages.text, ...pages.records.map((record) => record.text)].join("\n");
      const excerpt = buildPageExcerpt({ text: pages.text, records: pages.records, centreNames: names }, EXCERPT_MAX_CHARS);
      let findings: SiteFindings = { promotions: [], meals: null, transport: null };
      if (excerpt) {
        try {
          const raw = await runLocalJson(config.ai, buildExtractionMessages(excerpt, names, today), EXTRACTION_SCHEMA);
          findings = readExtraction(raw, names, pageText, centreWindows(pages.text, names));
        } catch (error) {
          // Without a reading, nothing about this site is changed.
          aiFailures++;
          counts.sitesFailed++;
          log.warn({ error: String(error), site }, "Sector sync: extraction failed");
          continue;
        }
      }
      await applyFindings(site, pages, pageText, findings, siteCentres, counts);
    } catch (error) {
      counts.sitesFailed++;
      log.warn({ error: String(error), site }, "Sector sync: site failed");
    }
    await sleep(REQUEST_DELAY_MS);
  }
  if (aiFailures > 0) notes.push(`The local AI could not read ${aiFailures} site${aiFailures === 1 ? "" : "s"}; their promotions were left as they were.`);
}

// --- The run -------------------------------------------------------------------------

export function isSectorSyncRunning(): boolean {
  return progress.running;
}

export async function runSectorSync(config: SectorSyncConfig, trigger: "scheduled" | "manual", log: Logger): Promise<number | null> {
  if (progress.running) return null;
  progress = { running: true, runId: null, phase: "Starting", done: 0, total: 0 };
  const counts: Counts = { centresAdded: 0, centresUpdated: 0, centresClosed: 0, sitesChecked: 0, sitesFailed: 0, promotionsAdded: 0, promotionsEnded: 0 };
  const notes: string[] = [];
  let runId: number | null = null;

  try {
    const run = await prisma.sectorCrawlRun.create({ data: { trigger } });
    runId = run.id;
    progress = { ...progress, runId, phase: "Reading the Ministry of Education ECE directory" };
    log.info({ trigger }, "Sector sync: started");

    const ownCentres = await prisma.centreReference.findMany({ where: { ignored: false, licenseNumber: { not: null } }, select: { licenseNumber: true } });
    const ownIds = new Set(ownCentres.map((centre) => centre.licenseNumber!));

    let directory: DirectoryService[] = [];
    try {
      directory = await fetchDirectoryServices([...ownIds]);
    } catch (error) {
      notes.push("The ECE directory could not be reached, so centre details were not refreshed.");
      log.warn({ error: String(error) }, "Sector sync: directory unavailable");
    }

    if ((await prisma.sectorCentre.count()) === 0) {
      progress = { ...progress, phase: "Importing the competitor spreadsheet" };
      await seedFromCsv(config, directory, ownIds, counts, log);
    }
    if (directory.length > 0) {
      progress = { ...progress, phase: "Updating centres from the directory" };
      await refreshFromDirectory(directory, ownIds, counts);
    }
    await fileUnverifiedUnderGroups(counts);
    await fillMissingWebsites();
    await crawlWebsites(config, counts, notes, log);

    await prisma.sectorCrawlRun.update({
      where: { id: runId },
      data: { ...counts, status: "completed", finishedAt: new Date(), message: notes.join(" ") },
    });
    await advanceSyncCursor(COMPLETED_KEY, BigInt(Date.now()));
    log.info(counts, "Sector sync: finished");
  } catch (error) {
    log.warn({ error: String(error) }, "Sector sync: failed");
    if (runId != null) {
      await prisma.sectorCrawlRun
        .update({ where: { id: runId }, data: { ...counts, status: "failed", finishedAt: new Date(), message: [...notes, String(error)].join(" ").slice(0, 2000) } })
        .catch(() => undefined);
    }
  } finally {
    progress = { running: false, runId, phase: "", done: 0, total: 0 };
  }
  return runId;
}

// A run still "running" in the history while none is in this process was cut
// short by a restart. Its completion time was never recorded, so the
// scheduled check below starts a fresh one.
export async function markInterruptedSectorRuns(): Promise<void> {
  if (progress.running) return;
  await prisma.sectorCrawlRun.updateMany({
    where: { status: "running" },
    data: { status: "failed", finishedAt: new Date(), message: "Interrupted by a restart; the next check runs it again." },
  });
}

// The scheduled check: runs when nothing has been collected yet, or the last
// complete update is more than a month old.
export async function syncSectorIfStale(config: SectorSyncConfig, log: Logger): Promise<void> {
  const completedAt = Number(await readSyncCursor(COMPLETED_KEY));
  const empty = (await prisma.sectorCentre.count()) === 0;
  if (!empty && completedAt > 0 && Date.now() - completedAt < SECTOR_REFRESH_AFTER_MS) return;
  await runSectorSync(config, "scheduled", log);
}

export async function lastSectorSyncCompletedAt(): Promise<string | null> {
  const completedAt = Number(await readSyncCursor(COMPLETED_KEY));
  return completedAt > 0 ? new Date(completedAt).toISOString() : null;
}
