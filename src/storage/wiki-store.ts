import { prisma } from "../db.js";
import { sanitizeJdBlurbHtml } from "./jd-sanitize-html.js";

// A "Things To Know" article. Rich text is stored as HTML, sanitised on write
// with the same allow-list the JD blurb editor uses.
export type WikiArticleView = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  contentHtml: string;
  isPinned: boolean;
  updatedAt: string;
};

export type WikiArticleListItem = Omit<WikiArticleView, "contentHtml">;

export const WIKI_DEFAULT_CATEGORY = "General";

// Grounding budget. The general chat send budget is 24k chars for the whole
// conversation, so the wiki takes a slice of that rather than all of it.
const WIKI_GROUNDING_CHAR_BUDGET = 9000;
const WIKI_MAX_GROUNDING_ARTICLES = 5;
const WIKI_INDEX_MAX_ENTRIES = 60;

function normalizeText(value: unknown, max: number, fallback = "") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, max) : fallback;
}

// Tags are stored as one comma-separated, lower-cased string so they can be
// matched with a plain `contains` query and split cheaply on read.
export function normalizeWikiTags(value: unknown): string {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const tags = raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(tags)).slice(0, 20).join(",");
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export type WikiArticleRow = {
  id: number;
  title: string;
  category: string;
  tags: string;
  summary: string;
  contentHtml: string;
  isPinned: boolean;
  updatedAt: Date;
};

function toArticleView(row: WikiArticleRow): WikiArticleView {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: splitTags(row.tags),
    summary: row.summary,
    contentHtml: row.contentHtml,
    isPinned: row.isPinned,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const LIST_SELECT = {
  id: true,
  title: true,
  category: true,
  tags: true,
  summary: true,
  isPinned: true,
  updatedAt: true,
} as const;

function toListItem(row: Omit<WikiArticleRow, "contentHtml">): WikiArticleListItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: splitTags(row.tags),
    summary: row.summary,
    isPinned: row.isPinned,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWikiArticles(search?: string | null): Promise<WikiArticleListItem[]> {
  const term = String(search ?? "").trim();
  const rows = await prisma.wikiArticle.findMany({
    where: term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { summary: { contains: term, mode: "insensitive" } },
            { tags: { contains: term.toLowerCase() } },
            { contentHtml: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ isPinned: "desc" }, { category: "asc" }, { title: "asc" }],
    select: LIST_SELECT,
  });
  return rows.map(toListItem);
}

// --- Categories -----------------------------------------------------------

export type WikiCategoryView = {
  id: number;
  name: string;
  isProtected: boolean;
  articleCount: number;
};

const CATEGORY_ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listWikiCategories(): Promise<string[]> {
  const rows = await prisma.wikiCategory.findMany({ orderBy: CATEGORY_ORDER, select: { name: true } });
  const names = rows.map((row) => row.name);
  // The fallback must always be offered, even if the table is somehow empty.
  return names.includes(WIKI_DEFAULT_CATEGORY) ? names : [...names, WIKI_DEFAULT_CATEGORY];
}

// Categories with how many articles each holds, for the management modal.
export async function listWikiCategoriesWithCounts(): Promise<WikiCategoryView[]> {
  const [rows, grouped] = await Promise.all([
    prisma.wikiCategory.findMany({ orderBy: CATEGORY_ORDER }),
    prisma.wikiArticle.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((row) => [row.category, row._count._all]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isProtected: row.isProtected,
    articleCount: counts.get(row.name) ?? 0,
  }));
}

function normalizeCategoryName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function createWikiCategory(name: unknown): Promise<{ id: number } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const existing = await prisma.wikiCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: `"${clean}" already exists.` };

  const last = await prisma.wikiCategory.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const row = await prisma.wikiCategory.create({
    data: { name: clean, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  return { id: row.id };
}

/**
 * Renames a category and re-files its articles in the same transaction, so the
 * two can never drift apart. Articles store the category name rather than a
 * foreign key, which is why the rename has to reach into WikiArticle too.
 */
export async function renameWikiCategory(id: number, name: unknown): Promise<{ ok: true } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const current = await prisma.wikiCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.name === clean) return { ok: true };

  const clash = await prisma.wikiCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" }, NOT: { id } },
    select: { id: true },
  });
  if (clash) return { error: `"${clean}" already exists.` };

  await prisma.$transaction([
    prisma.wikiCategory.update({ where: { id }, data: { name: clean } }),
    prisma.wikiArticle.updateMany({ where: { category: current.name }, data: { category: clean } }),
  ]);
  return { ok: true };
}

