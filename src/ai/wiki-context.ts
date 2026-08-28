import type { AiChatMessage } from "./client.js";

// Categories live in the database (WikiCategory) so they can be renamed and
// deleted from the UI. The model must pick exactly one of whatever list it is
// given; anything else is snapped back by resolveWikiCategory so a hallucinated
// category can never reach the database and fragment the left panel's grouping.
//
// This list is the seed the migration inserts, and the fallback for when the
// table cannot be read. It is not the source of truth at runtime.
export const DEFAULT_WIKI_CATEGORIES = [
  "Advertising",
  "Enrolment",
  "Brand & Voice",
  "Communications",
  "Job Descriptions",
  "Analytics & Reporting",
  "Systems & Process",
  "General",
] as const;

export const WIKI_FALLBACK_CATEGORY = "General";

const MAX_TAGGING_BODY_CHARS = 6000;
const MIN_TAGS = 3;
const MAX_TAGS = 8;

export function buildWikiTaggingSystemPrompt(categories: readonly string[]): string {
  const list = categories.length ? categories : DEFAULT_WIKI_CATEGORIES;

  return [
    "You classify articles in a marketing knowledge base for Inspired Kindergartens, a New Zealand ECE kindergarten association.",
    "Reply with ONE JSON object and nothing else. No prose, no explanation, no code fences.",
    'Shape: {"category": "<one category>", "tags": ["<tag>", ...]}',
    "",
    "The category MUST be copied verbatim from this list:",
    list.map((category) => `- ${category}`).join("\n"),
    "",
    `Give between ${MIN_TAGS} and ${MAX_TAGS} tags.`,
    "Tags are short lower-case noun phrases naming the subjects the article actually covers, so a reader can find it later.",
    "Base the category and tags only on the supplied text. Never invent subjects the text does not discuss.",
  ].join("\n");
}

export function buildWikiTaggingUserPrompt(input: { title: string; bodyText: string }): string {
  const body = input.bodyText.trim().slice(0, MAX_TAGGING_BODY_CHARS);

  return [
    `Title: ${input.title.trim()}`,
    "",
    "Article text:",
    body || "(This article has no body text yet. Classify from the title alone.)",
  ].join("\n");
}

export function buildWikiTaggingChatMessages(input: {
  title: string;
  bodyText: string;
  categories: readonly string[];
}): AiChatMessage[] {
  return [
    { role: "system", content: buildWikiTaggingSystemPrompt(input.categories) },
    { role: "user", content: buildWikiTaggingUserPrompt(input) },
  ];
}

// Snaps whatever the model produced onto the supplied list: exact match first,
// then a case-insensitive match, then a loose containment match (so "Ads" or
// "advertising strategy" still lands on "Advertising"), and the fallback
// otherwise. Categories are user-editable, so the list is passed in per call
// rather than read from a constant.
export function resolveWikiCategory(value: unknown, categories: readonly string[] = []): string {
  const list = categories.length ? categories : DEFAULT_WIKI_CATEGORIES;
  const fallback = list.includes(WIKI_FALLBACK_CATEGORY) ? WIKI_FALLBACK_CATEGORY : list[0];

  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const exact = list.find((category) => category === raw);
  if (exact) return exact;

  const normalized = raw.toLowerCase();
  const insensitive = list.find((category) => category.toLowerCase() === normalized);
  if (insensitive) return insensitive;

  const contained = list.find((category) => {
    const candidate = category.toLowerCase();
    return normalized.includes(candidate) || candidate.includes(normalized);
  });

  return contained ?? fallback;
}

export type WikiTaggingResult = {
  category: string;
  tags: string[];
};

// Local models wrap JSON in prose or fences often enough that we look for the
// first balanced-looking object rather than trusting the whole reply.
function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}

/**
 * Reads the model's reply into a category and tag list. Never throws: any
 * malformed, empty, or surprising output degrades to the General category with
 * no tags, so a bad generation leaves the article usable rather than blocking
 * the save.
 */
export function parseWikiTaggingResponse(raw: string, categories: readonly string[] = []): WikiTaggingResult {
  const fallback: WikiTaggingResult = { category: resolveWikiCategory("", categories), tags: [] };
  const json = extractJsonObject(String(raw ?? ""));
  if (!json) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fallback;
  }

  if (typeof parsed !== "object" || parsed === null) return fallback;
  const record = parsed as Record<string, unknown>;

  const tagsValue = record.tags;
  const rawTags = Array.isArray(tagsValue)
    ? tagsValue
    : typeof tagsValue === "string"
      ? tagsValue.split(",")
      : [];

  const tags = Array.from(
    new Set(
      rawTags
        .map((tag) => String(tag ?? "").trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= 60),
    ),
  ).slice(0, MAX_TAGS);

  return { category: resolveWikiCategory(record.category, categories), tags };
}
