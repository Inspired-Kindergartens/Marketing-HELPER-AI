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
  searchTexts?: string[];
};

type RssItem = {
  title: string;
  link: string | null;
  source: string;
  author?: string | null;
  publishedAt: string | null;
  description: string;
};

type NewsCandidateAssessment = {
  accepted: boolean;
  score: number;
  reasons: string[];
};

export type OwnedKindergartenReference = {
  name: string;
  normalizedName: string;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const GENERAL_NEWS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BRAND_NEWS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9000;
const RECOMMENDED_MODEL = "qwen3:8b";
const ECE_TERMS =
  '("early childhood" OR "early childhood education" OR ECE OR kindergarten OR preschool OR "pre-school" OR childcare OR "childcare centre" OR "child care" OR "early learning")';
export const NEWS_QUERY_TIERS = [
  `${ECE_TERMS} "Bay of Plenty"`,
  `${ECE_TERMS} Tauranga`,
  `${ECE_TERMS} (Rotorua OR Taupo OR Whakatane OR Opotiki OR Kawerau)`,
  `${ECE_TERMS} "New Zealand"`,
  `${ECE_TERMS} (NZ OR Aotearoa)`,
  `${ECE_TERMS} (Australia OR Australian)`,
];
export const SOURCE_SPECIFIC_NEWS_QUERIES = [
  `${ECE_TERMS} RNZ`,
  `${ECE_TERMS} site:rnz.co.nz`,
  `${ECE_TERMS} "NZ Herald"`,
  `${ECE_TERMS} site:nzherald.co.nz`,
  `${ECE_TERMS} Stuff`,
  `${ECE_TERMS} site:stuff.co.nz`,
  `${ECE_TERMS} SunLive`,
  `${ECE_TERMS} site:sunlive.co.nz`,
  `${ECE_TERMS} "Bay of Plenty" (SunLive OR Stuff OR "NZ Herald" OR RNZ)`,
  `${ECE_TERMS} Tauranga (SunLive OR Stuff OR "NZ Herald" OR RNZ)`,
  `${ECE_TERMS} "Bay of Plenty" site:sunlive.co.nz`,
  `${ECE_TERMS} Tauranga site:sunlive.co.nz`,
  `${ECE_TERMS} "Bay of Plenty" site:stuff.co.nz`,
  `${ECE_TERMS} Tauranga site:stuff.co.nz`,
  `${ECE_TERMS} "Bay of Plenty" site:nzherald.co.nz`,
  `${ECE_TERMS} Tauranga site:nzherald.co.nz`,
  `${ECE_TERMS} NZME`,
  `${ECE_TERMS} ("Education Review Office" OR ERO)`,
  `${ECE_TERMS} site:ero.govt.nz`,
  `${ECE_TERMS} ("Ministry of Education" OR MoE)`,
  `${ECE_TERMS} site:education.govt.nz`,
  `${ECE_TERMS} ("NZEI" OR "NZEI Te Riu Roa")`,
  `${ECE_TERMS} site:nzei.org.nz`,
  `${ECE_TERMS} "press release" (NZME OR ERO OR "Education Review Office" OR "Ministry of Education" OR MoE OR NZEI)`,
];

export const BRAND_QUERIES: { query: string; mustContain: string[] }[] = [
  { query: '"Inspired Kindergartens"', mustContain: ["inspired"] },
  {
    query: '"Tauranga Regional Free Kindergarten Association"',
    mustContain: ["tauranga regional free kindergarten association"],
  },
  { query: '"Ngā Kōhungahunga Manawanui"', mustContain: ["nga kohungahunga manawanui"] },
  { query: '("Peter Monteith" AND kindergarten)', mustContain: ["peter monteith"] },
];

export const SECTOR_WATCH_QUERIES: { query: string; mustContain: string[] }[] = [
  { query: '"Enviroschools"', mustContain: ["enviroschools"] },
  { query: '"NZIE" (kindergarten OR ECE OR "early childhood")', mustContain: ["nzie"] },
  { query: '"Kindergartens Aotearoa"', mustContain: ["kindergartens aotearoa"] },
  { query: '("KA" AND kindergarten AND Aotearoa)', mustContain: ["kindergartens aotearoa"] },
  { query: '"Whānau Manaaki"', mustContain: ["whanau manaaki"] },
  { query: `${ECE_TERMS} NZME`, mustContain: ["nzme"] },
  { query: `${ECE_TERMS} ("Education Review Office" OR ERO)`, mustContain: ["education review office", "ero"] },
  { query: `${ECE_TERMS} ("Ministry of Education" OR MoE)`, mustContain: ["ministry of education", "moe"] },
  { query: `${ECE_TERMS} ("NZEI" OR "NZEI Te Riu Roa")`, mustContain: ["nzei", "nzei te riu roa"] },
  { query: '"Krissy Thompson" kindergarten', mustContain: ["krissy thompson"] },
];

const ECE_RELEVANCE_PATTERN =
  /kindergarten|early childhood|\bece\b|preschool|pre-school|childcare|child care|early learning|kōhanga|kohanga/i;

const ECE_STRONG_RELEVANCE_PATTERN = ECE_RELEVANCE_PATTERN;

const NZ_AU_STRONG_RELEVANCE_PATTERN =
  /\b(new zealand|nz|aotearoa|australia|australian|tauranga|bay of plenty|auckland|wellington|christchurch|hamilton|dunedin|rnz|nzei|nzme|inspired kindergartens|tauranga regional free kindergarten association|kindergartens aotearoa|whanau manaaki|whānau manaaki)\b|\.nz\b|\.au\b/i;
const NZ_AU_WEAK_AGENCY_PATTERN = /\b(education review office|ero|ministry of education|moe)\b/i;
const NZ_AU_URL_TITLE_PATTERN = /\b(new zealand|nz|aotearoa|australia|australian)\b|\.nz\b|\.au\b/i;
const BAY_OF_PLENTY_RELEVANCE_PATTERN =
  /\b(bay of plenty|tauranga|rotorua|taupo|whakatane|whakatāne|opotiki|ōpōtiki|kawerau|te puke|katikati|waihi|te puna|omokoroa|ōmokoroa|papamoa|pāpāmoa|welcome bay|matua|maungatapu|otumoetai|ōtūmoetai|whakamarama|whangamata)\b/i;
const NZ_AU_NEWS_HOSTS = new Set([
  "rnz.co.nz",
  "www.rnz.co.nz",
  "nzherald.co.nz",
  "www.nzherald.co.nz",
  "stuff.co.nz",
  "www.stuff.co.nz",
  "thepost.co.nz",
  "www.thepost.co.nz",
  "sunlive.co.nz",
  "www.sunlive.co.nz",
  "1news.co.nz",
  "www.1news.co.nz",
  "newsroom.co.nz",
  "www.newsroom.co.nz",
  "education.govt.nz",
  "www.education.govt.nz",
  "ero.govt.nz",
  "www.ero.govt.nz",
  "nzei.org.nz",
  "www.nzei.org.nz",
  "abc.net.au",
  "www.abc.net.au",
  "smh.com.au",
  "www.smh.com.au",
  "theage.com.au",
  "www.theage.com.au",
]);

const WATCHED_AUTHOR_NAMES = new Set(["sam sherwood"]);
const PAYWALLED_SOURCE_PATTERN = /\b(businessdesk|national business review|nbr|financial times|wall street journal|wsj|new york times|nytimes)\b/i;
const PAYWALL_MARKER_PATTERN = /\b(premium|paywall|subscriber only|subscribers only|subscription required|for subscribers|register to read|sign in to continue)\b/i;
const PAYWALLED_HOSTS = new Set([
  "businessdesk.co.nz",
  "www.businessdesk.co.nz",
  "nbr.co.nz",
  "www.nbr.co.nz",
  "ft.com",
  "www.ft.com",
  "wsj.com",
  "www.wsj.com",
  "nytimes.com",
  "www.nytimes.com",
]);
const BLOCKED_SOURCE_PATTERN = /\ballora\b[!\s]*(news|italian)/i;
const BLOCKED_HOSTS = new Set(["alloranews.com", "www.alloranews.com"]);
const NON_NEWS_ARTICLE_PATH_PATTERNS = [
  /^\/institution\/\d+\//i,
  /^\/vacancies\//i,
  /^\/jobs?\//i,
  /^\/careers?\//i,
];
const ERO_NEWS_OR_REPORT_PATTERN =
  /\b(report|review|news|media release|press release|announce|publishes|published|finds|study|evaluation|consultation|update|guidance|regulation|regulatory)\b/i;
const EDUCATION_GAZETTE_PATTERN =
  /\b(education gazette|gazette\.education\.govt\.nz)\b/i;
const JOB_POSTING_PATTERN =
  /\b(vacanc(?:y|ies)|job position|job listing|qualified ece teacher(?:s)?|qualified teacher(?:s)? wanted|now hiring|we are hiring|apply now|applications close|fixed term|full time|part time|reliever|teacher aide|position available)\b/i;

function isGroundedMatch(item: RssItem, mustContain: string[]) {
  const normalizedText = normalizeCentreContactName(`${item.title} ${item.description}`);

  return mustContain.some((term) => normalizedText.includes(term));
}

const RNZ_SCRAPE_SOURCES = [
  { name: "RNZ Education", url: "https://www.rnz.co.nz/news/education" },
  { name: "RNZ Crime and Justice", url: "https://www.rnz.co.nz/news/crime-and-justice" },
];

const NZ_HERALD_SCRAPE_SOURCES = [
  "https://www.nzherald.co.nz/topic/education/",
  "https://www.nzherald.co.nz/nz/",
];

const STUFF_SCRAPE_SOURCES = [
  "https://www.stuff.co.nz/nz-news/education",
  "https://www.stuff.co.nz/nz-news",
];

const SUNLIVE_SCRAPE_SOURCES = [
  "https://www.sunlive.co.nz/news/1_1_news.html",
  "https://www.sunlive.co.nz/news/1_1_news.html/page-1",
  "https://www.sunlive.co.nz/news/1_1_news.html/page-2",
];

const weatherLocations = [
  {
    name: "Bay of Plenty",
    latitude: -37.6878,
    longitude: 176.1651,
    href: "https://www.metservice.com/towns-cities/regions/bay-of-plenty/locations/tauranga",
  },
];

const WEATHER_WARNINGS_URL = "https://www.metservice.com/warnings/home";

const severeWeatherCodes = new Set([95, 96, 99]);

let latestFeed: LandingIntelligenceFeed = {
  generatedAt: null,
  nextRefreshAt: null,
  status: "idle",
  error: null,
  items: [],
  aiModel: buildAiModelRecommendation("llama3.1:8b"),
  searchTexts: [],
};
let refreshInFlight: Promise<LandingIntelligenceFeed> | null = null;
let intervalStarted = false;

const SNAPSHOT_PATH = join(process.cwd(), "logs", "landing-intelligence-latest.json");
const SEARCH_TEXTS_PATH = join(process.cwd(), "logs", "landing-intelligence-search-texts.json");

export function normalizeLandingIntelligenceSearchText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function readLandingIntelligenceSearchTexts(): Promise<string[]> {
  try {
    const raw = await readFile(SEARCH_TEXTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const texts: string[] = [];

    for (const value of parsed) {
      if (typeof value !== "string") continue;
      const normalized = normalizeLandingIntelligenceSearchText(value);
      const key = normalizeCentreContactName(normalized);

      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      texts.push(normalized);
    }

    return texts;
  } catch {
    return [];
  }
}

async function saveLandingIntelligenceSearchTexts(texts: string[]) {
  await mkdir(join(process.cwd(), "logs"), { recursive: true });
  await writeFile(SEARCH_TEXTS_PATH, JSON.stringify(texts, null, 2), "utf8");
}

export async function addLandingIntelligenceSearchText(value: string) {
  const normalized = normalizeLandingIntelligenceSearchText(value);

  if (!normalized) {
    throw new Error("Search text is required.");
  }

  const texts = await readLandingIntelligenceSearchTexts();
  const exists = texts.some((text) => normalizeCentreContactName(text) === normalizeCentreContactName(normalized));
  const next = exists ? texts : [...texts, normalized];

  await saveLandingIntelligenceSearchTexts(next);

  return next;
}

export async function removeLandingIntelligenceSearchText(value: string) {
  const normalized = normalizeLandingIntelligenceSearchText(value);
  const key = normalizeCentreContactName(normalized);
  const texts = await readLandingIntelligenceSearchTexts();
  const next = texts.filter((text) => normalizeCentreContactName(text) !== key);

  await saveLandingIntelligenceSearchTexts(next);

  return next;
}

async function loadFeedSnapshot(): Promise<LandingIntelligenceFeed | null> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    return sanitizeFeed(JSON.parse(raw) as LandingIntelligenceFeed);
  } catch {
    return null;
  }
}