/**
 * Deletes a category and moves its articles to the fallback, so deleting can
 * never destroy content. The fallback itself is protected and cannot be
 * deleted, which guarantees the articles always have somewhere to go.
 */
export async function deleteWikiCategory(id: number): Promise<{ ok: true; moved: number } | { error: string }> {
  const current = await prisma.wikiCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.isProtected) return { error: `"${current.name}" is the default category and cannot be deleted.` };

  const moved = await prisma.wikiArticle.count({ where: { category: current.name } });
  await prisma.$transaction([
    prisma.wikiArticle.updateMany({
      where: { category: current.name },
      data: { category: WIKI_DEFAULT_CATEGORY },
    }),
    prisma.wikiCategory.delete({ where: { id } }),
  ]);
  return { ok: true, moved };
}

export async function getWikiArticle(id: number): Promise<WikiArticleView | null> {
  const row = await prisma.wikiArticle.findUnique({ where: { id } });
  return row ? toArticleView(row) : null;
}

export type WikiArticleInput = {
  title?: unknown;
  category?: unknown;
  tags?: unknown;
  summary?: unknown;
  contentHtml?: unknown;
  isPinned?: unknown;
};

function buildWriteData(input: WikiArticleInput) {
  return {
    title: normalizeText(input.title, 200, "Untitled"),
    category: normalizeText(input.category, 80, WIKI_DEFAULT_CATEGORY),
    tags: normalizeWikiTags(input.tags),
    summary: normalizeText(input.summary, 400),
    contentHtml: sanitizeJdBlurbHtml(String(input.contentHtml ?? "")),
    isPinned: input.isPinned === true || input.isPinned === "true" || input.isPinned === "on",
  };
}

export async function createWikiArticle(input: WikiArticleInput): Promise<number> {
  const row = await prisma.wikiArticle.create({ data: buildWriteData(input), select: { id: true } });
  return row.id;
}

// Only the keys present in `input` are written, so the autosaving editor can
// send a single field without clearing the rest of the article.
export async function updateWikiArticle(id: number, input: WikiArticleInput): Promise<void> {
  const full = buildWriteData(input);
  const data: Partial<ReturnType<typeof buildWriteData>> = {};
  if (input.title !== undefined) data.title = full.title;
  if (input.category !== undefined) data.category = full.category;
  if (input.tags !== undefined) data.tags = full.tags;
  if (input.summary !== undefined) data.summary = full.summary;
  if (input.contentHtml !== undefined) data.contentHtml = full.contentHtml;
  if (input.isPinned !== undefined) data.isPinned = full.isPinned;
  if (Object.keys(data).length === 0) return;
  await prisma.wikiArticle.update({ where: { id }, data });
}

export async function deleteWikiArticle(id: number): Promise<void> {
  await prisma.wikiArticle.delete({ where: { id } });
}

export async function duplicateWikiArticle(id: number): Promise<number | null> {
  const source = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!source) return null;
  const row = await prisma.wikiArticle.create({
    data: {
      title: `${source.title} (copy)`.slice(0, 200),
      category: source.category,
      tags: source.tags,
      summary: source.summary,
      contentHtml: source.contentHtml,
      isPinned: false,
    },
    select: { id: true },
  });
  return row.id;
}

// Writes the AI-assigned category and tags. Separate from updateWikiArticle so
// a background tagging pass can never clobber body text the user is editing at
// the same moment.
export async function applyWikiTagging(
  id: number,
  input: { category: string; tags: readonly string[] },
): Promise<void> {
  await prisma.wikiArticle.update({
    where: { id },
    data: { category: input.category, tags: normalizeWikiTags(input.tags.join(",")) },
  });
}

// --- AI grounding ---------------------------------------------------------

