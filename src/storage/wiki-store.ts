import { prisma } from "../db.js";
import { sanitizeJdBlurbHtml } from "./jd-sanitize-html.js";
import { normaliseWikiParagraphs } from "./wiki-paragraphs.js";

// A "Things To Know" article. Rich text is stored as HTML, sanitised on write
// with the same allow-list the JD blurb editor uses.
export type WikiArticleView = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  contentHtml: string;
  isArchived: boolean;
  // True once the user filed the article by hand. The AI tagging pass then
  // leaves the category alone, so their filing decision stands.
  isCategoryLocked: boolean;
  updatedAt: string;
};

export type WikiArticleListItem = Omit<WikiArticleView, "contentHtml">;

export const WIKI_DEFAULT_CATEGORY = "General";

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
  isArchived: boolean;
  isCategoryLocked: boolean;
  updatedAt: Date;
};

function toArticleView(row: WikiArticleRow): WikiArticleView {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: splitTags(row.tags),
    summary: row.summary,
    // Articles saved before paragraphs were normalised still hold loose text
    // and empty paragraphs; tidy them on read so they display evenly too.
    contentHtml: normaliseWikiParagraphs(row.contentHtml),
    isArchived: row.isArchived,
    isCategoryLocked: row.isCategoryLocked,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const LIST_SELECT = {
  id: true,
  title: true,
  category: true,
  tags: true,
  summary: true,
  isArchived: true,
  isCategoryLocked: true,
  updatedAt: true,
} as const;

function toListItem(row: Omit<WikiArticleRow, "contentHtml">): WikiArticleListItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: splitTags(row.tags),
    summary: row.summary,
    isArchived: row.isArchived,
    isCategoryLocked: row.isCategoryLocked,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lists the wiki. Archived articles are held back by default so retiring an
 * article gets it out of the way without destroying it; `archived: true` shows
 * that shelf instead, which is the only way back to one.
 */
export async function listWikiArticles(
  search?: string | null,
  options: { archived?: boolean } = {},
): Promise<WikiArticleListItem[]> {
  const term = String(search ?? "").trim();
  const rows = await prisma.wikiArticle.findMany({
    where: {
      isArchived: options.archived === true,
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { summary: { contains: term, mode: "insensitive" } },
              { tags: { contains: term.toLowerCase() } },
              { contentHtml: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    select: LIST_SELECT,
  });
  return rows.map(toListItem);
}

// How many articles sit on the archive shelf, so the list can offer a way in
// only when there is something there.
export async function countArchivedWikiArticles(): Promise<number> {
  return prisma.wikiArticle.count({ where: { isArchived: true } });
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
    // Archived articles are off the shelf, so they do not count towards a
    // category's size in the management modal.
    prisma.wikiArticle.groupBy({ by: ["category"], where: { isArchived: false }, _count: { _all: true } }),
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
 * Writes a new category order from a list of ids. Positions come from the
 * supplied order, so the drag on the wiki page is the only thing that decides
 * it. Ids that no longer exist are ignored, and any category the caller left
 * out keeps its place after the ones that were sent, so a stale page cannot
 * drop a category off the end.
 */
export async function reorderWikiCategories(ids: unknown): Promise<{ ok: true } | { error: string }> {
  if (!Array.isArray(ids)) return { error: "A category order is required." };

  const requested = ids
    .map((value) => (typeof value === "number" ? value : Number.parseInt(String(value), 10)))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (requested.length === 0) return { error: "A category order is required." };

  const existing = await prisma.wikiCategory.findMany({ orderBy: CATEGORY_ORDER, select: { id: true } });
  const known = new Set(existing.map((row) => row.id));

  const ordered = Array.from(new Set(requested)).filter((id) => known.has(id));
  if (ordered.length === 0) return { error: "None of those categories exist." };

  // Anything the caller did not mention keeps its relative order, appended.
  for (const row of existing) {
    if (!ordered.includes(row.id)) ordered.push(row.id);
  }

  await prisma.$transaction(
    ordered.map((id, index) => prisma.wikiCategory.update({ where: { id }, data: { sortOrder: index } })),
  );
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
};

function buildWriteData(input: WikiArticleInput) {
  return {
    title: normalizeText(input.title, 200, "Untitled"),
    category: normalizeText(input.category, 80, WIKI_DEFAULT_CATEGORY),
    tags: normalizeWikiTags(input.tags),
    summary: normalizeText(input.summary, 400),
    contentHtml: normaliseWikiParagraphs(sanitizeJdBlurbHtml(String(input.contentHtml ?? ""))),
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
  const data: Partial<ReturnType<typeof buildWriteData>> & { isCategoryLocked?: boolean } = {};
  if (input.title !== undefined) data.title = full.title;
  // Any category arriving through this path came from a person (the editor's
  // select), so writing one locks it against the AI tagging pass for good.
  if (input.category !== undefined) {
    data.category = full.category;
    data.isCategoryLocked = true;
  }
  if (input.tags !== undefined) data.tags = full.tags;
  if (input.summary !== undefined) data.summary = full.summary;
  if (input.contentHtml !== undefined) data.contentHtml = full.contentHtml;
  if (Object.keys(data).length === 0) return;
  await prisma.wikiArticle.update({ where: { id }, data });
}

export async function deleteWikiArticle(id: number): Promise<void> {
  await prisma.wikiArticle.delete({ where: { id } });
}

/**
 * Archives or restores an article. An archived article is dropped from the AI
 * chats' knowledge base on the next index pass; restoring puts it back.
 */
export async function setWikiArticleArchived(id: number, isArchived: boolean): Promise<boolean> {
  const existing = await prisma.wikiArticle.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await prisma.wikiArticle.update({
    where: { id },
    data: { isArchived },
  });
  return true;
}

export async function duplicateWikiArticle(id: number): Promise<number | null> {
  const source = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!source) return null;
  const row = await prisma.wikiArticle.create({
    data: {
      title: `${source.title} (copy)`.slice(0, 200),
      category: source.category,
      // A copy inherits the original's filing, lock included, so duplicating a
      // hand-filed article does not hand it back to the AI.
      isCategoryLocked: source.isCategoryLocked,
      tags: source.tags,
      summary: source.summary,
      contentHtml: source.contentHtml,
      // A copy is made to be worked on, so it starts on the live shelf even
      // when the article it came from is archived.
      isArchived: false,
    },
    select: { id: true },
  });
  return row.id;
}

// Writes the AI-assigned category and tags. Separate from updateWikiArticle so
// a background tagging pass can never clobber body text the user is editing at
// the same moment, and so it can skip the category once the user has filed the
// article by hand.
export async function applyWikiTagging(
  id: number,
  input: { category: string; tags: readonly string[]; summary?: string },
): Promise<void> {
  const existing = await prisma.wikiArticle.findUnique({
    where: { id },
    select: { isCategoryLocked: true },
  });
  if (!existing) return;

  const data: { category?: string; tags: string; summary?: string } = {
    tags: normalizeWikiTags(input.tags.join(",")),
  };
  // A category the user set by hand is theirs. Tags and summary still refresh.
  if (!existing.isCategoryLocked) data.category = input.category;
  // An empty generation must not wipe a summary the user wrote by hand.
  const summary = String(input.summary ?? "").trim();
  if (summary) data.summary = summary.slice(0, 400);

  await prisma.wikiArticle.update({ where: { id }, data });
}

// --- Plain text -------------------------------------------------------------
// The AI chats find articles through the help knowledge base (RAG):
// src/help-kb/wiki-source.ts indexes them.

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