async function saveFeedSnapshot(feed: LandingIntelligenceFeed) {
  await mkdir(join(process.cwd(), "logs"), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(sanitizeFeed(feed)), "utf8");
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

function rssItemIdentityKey(item: RssItem) {
  return `${normalizeCentreContactName(item.title)}-${normalizeCentreContactName(item.source)}`;
}

function hostnameForLink(link: string | null) {
  if (!link) return "";

  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isStandaloneVideoLink(link: string | null) {
  if (!link) return false;

  try {
    return /\/videos?\//i.test(new URL(link).pathname);
  } catch {
    return false;
  }
}

export function isLikelyPaywalledItem(item: {
  title: string;
  link: string | null;
  source: string;
  description: string;
}) {
  const text = `${item.title} ${item.source} ${item.description}`;

  if (PAYWALLED_SOURCE_PATTERN.test(text) || PAYWALL_MARKER_PATTERN.test(text)) return true;

  if (!item.link) return false;

  try {
    return PAYWALLED_HOSTS.has(new URL(item.link).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isBlockedSourceItem(item: {
  title: string;
  link: string | null;
  source: string;
  description: string;
}) {
  if (BLOCKED_SOURCE_PATTERN.test(item.source)) return true;

  const host = hostnameForLink(item.link);

  return host ? BLOCKED_HOSTS.has(host) : false;
}

export function isNzOrAustraliaRelatedItem(item: {
  title: string;
  link: string | null;
  source: string;
  description: string;
}) {
  const combined = `${item.title} ${item.description} ${item.source} ${item.link ?? ""}`;
  const host = hostnameForLink(item.link);

  if (host && NZ_AU_NEWS_HOSTS.has(host)) return true;
  if (NZ_AU_STRONG_RELEVANCE_PATTERN.test(combined)) return true;

  if (!NZ_AU_WEAK_AGENCY_PATTERN.test(combined)) return false;

  return NZ_AU_URL_TITLE_PATTERN.test(`${item.title} ${item.link ?? ""}`);
}

export function isLikelyNewsArticleItem(item: {
  title: string;
  link: string | null;
  source: string;
  description: string;
}) {
  const combined = `${item.title} ${item.description} ${item.source}`;
  const combinedWithLink = `${combined} ${item.link ?? ""}`;

  if (EDUCATION_GAZETTE_PATTERN.test(combinedWithLink)) return false;
  if (JOB_POSTING_PATTERN.test(`${item.title} ${item.description} ${item.source}`)) return false;
  if (/\bero\.govt\.nz\b/i.test(combined) && !ERO_NEWS_OR_REPORT_PATTERN.test(combined)) return false;

  if (!item.link) return true;

  try {
    const url = new URL(item.link);

    if (NON_NEWS_ARTICLE_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
      return false;
    }
  } catch {
    return true;
  }

  return true;
}

function urlSlugText(link: string | null) {
  if (!link) return "";

  try {
    const parts = new URL(link).pathname.split("/").filter(Boolean);
    const slug = parts.findLast((part) => !/^cms[a-z0-9]+$/i.test(part) && !/^\d+$/.test(part)) ?? "";

    return slug.replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

function relevanceTokens(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "cms",
    "down",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "its",
    "news",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "video",
    "videos",
    "with",
  ]);

  return normalizeCentreContactName(value)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function hasMeaningfulTitleOverlap(left: string, right: string) {
  const leftTokens = relevanceTokens(left);
  const rightTokens = new Set(relevanceTokens(right));

  if (leftTokens.length === 0 || rightTokens.size === 0) return false;

  const matches = leftTokens.filter((token) => rightTokens.has(token)).length;

  return matches >= Math.min(3, leftTokens.length) || matches / leftTokens.length >= 0.55;
}

function extractPublicVideoTitles(html: string) {
  const titles = new Set<string>();
  const add = (value: string) => {
    const cleaned = decodeXml(value).replace(/\s+/g, " ").trim();

    if (cleaned) titles.add(cleaned);
  };

  for (const match of html.matchAll(/"@type"\s*:\s*"VideoObject"[\s\S]{0,3000}/gi)) {
    const block = match[0];
    add(jsonStringProperty(block, "name"));
    add(jsonStringProperty(block, "headline"));
    add(jsonStringProperty(block, "title"));
  }

  for (const match of html.matchAll(/"video"\s*:\s*\{[\s\S]{0,3000}?\}/gi)) {
    const block = match[0];
    add(jsonStringProperty(block, "name"));
    add(jsonStringProperty(block, "headline"));
    add(jsonStringProperty(block, "title"));
  }

  for (const match of html.matchAll(/<[^>]+(?:data-video-title|data-title|aria-label)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }

  return [...titles];
}

function visibleBodyText(html: string) {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "");

  return decodeXml(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

function extractVisibleVideoTitles(html: string) {
  const titles = new Set<string>();
  const add = (value: string) => {
    const cleaned = decodeXml(value).replace(/\s+/g, " ").trim();

    if (cleaned) titles.add(cleaned);
  };
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "");
  const visibleBody = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");

  for (const match of visibleBody.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    add(match[1]);
  }

  for (const match of visibleBody.matchAll(/<[^>]+(?:data-video-title|data-title|aria-label)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }

  return [...titles];
}

export function isPublicFacingRelevantVideoPage(
  item: { title: string; link: string | null },
  html: string,
) {
  if (!isStandaloneVideoLink(item.link)) return true;

  if (/\b(video unavailable|video disabled|private video|removed|page not found|not available)\b/i.test(html)) {
    return false;
  }

  const hasPlayerEvidence =
    /"@type"\s*:\s*"VideoObject"/i.test(html) ||
    /<video\b/i.test(html) ||
    /\b(video-player|jwplayer|brightcove|data-video-id|data-video-title)\b/i.test(html);

  if (!hasPlayerEvidence) return false;

  const expected = `${item.title} ${urlSlugText(item.link)}`;

  if (!extractPublicVideoTitles(html).some((title) => hasMeaningfulTitleOverlap(title, expected))) {
    return false;
  }

  const visibleText = visibleBodyText(html);

  return (
    hasMeaningfulTitleOverlap(visibleText, expected) ||
    extractVisibleVideoTitles(html).some((title) => hasMeaningfulTitleOverlap(title, expected))
  );
}

async function hasVerifiablePublicContent(item: RssItem) {
  if (!isStandaloneVideoLink(item.link)) return true;

  const html = await fetchText(item.link ?? "").catch(() => "");

  return html ? isPublicFacingRelevantVideoPage(item, html) : false;
}

export function assessNewsCandidate(
  item: RssItem,
  now: number,
  maxAgeMs: number,
  references: readonly OwnedKindergartenReference[] = [],
  options: { requireEceRelevance?: boolean } = {},
): NewsCandidateAssessment {
  const requireEceRelevance = options.requireEceRelevance ?? true;
  const text = `${item.title} ${item.description} ${item.source}`;
  const host = hostnameForLink(item.link);
  const reasons: string[] = [];
  let score = 0;

  if (isStaleRssItem(item, now, maxAgeMs)) return { accepted: false, score: 0, reasons: ["stale"] };
  if (isBlockedSourceItem(item)) return { accepted: false, score: 0, reasons: ["blocked-source"] };
  if (isLikelyPaywalledItem(item)) return { accepted: false, score: 0, reasons: ["paywalled"] };
  if (!isLikelyNewsArticleItem(item)) return { accepted: false, score: 0, reasons: ["not-news-article"] };
  if (!isNzOrAustraliaRelatedItem(item)) return { accepted: false, score: 0, reasons: ["not-nz-au"] };

  if (ECE_STRONG_RELEVANCE_PATTERN.test(text)) {
    score += 40;
    reasons.push("ece");
  } else if (requireEceRelevance) {
    return { accepted: false, score: 0, reasons: ["not-ece"] };
  }

  if (BAY_OF_PLENTY_RELEVANCE_PATTERN.test(text) || BAY_OF_PLENTY_RELEVANCE_PATTERN.test(item.link ?? "")) {
    score += 90;
    reasons.push("bay-of-plenty");
  }

  const ownedMention = findOwnedKindergartenMention(item, references);

  if (ownedMention) {
    score += 120;
    reasons.push("owned-centre");
  }

  if (host && NZ_AU_NEWS_HOSTS.has(host)) {
    score += 25;
    reasons.push("trusted-source");
  }

  if (host.endsWith(".nz") || host.endsWith(".au")) {
    score += 10;
  }

  if (/\b(rnz|sunlive|stuff|nz herald|nzme)\b/i.test(item.source)) {
    score += 15;
  }

  const publishedAt = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;

  if (Number.isFinite(publishedAt) && publishedAt > 0) {
    const ageDays = Math.max(0, (now - publishedAt) / (24 * 60 * 60 * 1000));
    score += Math.max(0, 20 - ageDays);
  }

  return { accepted: true, score, reasons };
}

function isQualityNewsCandidate(
  item: RssItem,
  now: number,
  maxAgeMs: number,
  references: readonly OwnedKindergartenReference[] = [],
  requireEceRelevance = true,
) {
  return assessNewsCandidate(item, now, maxAgeMs, references, { requireEceRelevance }).accepted;
}

function isWatchedAuthor(item: RssItem) {
  return Boolean(item.author && WATCHED_AUTHOR_NAMES.has(normalizeCentreContactName(item.author)));
}

const LOCAL_REGION_PATTERN = /bay of plenty|tauranga|katikati|waihi|te puke|te puna|omokoroa|matua|papamoa|welcome bay|thames coast|whakamarama|whangamata|maungatapu|otumoetai/i;
const OTHER_REGION_PATTERN = /\b(auckland|wellington|christchurch|hamilton|dunedin|nelson|gisborne|taranaki|manawatu|wairarapa|marlborough|southland|otago|northland|hawke'?s bay|west coast|canterbury|waikato)\b/i;
const NATIONWIDE_PATTERN = /new zealand|nationwide|national\b|across the country|whole country|state of emergency/i;

function isUrgentNews(item: RssItem) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const isBrandMention = text.includes("inspired kindergarten") || text.includes("inspired kindergartens");
  const isWeatherWarning = /severe weather|red warning|orange warning|state of emergency|evacuat|closed|closure/.test(text);

  if (isWatchedAuthor(item)) return true;

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
    source: item.author ? `${item.source} / ${item.author}` : item.source,
    publishedAt: item.publishedAt,
    urgent: isUrgentNews(item) || ownedMention != null,
  };
}

export function isFreshFeedItem(item: LandingIntelligenceItem, now: number = Date.now()) {
  if (item.kind !== "news") return true;
  if (!item.publishedAt) return false;

  const publishedAt = new Date(item.publishedAt).getTime();

  if (!Number.isFinite(publishedAt)) return false;

  return now - publishedAt <= BRAND_NEWS_MAX_AGE_MS;
}

function isAllowedFeedItem(item: LandingIntelligenceItem, now: number = Date.now()) {
  if (item.kind !== "news") return true;

  return (
    isFreshFeedItem(item, now) &&
    !isBlockedSourceItem({
      title: item.title,
      link: item.href,
      source: item.source,
      description: item.brief,
    }) &&
    isLikelyNewsArticleItem({
      title: item.title,
      link: item.href,
      source: item.source,
      description: item.brief,
    }) &&
    isNzOrAustraliaRelatedItem({
      title: item.title,
      link: item.href,
      source: item.source,
      description: item.brief,
    })
  );
}

function sanitizeFeed(feed: LandingIntelligenceFeed): LandingIntelligenceFeed {
  return {
    ...feed,
    items: feed.items.filter(isAllowedFeedItem),
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

const NEWS_ITEM_TARGET = 12;
const NEWS_CANDIDATE_LIMIT = 80;

async function fetchNewsItems() {
  const references = await readOwnedKindergartenReferences();
  const searchTexts = await readLandingIntelligenceSearchTexts();
  const customQueries = searchTexts.flatMap((text) => [
    text,
    `${text} (New Zealand OR NZ OR Aotearoa OR Australia OR Australian)`,
  ]);
  const now = Date.now();
  const seen = new Set<string>();
  const candidates: RssItem[] = [];

  const addCandidate = (item: RssItem) => {
    if (candidates.length >= NEWS_CANDIDATE_LIMIT) return;
    const key = rssItemIdentityKey(item);

    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(item);
  };

  const scraped = dedupeRssItems(await fetchSectorScrapedItems().catch(() => []))
    .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));

  for (const item of scraped) {
    if (isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS, references)) {
      addCandidate(item);
    }
  }

  const rssQueries = [...customQueries, ...SOURCE_SPECIFIC_NEWS_QUERIES, ...NEWS_QUERY_TIERS];

  for (const [queryIndex, query] of rssQueries.entries()) {
    const isCustomQuery = queryIndex < customQueries.length;

    if (candidates.length >= NEWS_CANDIDATE_LIMIT && !isCustomQuery) break;

    const xml = await fetchText(rssUrl(query)).catch(() => "");
    const tierItems = parseRss(xml)
      .filter((item) => isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS, references))
      .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));

    for (const item of tierItems) {
      addCandidate(item);
    }
  }

  const ranked = candidates
    .map((item) => ({
      item,
      assessment: assessNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS, references),
    }))
    .filter(({ assessment }) => assessment.accepted)
    .sort((left, right) => {
      if (right.assessment.score !== left.assessment.score) return right.assessment.score - left.assessment.score;

      return (right.item.publishedAt ?? "").localeCompare(left.item.publishedAt ?? "");
    });
  const verified: typeof ranked = [];

  for (const candidate of ranked) {
    if (verified.length >= NEWS_ITEM_TARGET) break;
    if (await hasVerifiablePublicContent(candidate.item)) {
      verified.push(candidate);
    }
  }

  return verified.map(({ item }, index) => toNewsFeedItem(item, index, references, "news"));
}

async function fetchBrandMentionItems(): Promise<LandingIntelligenceItem[]> {
  const references = await readOwnedKindergartenReferences();
  const brandQueryCount = BRAND_QUERIES.length + references.length;
  const queries = [
    ...BRAND_QUERIES,
    ...references.map((reference) => ({
      query: `"${reference.name}" kindergarten`,
      mustContain: [reference.normalizedName],
    })),
    ...SECTOR_WATCH_QUERIES,
  ];
  const now = Date.now();
  const results = await Promise.allSettled(queries.map(({ query }) => fetchText(rssUrl(query))));
  const seen = new Set<string>();
  const items: LandingIntelligenceItem[] = [];

  for (const [index, result] of results.entries()) {
    const xml = result.status === "fulfilled" ? result.value : "";
    const { mustContain } = queries[index];
    const isBrandQuery = index < brandQueryCount;
    const matches = parseRss(xml).filter(
      (item) =>
        isQualityNewsCandidate(item, now, BRAND_NEWS_MAX_AGE_MS, references, false) &&
        isGroundedMatch(item, mustContain),
    );

    for (const item of matches) {
      const key = rssItemIdentityKey(item);

      if (seen.has(key)) continue;
      seen.add(key);
      if (!(await hasVerifiablePublicContent(item))) continue;

      const feedItem = toNewsFeedItem(item, items.length, references, "news");
      items.push({ ...feedItem, urgent: isBrandQuery });
    }
  }

  return items;
}

export function parseRnzListing(html: string, source = "RNZ"): RssItem[] {
  const blockPattern = /<h3 class="o-digest__headline"[^>]*>\s*<a[^>]*href="(\/news\/[^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>\s*<\/h3>[\s\S]{0,400}?class="o-kicker__time kicker-item">([^<]+)</g;

  return [...html.matchAll(blockPattern)].map((match) => {
    const [, path, title, dateText] = match;
    const parsed = Date.parse(dateText.trim());

    return {
      title: decodeXml(title),
      link: `https://www.rnz.co.nz${path}`,
      source,
      publishedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      description: "",
    };
  });
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\u002F/g, "/");
  }
}