export function wikiHtmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|h1|h2|h3|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    // Stripping a tag leaves the space that stood in for it, so collapse
    // blank lines and trim each line rather than only the whole string.
    .replace(/\n\s*\n\s*/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

// Words too common to discriminate between articles. Dropping them stops a
// prompt like "what do we do about ..." matching every article equally.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "our", "with", "that", "this", "what", "when",
  "where", "which", "who", "how", "why", "can", "does", "did", "was", "were", "has", "have", "had",
  "from", "into", "about", "there", "their", "them", "they", "his", "her", "its", "all",
  "any", "some", "one", "two", "get", "got", "use", "used", "using", "should", "would", "could",
  "please", "tell", "give", "need", "want", "know", "make", "made", "your", "just", "like", "more",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

// Weighted keyword scoring. Title and tag hits are the strongest signal that
// an article is on-topic; summary next; body weakest because a long article
// will incidentally contain many words.
function scoreArticle(row: WikiArticleRow, promptTokens: readonly string[]): number {
  if (promptTokens.length === 0) return 0;
  const title = row.title.toLowerCase();
  const tags = row.tags.toLowerCase();
  const summary = row.summary.toLowerCase();
  const body = wikiHtmlToPlainText(row.contentHtml).toLowerCase();

  let score = 0;
  for (const token of new Set(promptTokens)) {
    if (title.includes(token)) score += 10;
    if (tags.includes(token)) score += 8;
    if (summary.includes(token)) score += 4;
    if (body.includes(token)) score += 1;
  }
  return score;
}

export type WikiGroundingArticle = {
  id: number;
  title: string;
  category: string;
  score: number;
  pinned: boolean;
};

export type WikiGrounding = {
  text: string;
  articles: WikiGroundingArticle[];
};

/**
 * Builds the wiki grounding block for a chat prompt: an index of every article
 * (so the model knows what exists) plus the full text of the articles that
 * best match the prompt, within a character budget. Pinned articles are always
 * included. Returns null when the wiki is empty, so callers can skip the
 * message entirely.
 *
 * Pure so the retrieval can be tested without a database; `buildWikiChatGrounding`
 * is the thin DB-reading wrapper around it.
 */
export function selectWikiGrounding(rows: readonly WikiArticleRow[], prompt: string): WikiGrounding | null {
  if (rows.length === 0) return null;

  const promptTokens = tokenize(prompt);
  const scored = rows
    .map((row) => ({ row, score: scoreArticle(row, promptTokens) }))
    .sort((left, right) => {
      if (left.row.isPinned !== right.row.isPinned) return left.row.isPinned ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      return right.row.updatedAt.getTime() - left.row.updatedAt.getTime();
    });

  const selected: typeof scored = [];
  let used = 0;
  for (const entry of scored) {
    // A pinned article is always relevant; an unpinned one has to earn its
    // place by actually matching the prompt.
    if (!entry.row.isPinned && entry.score <= 0) continue;
    if (selected.length >= WIKI_MAX_GROUNDING_ARTICLES) break;
    const body = wikiHtmlToPlainText(entry.row.contentHtml);
    const cost = entry.row.title.length + body.length + 80;
    if (selected.length > 0 && used + cost > WIKI_GROUNDING_CHAR_BUDGET) break;
    selected.push(entry);
    used += cost;
  }

  const index = rows
    .slice(0, WIKI_INDEX_MAX_ENTRIES)
    .map((row) => {
      const summary = row.summary || wikiHtmlToPlainText(row.contentHtml).slice(0, 120);
      return `- ${row.title} [${row.category}]${summary ? `: ${summary}` : ""}`;
    })
    .join("\n");

  const lines = [
    "Things To Know - the marketing knowledge base maintained by the user in this app.",
    "Treat it as the authoritative in-house source: when it covers the question, prefer it over general knowledge, and say which article the answer came from.",
    "Name the article in plain text only. These articles live in this app and have no public web address, so never invent a link or URL for one.",
    "",
    `Available articles (${rows.length}):`,
    index,
  ];

  if (selected.length > 0) {
    lines.push("", "Full text of the articles most relevant to this question:");
    for (const entry of selected) {
      const body = wikiHtmlToPlainText(entry.row.contentHtml);
      lines.push(
        "",
        `### ${entry.row.title} [${entry.row.category}]`,
        entry.row.tags ? `Tags: ${entry.row.tags}` : "",
        body || "(This article has no content yet.)",
      );
    }
  } else {
    lines.push("", "No article closely matches this question. Say so rather than guessing from the titles above.");
  }

  return {
    text: lines.filter((line) => line !== "").join("\n"),
    articles: selected.map((entry) => ({
      id: entry.row.id,
      title: entry.row.title,
      category: entry.row.category,
      score: entry.score,
      pinned: entry.row.isPinned,
    })),
  };
}

// Reads the wiki and hands it to the pure selector above. The sort here only
// sets the tie-break order (newest first within a pin group); relevance
// ordering happens in selectWikiGrounding.
export async function buildWikiChatGrounding(prompt: string): Promise<WikiGrounding | null> {
  const rows = await prisma.wikiArticle.findMany({
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });
  return selectWikiGrounding(rows, prompt);
}

export const __testing = { scoreArticle, tokenize };
