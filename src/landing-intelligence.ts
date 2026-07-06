import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

import type { FastifyBaseLogger } from "fastify";

import type { AiConfig } from "./ai/config.js";
import { runLocalChat } from "./ai/client.js";
import { prisma } from "./db.js";
import { normalizeCentreContactName, readCentreContactList } from "./storage/centre-contact-store.js";

export type LandingIntelligenceItem = {
  id: string;
  kind: "news" | "weather" | "ai-model" | "system";
  title: string;
  brief: string;
  href: string | null;
  source: string;
  publishedAt: string | null;
  urgent: boolean;
};

export type LandingAiModelRecommendation = {
  currentModel: string;
  recommendedModel: string;
  fallbackModel: string | null;
  secondaryFallbackModel: string | null;
  isUpgrade: boolean;
  sellingPoint: string;
  updatePrompt: string;
  comparison: string;
  computerSpec: string;
  canOperate: boolean;
  rollbackPrompt: string | null;
  deletionPrompt: string | null;
};

export type LandingIntelligenceFeed = {
  generatedAt: string | null;
  nextRefreshAt: string | null;
  status: "idle" | "refreshing" | "ready" | "error";
  error: string | null;
  items: LandingIntelligenceItem[];
  aiModel: LandingAiModelRecommendation;
};

type RssItem = {
  title: string;
  link: string | null;
  source: string;
  publishedAt: string | null;
  description: string;
};

type OwnedKindergartenReference = {
  name: string;
  normalizedName: string;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const GENERAL_NEWS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9000;
const RECOMMENDED_MODEL = "qwen3:8b";
const ECE_TERMS = '("Inspired Kindergartens" OR "early childhood education" OR kindergarten OR ECE OR preschool OR "childcare centre")';
const NEWS_QUERY_TIERS = [
  `${ECE_TERMS} Tauranga`,
  `${ECE_TERMS} "Bay of Plenty"`,
  `${ECE_TERMS} New Zealand`,
];

const BRAND_QUERIES = [
  '"Inspired Kindergartens"',
  '"Ngā Kōhungahunga Manawanui"',
  '("Inspired Kindergartens" OR "Ngā Kōhungahunga Manawanui")',
  '("Peter Monteith" AND kindergarten)',
];

const SECTOR_SCRAPE_SOURCES = [
  { name: "RNZ Education", url: "https://www.rnz.co.nz/news/education" },
  { name: "NZ Herald Education", url: "https://www.nzherald.co.nz/topic/education/" },
];

const weatherLocations = [
  { name: "Bay of Plenty", latitude: -37.6878, longitude: 176.1651 },
];

const severeWeatherCodes = new Set([95, 96, 99]);

let latestFeed: LandingIntelligenceFeed = {
  generatedAt: null,
  nextRefreshAt: null,
  status: "idle",
  error: null,
  items: [],
  aiModel: buildAiModelRecommendation("llama3.1:8b"),
};
let refreshInFlight: Promise<LandingIntelligenceFeed> | null = null;
let intervalStarted = false;

const SNAPSHOT_PATH = join(process.cwd(), "logs", "landing-intelligence-latest.json");

async function loadFeedSnapshot(): Promise<LandingIntelligenceFeed | null> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw) as LandingIntelligenceFeed;
  } catch {
    return null;
  }
}

async function saveFeedSnapshot(feed: LandingIntelligenceFeed) {
  await mkdir(join(process.cwd(), "logs"), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(feed), "utf8");
}

function decodeXml(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll(/&nbsp;/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll(/<[^>]+>/g, "")
    .trim();
}

function stripGoogleNewsRedirect(link: string | null) {
  if (!link) return null;

  try {
    const url = new URL(link);
    const nested = url.searchParams.get("url");

    return nested || link;
  } catch {
    return link;
  }
}

function rssUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-NZ",
    gl: "NZ",
    ceid: "NZ:en",
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Marketing Helper AI local dashboard" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];
    const value = (tag: string) => {
      const found = item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));

      return found?.[1] ? decodeXml(found[1]) : "";
    };
    const sourceMatch = item.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);

    return {
      title: value("title"),
      link: stripGoogleNewsRedirect(value("link") || null),
      source: sourceMatch?.[1] ? decodeXml(sourceMatch[1]) : "Google News",
      publishedAt: value("pubDate") ? new Date(value("pubDate")).toISOString() : null,
      description: value("description"),
    };
  });
}