function jsonStringProperty(block: string, property: string) {
  const found = block.match(new RegExp(`"${property}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i"));

  return found?.[1] ? decodeJsonString(found[1]) : "";
}

export function parseNzHeraldEducationListing(html: string): RssItem[] {
  const blockPattern = /"headline":"((?:[^"\\]|\\.)*)","displayDate":"([^"]*)","publishDate":"([^"]*)","isUpdated":[a-z]+,"description":"((?:[^"\\]|\\.)*)"[^}]*?"websiteUrl":"([^"]*)"/g;
  const genericBlockPattern = /\{[^{}]*"websiteUrl"\s*:\s*"[^"]+"[^{}]*\}|\{[^{}]*"headline"\s*:\s*"[^"]+"[^{}]*"websiteUrl"\s*:\s*"[^"]+"[^{}]*\}/g;

  const legacyItems = [...html.matchAll(blockPattern)].map((match) => {
    const [, title, , publishDate, description, websiteUrl] = match;
    const link = websiteUrl.startsWith("http") ? websiteUrl : `https://www.nzherald.co.nz${websiteUrl}`;

    return {
      title: decodeJsonString(title),
      link,
      source: "NZ Herald Education",
      publishedAt: publishDate && !Number.isNaN(Date.parse(publishDate)) ? new Date(publishDate).toISOString() : null,
      description: decodeJsonString(description),
    };
  });

  const genericItems: RssItem[] = [...html.matchAll(genericBlockPattern)]
    .map((match): RssItem | null => {
      const block = match[0];
      const title = jsonStringProperty(block, "headline");
      const websiteUrl = jsonStringProperty(block, "websiteUrl");
      const publishDate = jsonStringProperty(block, "publishDate") || jsonStringProperty(block, "displayDate");

      if (!title || !websiteUrl) return null;

      const link = websiteUrl.startsWith("http") ? websiteUrl : `https://www.nzherald.co.nz${websiteUrl}`;

      return {
        title,
        link,
        source: "NZ Herald Education",
        publishedAt: publishDate && !Number.isNaN(Date.parse(publishDate)) ? new Date(publishDate).toISOString() : null,
        description: jsonStringProperty(block, "description"),
      };
    })
    .filter((item): item is RssItem => item != null);

  return dedupeRssItems([...legacyItems, ...genericItems]);
}