function sentenceCaseBrief(value: string, fallback: string) {
  const cleaned = decodeXml(value).replace(/\s+-\s+[^-]+$/, "").trim();
  const brief = cleaned || fallback;

  return brief.length > 185 ? `${brief.slice(0, 182).trim()}...` : brief;
}

function isStaleRssItem(item: RssItem, now: number, maxAgeMs: number) {
  if (!item.publishedAt) return true;

  const publishedAt = new Date(item.publishedAt).getTime();

  return !Number.isFinite(publishedAt) || now - publishedAt > maxAgeMs;
}

const LOCAL_REGION_PATTERN = /bay of plenty|tauranga|katikati|waihi|te puke|te puna|omokoroa|matua|papamoa|welcome bay|thames coast|whakamarama|whangamata|maungatapu|otumoetai/i;
const OTHER_REGION_PATTERN = /\b(auckland|wellington|christchurch|hamilton|dunedin|nelson|gisborne|taranaki|manawatu|wairarapa|marlborough|southland|otago|northland|hawke'?s bay|west coast|canterbury|waikato)\b/i;
const NATIONWIDE_PATTERN = /new zealand|nationwide|national\b|across the country|whole country|state of emergency/i;

function isUrgentNews(item: RssItem) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const isBrandMention = text.includes("inspired kindergarten") || text.includes("inspired kindergartens");
  const isWeatherWarning = /severe weather|red warning|orange warning|state of emergency|evacuat|closed|closure/.test(text);

  if (!isWeatherWarning) {
    return isBrandMention;
  }

  const mentionsLocalRegion = LOCAL_REGION_PATTERN.test(text);
  const mentionsOtherRegion = OTHER_REGION_PATTERN.test(text);
  const mentionsNationwide = NATIONWIDE_PATTERN.test(text);

  if (mentionsLocalRegion) return true;
  if (mentionsOtherRegion && !mentionsNationwide) return false;

  return isBrandMention || mentionsNationwide;
}

function findOwnedKindergartenMention(item: RssItem, references: readonly OwnedKindergartenReference[]) {
  const normalizedText = normalizeCentreContactName(`${item.title} ${item.description}`);

  return references.find((reference) => reference.normalizedName && normalizedText.includes(reference.normalizedName)) ?? null;
}

function toNewsFeedItem(
  item: RssItem,
  index: number,
  references: readonly OwnedKindergartenReference[],
  kind: "news" | "weather" = "news",
): LandingIntelligenceItem {
  const ownedMention = findOwnedKindergartenMention(item, references);

  return {
    id: `${kind}-${index}-${item.publishedAt ?? item.title}`,
    kind,
    title: item.title,
    brief: ownedMention
      ? `${ownedMention.name} is one of our kindergartens. ${sentenceCaseBrief(item.description, "Relevant update for early childhood and kindergarten planning.")}`
      : sentenceCaseBrief(item.description, "Relevant update for early childhood and kindergarten planning."),
    href: item.link,
    source: item.source,
    publishedAt: item.publishedAt,
    urgent: isUrgentNews(item) || ownedMention != null,
  };
}

async function readOwnedKindergartenReferences(): Promise<OwnedKindergartenReference[]> {
  const [contacts, centres] = await Promise.all([
    readCentreContactList(),
    prisma.centreReference.findMany({ select: { name: true } }).catch(() => []),
  ]);
  const names = new Set<string>();

  for (const contact of contacts) {
    names.add(contact.kindergarten);
  }
  for (const centre of centres) {
    names.add(centre.name);
  }

  return [...names]
    .map((name) => ({
      name,
      normalizedName: normalizeCentreContactName(name),
    }))
    .filter((reference) => reference.normalizedName.length > 0)
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length);
}

const NEWS_ITEM_TARGET = 6;

async function fetchNewsItems() {
  const references = await readOwnedKindergartenReferences();
  const now = Date.now();
  const seen = new Set<string>();
  const fresh: RssItem[] = [];

  const scraped = dedupeRssItems(await fetchSectorScrapedItems().catch(() => []))
    .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));

  for (const item of scraped) {
    if (fresh.length >= NEWS_ITEM_TARGET) break;

    const key = `${item.title}-${item.link ?? ""}`;

    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(item);
  }

  for (const query of NEWS_QUERY_TIERS) {
    if (fresh.length >= NEWS_ITEM_TARGET) break;

    const xml = await fetchText(rssUrl(query)).catch(() => "");
    const tierItems = parseRss(xml)
      .filter((item) => !isStaleRssItem(item, now, GENERAL_NEWS_MAX_AGE_MS))
      .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));

    for (const item of tierItems) {
      const key = `${item.title}-${item.link ?? ""}`;

      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(item);

      if (fresh.length >= NEWS_ITEM_TARGET) break;
    }
  }

  return fresh.map((item, index) => toNewsFeedItem(item, index, references, "news"));
}

const BRAND_NEWS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function fetchBrandMentionItems(): Promise<LandingIntelligenceItem[]> {
  const references = await readOwnedKindergartenReferences();
  const queries = [
    ...BRAND_QUERIES,
    ...references.map((reference) => `"${reference.name}" kindergarten`),
  ];
  const now = Date.now();
  const results = await Promise.allSettled(queries.map((query) => fetchText(rssUrl(query))));
  const seen = new Set<string>();
  const items: LandingIntelligenceItem[] = [];

  for (const result of results) {
    const xml = result.status === "fulfilled" ? result.value : "";
    const matches = parseRss(xml).filter((item) => !isStaleRssItem(item, now, BRAND_NEWS_MAX_AGE_MS));

    for (const item of matches) {
      const key = `${item.title}-${item.link ?? ""}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const feedItem = toNewsFeedItem(item, items.length, references, "news");
      items.push({ ...feedItem, urgent: true });
    }
  }

  return items;
}

const ECE_RELEVANCE_PATTERN = /kindergarten|early childhood|\bece\b|preschool|pre-school|kōhanga|kohanga/i;

function parseRnzEducationListing(html: string): RssItem[] {
  const blockPattern = /<h3 class="o-digest__headline"[^>]*><a[^>]*href="(\/news\/[^"]+)"[^>]*>((?:[^<])*)<\/a><\/h3>[\s\S]{0,400}?class="o-kicker__time kicker-item">([^<]+)</g;

  return [...html.matchAll(blockPattern)].map((match) => {
    const [, path, title, dateText] = match;
    const publishedAt = new Date(dateText.trim()).toISOString();

    return {
      title: decodeXml(title),
      link: `https://www.rnz.co.nz${path}`,
      source: "RNZ Education",
      publishedAt: Number.isNaN(Date.parse(dateText.trim())) ? null : publishedAt,
      description: "",
    };
  });
}