export function parseStuffListing(html: string): RssItem[] {
  const genericBlockPattern = /\{[^{}]*(?:"headline"|"title")\s*:\s*"[^"]+"[^{}]*(?:"url"|"websiteUrl"|"canonicalUrl")\s*:\s*"[^"]+"[^{}]*\}|\{[^{}]*(?:"url"|"websiteUrl"|"canonicalUrl")\s*:\s*"[^"]+"[^{}]*(?:"headline"|"title")\s*:\s*"[^"]+"[^{}]*\}/g;

  const items: RssItem[] = [...html.matchAll(genericBlockPattern)]
    .map((match): RssItem | null => {
      const block = match[0];
      const title = jsonStringProperty(block, "headline") || jsonStringProperty(block, "title");
      const rawUrl =
        jsonStringProperty(block, "websiteUrl") ||
        jsonStringProperty(block, "canonicalUrl") ||
        jsonStringProperty(block, "url");
      const rawDate =
        jsonStringProperty(block, "publishDate") ||
        jsonStringProperty(block, "publishedDate") ||
        jsonStringProperty(block, "datePublished") ||
        jsonStringProperty(block, "firstPublished") ||
        jsonStringProperty(block, "displayDate");

      if (!title || !rawUrl) return null;

      const link = rawUrl.startsWith("http") ? rawUrl : `https://www.stuff.co.nz${rawUrl}`;

      return {
        title,
        link,
        source: "Stuff",
        publishedAt: rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null,
        description: jsonStringProperty(block, "description") || jsonStringProperty(block, "summary"),
      };
    })
    .filter((item): item is RssItem => item != null);

  return dedupeRssItems(items);
}