function parseNzHeraldEducationListing(html: string): RssItem[] {
  const blockPattern = /"headline":"((?:[^"\\]|\\.)*)","displayDate":"([^"]*)","publishDate":"([^"]*)","isUpdated":[a-z]+,"description":"((?:[^"\\]|\\.)*)"[^}]*?"websiteUrl":"([^"]*)"/g;

  return [...html.matchAll(blockPattern)].map((match) => {
    const [, title, , publishDate, description, websiteUrl] = match;
    const link = websiteUrl.startsWith("http") ? websiteUrl : `https://www.nzherald.co.nz${websiteUrl}`;

    return {
      title: title.replace(/\\"/g, '"').replace(/\\u002F/g, "/"),
      link,
      source: "NZ Herald Education",
      publishedAt: publishDate && !Number.isNaN(Date.parse(publishDate)) ? new Date(publishDate).toISOString() : null,
      description: description.replace(/\\"/g, '"'),
    };
  });
}

async function fetchSectorScrapedItems(): Promise<RssItem[]> {
  const [rnzHtml, nzhHtml] = await Promise.all([
    fetchText(SECTOR_SCRAPE_SOURCES[0].url).catch(() => ""),
    fetchText(SECTOR_SCRAPE_SOURCES[1].url).catch(() => ""),
  ]);
  const now = Date.now();

  const rnzItems = parseRnzEducationListing(rnzHtml).filter(
    (item) => ECE_RELEVANCE_PATTERN.test(item.title) && !isStaleRssItem(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );
  const nzhItems = parseNzHeraldEducationListing(nzhHtml).filter(
    (item) => ECE_RELEVANCE_PATTERN.test(item.title) && !isStaleRssItem(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );

  return [...rnzItems, ...nzhItems];
}

function dedupeRssItems(items: RssItem[]): RssItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.title}-${item.link ?? ""}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describeWeatherCode(code: number) {
  if (severeWeatherCodes.has(code)) return "thunderstorm risk";
  if ([80, 81, 82].includes(code)) return "heavy showers";
  if ([61, 63, 65, 66, 67].includes(code)) return "rain";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([45, 48].includes(code)) return "fog";

  return "settled conditions";
}

function isSevereDay(code: number, rain: number, wind: number) {
  return severeWeatherCodes.has(code) || rain >= 40 || wind >= 65;
}

async function fetchWeatherItems(): Promise<LandingIntelligenceItem[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

  const results = await Promise.allSettled(
    weatherLocations.map(async (location) => {
      const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        daily: "weather_code,precipitation_sum,wind_speed_10m_max",
        timezone: "Pacific/Auckland",
        forecast_days: "3",
      });
      const payload = await fetchText(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      const data = JSON.parse(payload) as {
        daily?: {
          time?: string[];
          weather_code?: number[];
          precipitation_sum?: number[];
          wind_speed_10m_max?: number[];
        };
      };
      const days = (data.daily?.time ?? [])
        .map((date, i) => ({
          date,
          code: data.daily?.weather_code?.[i] ?? 0,
          rain: data.daily?.precipitation_sum?.[i] ?? 0,
          wind: data.daily?.wind_speed_10m_max?.[i] ?? 0,
        }))
        .filter((day) => day.date >= today);

      if (days.length === 0) return null;

      const severeDay = days.find((day) => isSevereDay(day.code, day.rain, day.wind));
      const focusDay = severeDay ?? days[0];
      const urgent = severeDay != null;
      const isToday = focusDay.date === today;
      const dayLabel = isToday ? "today" : new Date(`${focusDay.date}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long" });

      return {
        id: `weather-forecast-${location.name}`,
        kind: "weather" as const,
        title: `${location.name}: ${urgent ? "weather watch" : "weather check"}`,
        brief: `${describeWeatherCode(focusDay.code)} forecast ${dayLabel}, ${Math.round(focusDay.rain)} mm rain and max wind near ${Math.round(focusDay.wind)} km/h. Check staffing, excursions, and family comms if conditions change.`,
        href: "https://www.metservice.com/warnings/home",
        source: "Open-Meteo forecast",
        publishedAt: `${focusDay.date}T00:00:00.000+13:00`,
        urgent,
      };
    }),
  );

  const fulfilled = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((item): item is Exclude<typeof item, null> => item != null);

  if (fulfilled.length === 0) {
    return [
      {
        id: "weather-unavailable",
        kind: "weather",
        title: "Weather forecast unavailable",
        brief: "The Open-Meteo forecast service could not be reached. Check MetService directly for current conditions and warnings.",
        href: "https://www.metservice.com/warnings/home",
        source: "Open-Meteo forecast",
        publishedAt: null,
        urgent: false,
      },
    ];
  }

  const urgent = fulfilled.filter((item) => item.urgent);

  if (urgent.length > 0) {
    return urgent.slice(0, 2);
  }

  return fulfilled.slice(0, 1);
}

function getComputerSpec() {
  const totalRamGB = os.totalmem() / 1024 / 1024 / 1024;
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.replace(/\s+/g, " ").trim() || "Unknown CPU";
  const logicalCores = cpus.length;
  const canOperate = totalRamGB >= 8;

  return {
    totalRamGB,
    cpuModel,
    logicalCores,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    canOperate,
  };
}

function buildAiModelRecommendation(
  currentModel: string,
  fallbackModel: string | null = process.env.AI_CHAT_MODEL_FALLBACK || null,
  secondaryFallbackModel: string | null = process.env.AI_CHAT_MODEL_SECONDARY_FALLBACK || null,
): LandingAiModelRecommendation {
  const normalised = currentModel.trim().toLowerCase();
  const isUpgrade = normalised !== RECOMMENDED_MODEL;
  const spec = getComputerSpec();
  const currentSize = normalised.startsWith("llama3.1") ? "4.9GB, 128K context" : "installed/current local model";
  const recommendedSize = "5.2GB, 40K context";

  return {
    currentModel,
    recommendedModel: RECOMMENDED_MODEL,
    fallbackModel,
    secondaryFallbackModel,
    isUpgrade,
    sellingPoint: isUpgrade
      ? "Qwen3 8B is a same-size local chat upgrade with stronger reasoning, tool-use support, and multi-turn instruction following than the current Llama 3.1 8B default."
      : "Qwen3 8B is already selected for local AI chat.",
    updatePrompt: isUpgrade
      ? `Pull ${RECOMMENDED_MODEL} and set AI_CHAT_MODEL=${RECOMMENDED_MODEL} for the local chat server.`
      : "No model update is currently recommended.",
    comparison: `${currentModel}: ${currentSize}. ${RECOMMENDED_MODEL}: ${recommendedSize}, with Ollama library tags for tools and thinking plus stronger reasoning/tool-use positioning.`,
    computerSpec: `${spec.cpuModel}; ${spec.logicalCores} logical cores; ${spec.totalRamGB.toFixed(1)}GB RAM; ${spec.platform}. ${spec.canOperate ? "This is suitable for an 8B Ollama model in local chat." : "This may be tight for an 8B Ollama model; keep the fallback model available."}`,
    canOperate: spec.canOperate,
    rollbackPrompt: fallbackModel ? `Rollback available to ${fallbackModel}. The previous model is kept as fallback and is not deleted during update.` : null,
    deletionPrompt: secondaryFallbackModel
      ? `Secondary fallback ${secondaryFallbackModel} can be deleted after rollback safety is confirmed.`
      : null,
  };
}

function buildAiModelItem(aiModel: LandingAiModelRecommendation): LandingIntelligenceItem {
  return {
    id: "ai-model-recommendation",
    kind: "ai-model",
    title: aiModel.isUpgrade ? `AI model upgrade available: ${aiModel.recommendedModel}` : "AI model is current",
    brief: aiModel.sellingPoint,
    href: "https://ollama.com/library/qwen3",
    source: `Current: ${aiModel.currentModel}`,
    publishedAt: null,
    urgent: false,
  };
}

async function crawlOllamaModelPages(currentModel: string) {
  await Promise.allSettled([
    fetchText("https://ollama.com/library/qwen3"),
    fetchText("https://ollama.com/library/llama3.1"),
  ]);

  return buildAiModelRecommendation(currentModel);
}

async function refineBriefsWithAi(config: AiConfig, items: LandingIntelligenceItem[]) {
  if (config.AI_PROVIDER !== "ollama" || items.length === 0) {
    return items;
  }

  try {
    const answer = await runLocalChat(
      { ...config, AI_TIMEOUT_MS: Math.min(config.AI_TIMEOUT_MS, 12000) },
      [
        {
          role: "system",
          content:
            "Rewrite RSS feed briefs for a kindergarten marketing dashboard. Return strict JSON only: an array of {id, brief}. Each brief must be one sentence, under 24 words, factual, and not sensational.",
        },
        {
          role: "user",
          content: JSON.stringify(
            items.map((item) => ({ id: item.id, title: item.title, brief: item.brief })),
          ),
        },
      ],
    );
    const parsed = JSON.parse(answer) as { id?: string; brief?: string }[];
    const byId = new Map(parsed.map((item) => [item.id, item.brief]));

    return items.map((item) => {
      const brief = byId.get(item.id);

      return brief ? { ...item, brief: sentenceCaseBrief(brief, item.brief) } : item;
    });
  } catch {
    return items;
  }
}

async function logFeed(feed: LandingIntelligenceFeed) {
  await mkdir(join(process.cwd(), "logs"), { recursive: true });
  await appendFile(
    join(process.cwd(), "logs", "landing-intelligence-feed.jsonl"),
    `${JSON.stringify(feed)}\n`,
    "utf8",
  );
}

export function getLandingIntelligenceFeed() {
  return latestFeed;
}

export async function refreshLandingIntelligenceFeed(config: AiConfig, logger?: FastifyBaseLogger) {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  latestFeed = { ...latestFeed, status: "refreshing", error: null };
  refreshInFlight = (async () => {
    const generatedAt = new Date();
    const aiModel = await crawlOllamaModelPages(config.AI_CHAT_MODEL);

    try {
      const [news, weather, brandMentions] = await Promise.all([
        fetchNewsItems().then((result) => {
          logger?.info({ count: result.length }, "landing-intelligence: news items fetched");
          return result;
        }),
        fetchWeatherItems().then((result) => {
          logger?.info({ count: result.length }, "landing-intelligence: weather items fetched");
          return result;
        }),
        fetchBrandMentionItems().then((result) => {
          logger?.info({ count: result.length }, "landing-intelligence: brand mention items fetched");
          return result;
        }),
      ]);
      const unique = new Map<string, LandingIntelligenceItem>();

      for (const item of [...brandMentions, ...weather, ...news, ...(aiModel.isUpgrade ? [buildAiModelItem(aiModel)] : [])]) {
        unique.set(`${item.title}-${item.href ?? ""}`, item);
      }

      const ranked = [...unique.values()].sort((left, right) => Number(right.urgent) - Number(left.urgent));
      const items = await refineBriefsWithAi(config, ranked.slice(0, 8));
      const feed: LandingIntelligenceFeed = {
        generatedAt: generatedAt.toISOString(),
        nextRefreshAt: new Date(generatedAt.getTime() + FIFTEEN_MINUTES_MS).toISOString(),
        status: "ready",
        error: null,
        items,
        aiModel,
      };

      latestFeed = feed;
      await logFeed(feed);
      await saveFeedSnapshot(feed).catch(() => undefined);
      return feed;
    } catch (error) {
      const previousItems = latestFeed.items.length ? latestFeed.items : [buildAiModelItem(aiModel)];
      const feed: LandingIntelligenceFeed = {
        generatedAt: generatedAt.toISOString(),
        nextRefreshAt: new Date(generatedAt.getTime() + FIFTEEN_MINUTES_MS).toISOString(),
        status: "error",
        error: "Some feed sources did not respond in time. Showing the latest available items.",
        items: previousItems,
        aiModel,
      };

      latestFeed = feed;
      logger?.error({ error }, "Landing intelligence feed refresh failed");
      await logFeed(feed).catch(() => undefined);
      return feed;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function startLandingIntelligenceFeedLoop(config: AiConfig, logger?: FastifyBaseLogger) {
  if (intervalStarted) {
    return;
  }

  intervalStarted = true;

  const snapshot = await loadFeedSnapshot();

  latestFeed = {
    ...(snapshot ?? latestFeed),
    aiModel: buildAiModelRecommendation(config.AI_CHAT_MODEL),
  };
  void refreshLandingIntelligenceFeed(config, logger);

  const timer = setInterval(() => {
    void refreshLandingIntelligenceFeed(config, logger);
  }, FIFTEEN_MINUTES_MS);

  timer.unref();
}