function stripHtmlToText(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, " "));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSunLiveDate(value: string) {
  const found = value.match(/(\d{1,2}):(\d{2})(am|pm)\s+[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3}),\s+(\d{4})/i);

  if (!found) return null;

  const [, hourText, minuteText, meridiem, dayText, monthText, yearText] = found;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[monthText.toLowerCase()];

  if (month == null) return null;

  let hour = Number(hourText);
  const minute = Number(minuteText);

  if (meridiem.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;

  return new Date(
    Date.UTC(Number(yearText), month, Number(dayText), hour - 12, minute),
  ).toISOString();
}

function parseSunLiveAuthor(value: string) {
  const byline = value.match(/\bBy\s+([^<(\r\n|]+?)(?:\s*\(|\s*<\/|$)/i);

  if (byline?.[1]) return stripHtmlToText(byline[1]).trim();

  const text = stripHtmlToText(value).replace(/\s+/g, " ");
  const watched = [...WATCHED_AUTHOR_NAMES].find((name) => text.toLowerCase().includes(`by ${name}`));

  return watched ? watched.replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
}

export function parseSunLiveListing(html: string): RssItem[] {
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/news\/\d+-[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const items: RssItem[] = [];

  for (const match of html.matchAll(linkPattern)) {
    const [, rawHref, titleHtml] = match;
    const title = stripHtmlToText(titleHtml);

    if (!title || /^read more$/i.test(title)) continue;

    const href = rawHref.startsWith("http") ? rawHref : `https://www.sunlive.co.nz${rawHref}`;

    if (seen.has(href)) continue;
    seen.add(href);

    const following = html.slice(match.index + match[0].length, match.index + match[0].length + 1400);
    const dateMatch = following.match(/\d{1,2}:\d{2}[ap]m\s+[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3},\s+\d{4}/i);
    const author = parseSunLiveAuthor(following);
    const afterDate = dateMatch ? following.slice((dateMatch.index ?? 0) + dateMatch[0].length) : following;
    const description = stripHtmlToText(afterDate)
      .replace(author ? new RegExp(`^(\\|\\s*)?By\\s+${escapeRegExp(author)}\\s*`, "i") : /^$/, "")
      .replace(/^\d+\s+/, "")
      .replace(/\s*Read More[\s\S]*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    items.push({
      title,
      link: href,
      source: "SunLive",
      author,
      publishedAt: dateMatch ? parseSunLiveDate(dateMatch[0]) : null,
      description,
    });
  }

  return items;
}

async function fetchSectorScrapedItems(): Promise<RssItem[]> {
  const [rnzPages, heraldPages, stuffPages, sunlivePages] = await Promise.all([
    Promise.all(RNZ_SCRAPE_SOURCES.map((source) => fetchText(source.url).then((html) => ({ ...source, html })).catch(() => ({ ...source, html: "" })))),
    Promise.all(NZ_HERALD_SCRAPE_SOURCES.map((url) => fetchText(url).catch(() => ""))),
    Promise.all(STUFF_SCRAPE_SOURCES.map((url) => fetchText(url).catch(() => ""))),
    Promise.all(SUNLIVE_SCRAPE_SOURCES.map((url) => fetchText(url).catch(() => ""))),
  ]);
  const now = Date.now();

  const rnzItems = rnzPages.flatMap((page) => parseRnzListing(page.html, page.name)).filter(
    (item) => isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );
  const heraldItems = heraldPages.flatMap(parseNzHeraldEducationListing).filter(
    (item) => isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );
  const stuffItems = stuffPages.flatMap(parseStuffListing).filter(
    (item) => isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );
  const sunliveItems = sunlivePages.flatMap(parseSunLiveListing).filter(
    (item) => isQualityNewsCandidate(item, now, GENERAL_NEWS_MAX_AGE_MS),
  );

  return [...rnzItems, ...heraldItems, ...stuffItems, ...sunliveItems];
}

function dedupeRssItems(items: RssItem[]): RssItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = rssItemIdentityKey(item);

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
        href: urgent ? WEATHER_WARNINGS_URL : location.href,
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
        href: weatherLocations[0].href,
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
  return sanitizeFeed(latestFeed);
}

export async function refreshLandingIntelligenceFeed(
  config: AiConfig,
  logger?: FastifyBaseLogger,
  options: { force?: boolean } = {},
) {
  if (refreshInFlight && !options.force) {
    return refreshInFlight;
  }

  latestFeed = { ...latestFeed, status: "refreshing", error: null };
  refreshInFlight = (async () => {
    const generatedAt = new Date();
    const aiModel = await crawlOllamaModelPages(config.AI_CHAT_MODEL);
    const searchTexts = await readLandingIntelligenceSearchTexts();

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

      const ranked = [...unique.values()]
        .filter(isAllowedFeedItem)
        .sort((left, right) => Number(right.urgent) - Number(left.urgent));
      const items = await refineBriefsWithAi(config, ranked.slice(0, 12));
      const feed: LandingIntelligenceFeed = {
        generatedAt: generatedAt.toISOString(),
        nextRefreshAt: new Date(generatedAt.getTime() + FIFTEEN_MINUTES_MS).toISOString(),
        status: "ready",
        error: null,
        items,
        aiModel,
        searchTexts,
      };

      latestFeed = feed;
      await logFeed(feed);
      await saveFeedSnapshot(feed).catch(() => undefined);
      return feed;
    } catch (error) {
      const previousItems = latestFeed.items.length ? sanitizeFeed(latestFeed).items : [buildAiModelItem(aiModel)];
      const feed: LandingIntelligenceFeed = {
        generatedAt: generatedAt.toISOString(),
        nextRefreshAt: new Date(generatedAt.getTime() + FIFTEEN_MINUTES_MS).toISOString(),
        status: "error",
        error: "Some feed sources did not respond in time. Showing the latest available items.",
        items: previousItems,
        aiModel,
        searchTexts,
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

  const [snapshot, searchTexts] = await Promise.all([
    loadFeedSnapshot(),
    readLandingIntelligenceSearchTexts(),
  ]);

  latestFeed = {
    ...(snapshot ?? latestFeed),
    aiModel: buildAiModelRecommendation(config.AI_CHAT_MODEL),
    searchTexts,
  };
  void refreshLandingIntelligenceFeed(config, logger);

  const timer = setInterval(() => {
    void refreshLandingIntelligenceFeed(config, logger);
  }, FIFTEEN_MINUTES_MS);

  timer.unref();
}
