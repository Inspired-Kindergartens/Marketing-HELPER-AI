import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { prisma } from "../db.js";
import { advanceSyncCursor, readSyncCursor } from "./sync-cursor-store.js";
import type { AiConfig } from "../ai/config.js";
import { dot, embedTexts, normalizeVector } from "../ai/embeddings.js";
import { extractPdfText } from "../ai/document-reader.js";
import {
  buildFullTextQuery,
  buildPhraseQuery,
  chunkEmbeddingText,
  chunkHelpArticle,
  hashHelpArticle,
  parseHtmlDocument,
  parseMarkdownDocument,
  parseTextDocument,
  reciprocalRankFusion,
  type ParsedHelpArticle,
} from "../help-kb/parse.js";
import { HELP_SOURCES, HELP_SOURCE_IDS, type HelpSourceId } from "../help-kb/sources.js";
import { WIKI_URL_PREFIX, wikiArticleToHelpArticle } from "../help-kb/wiki-source.js";

// The help knowledge base behind the AI chats (RAG). Each source's help pages
// and local documents are split into heading-sized chunks and embedded; a chat
// prompt is grounded on the chunks a hybrid (vector + full-text) search finds.

type Logger = {
  info: (payload: object, message?: string) => void;
  warn: (payload: object, message?: string) => void;
};

export type HelpKbConfig = {
  ai: Pick<AiConfig, "AI_PROVIDER" | "AI_BASE_URL">;
  embedModel: string;
  // Local document paths resolve against this (the repo root).
  rootDir: string;
};

const USER_AGENT = "MarketingHelperAI/1.0 (internal knowledge base; one request at a time)";
const FETCH_TIMEOUT_MS = 20_000;
const LOCAL_PREFIX = "local:";
const LOCAL_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".pdf"]);
const LOCAL_MAX_BYTES = 15 * 1024 * 1024;

// In-house documents (local guides and Things To Know articles) have no web
// link and get their own vote in the ranking.
function isInHouseUrl(url: string): boolean {
  return url.startsWith(LOCAL_PREFIX) || url.startsWith(WIKI_URL_PREFIX);
}
const IN_HOUSE_URL_FILTER = { OR: [{ url: { startsWith: LOCAL_PREFIX } }, { url: { startsWith: WIKI_URL_PREFIX } }] };

const syncing = new Set<HelpSourceId>();

export type HelpSourceStatus = {
  source: HelpSourceId;
  label: string;
  articleCount: number;
  lastSyncedAt: string | null;
  syncing: boolean;
};

export async function getHelpKbStatus(sources: readonly HelpSourceId[] = HELP_SOURCE_IDS): Promise<HelpSourceStatus[]> {
  const grouped = await prisma.helpArticle.groupBy({
    by: ["source"],
    where: { source: { in: [...sources] } },
    _count: { _all: true },
    _max: { fetchedAt: true },
  });
  const bySource = new Map(grouped.map((row) => [row.source, row]));
  return sources.map((source) => ({
    source,
    label: HELP_SOURCES[source].label,
    articleCount: bySource.get(source)?._count._all ?? 0,
    lastSyncedAt: bySource.get(source)?._max.fetchedAt?.toISOString() ?? null,
    syncing: syncing.has(source),
  }));
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    return { status: response.status, body: response.ok ? await response.text() : "" };
  } finally {
    clearTimeout(timeout);
  }
}

export type HelpSyncResult = {
  source: HelpSourceId;
  kind: "crawl" | "local";
  seen: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  removed: number;
};

type ExistingArticle = { id: number; contentHash: string; missingVectors: boolean };

// Shared by crawls and local documents: stores one parsed document, skipping
// the embedder when the content is unchanged. If embedding fails, the chunks
// are kept without vectors (full-text search still finds them) and embedding
// is switched off for the rest of the run, so a missing model logs once.
class ArticleWriter {
  private canEmbed: boolean;
  private existing = new Map<string, ExistingArticle>();

  constructor(
    private readonly source: HelpSourceId,
    private readonly config: HelpKbConfig,
    private readonly log: Logger,
  ) {
    this.canEmbed = config.ai.AI_PROVIDER === "ollama";
  }

  async load(where: { local: boolean }) {
    const rows = await prisma.helpArticle.findMany({
      where: {
        source: this.source,
        url: where.local ? { startsWith: LOCAL_PREFIX } : { not: { startsWith: LOCAL_PREFIX } },
      },
      select: { id: true, url: true, contentHash: true, _count: { select: { chunks: { where: { embedding: { isEmpty: true } } } } } },
    });
    this.existing = new Map(
      rows.map((row) => [row.url, { id: row.id, contentHash: row.contentHash, missingVectors: row._count.chunks > 0 }]),
    );
  }

  async write(article: ParsedHelpArticle): Promise<"updated" | "unchanged"> {
    const contentHash = hashHelpArticle(article);
    const previous = this.existing.get(article.url);
    if (previous && previous.contentHash === contentHash && !(previous.missingVectors && this.canEmbed)) {
      await prisma.helpArticle.update({ where: { id: previous.id }, data: { fetchedAt: new Date() } });
      return "unchanged";
    }

    const chunks = chunkHelpArticle(article);
    let vectors: Float32Array[] | null = null;
    if (this.canEmbed) {
      try {
        vectors = await embedTexts(
          this.config.ai,
          this.config.embedModel,
          chunks.map((chunk) => chunkEmbeddingText(article.title, chunk)),
          "document",
        );
      } catch (error) {
        this.canEmbed = false;
        this.log.warn(
          { error: String(error), url: article.url, model: this.config.embedModel },
          "Help sync: embedding failed; storing the rest for full-text search only",
        );
      }
    }

    const data = {
      source: this.source,
      title: article.title.slice(0, 300),
      section: article.section.slice(0, 120),
      summary: article.summary.slice(0, 500),
      contentHash,
      fetchedAt: new Date(),
    };
    await prisma.$transaction(async (tx) => {
      const row = await tx.helpArticle.upsert({
        where: { url: article.url },
        create: { url: article.url, ...data },
        update: data,
        select: { id: true },
      });
      await tx.helpChunk.deleteMany({ where: { articleId: row.id } });
      await tx.helpChunk.createMany({
        data: chunks.map((chunk, ordinal) => ({
          articleId: row.id,
          ordinal,
          anchor: chunk.anchor,
          heading: chunk.heading,
          text: chunk.text,
          embedding: vectors ? Array.from(vectors[ordinal]) : [],
        })),
      });
    });
    vectorIndexDirty = true;
    return "updated";
  }

  // Removes the loaded documents (this source's crawled or local ones) that were not seen.
  async prune(seen: ReadonlySet<string>): Promise<number> {
    const stale = [...this.existing.keys()].filter((url) => !seen.has(url));
    if (stale.length === 0) return 0;
    const removed = await prisma.helpArticle.deleteMany({ where: { source: this.source, url: { in: stale } } });
    if (removed.count > 0) vectorIndexDirty = true;
    return removed.count;
  }
}

function completedKey(source: HelpSourceId) {
  return `help-kb:${source}:completed-at`;
}

/** Crawls one source's public help centre and brings its pages up to date. */
export async function crawlHelpSource(source: HelpSourceId, config: HelpKbConfig, log: Logger): Promise<HelpSyncResult | null> {
  const crawl = HELP_SOURCES[source].crawl;
  if (!crawl || syncing.has(source)) return null;
  syncing.add(source);
  const result: HelpSyncResult = { source, kind: "crawl", seen: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, removed: 0 };
  try {
    const writer = new ArticleWriter(source, config, log);
    await writer.load({ local: false });
    log.info({ source }, "Help sync: crawl started");
    const seen = new Set<string>();

    for await (const page of crawl.pages(fetchText, log)) {
      seen.add(page.url);
      result.seen++;
      if (!page.article) {
        result.skipped++;
        continue;
      }
      try {
        result[await writer.write(page.article)]++;
      } catch (error) {
        result.failed++;
        log.warn({ error: String(error), url: page.url }, "Help sync: page failed");
      }
    }

    if (seen.size >= crawl.minPagesToPrune) {
      result.removed = await writer.prune(seen);
      await advanceSyncCursor(completedKey(source), BigInt(Date.now()));
    }
    log.info(result, "Help sync: crawl finished");
    return result;
  } catch (error) {
    log.warn({ error: String(error), source }, "Help sync: crawl failed");
    return result;
  } finally {
    syncing.delete(source);
  }
}

async function listLocalFiles(rootDir: string, paths: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  const visit = async (absolute: string) => {
    const info = await stat(absolute).catch(() => null);
    if (!info) return;
    if (info.isDirectory()) {
      for (const entry of await readdir(absolute)) {
        if (!entry.startsWith(".") && entry.toLowerCase() !== "readme.md") await visit(join(absolute, entry));
      }
    } else if (LOCAL_EXTENSIONS.has(extname(absolute).toLowerCase()) && info.size <= LOCAL_MAX_BYTES) {
      files.push(absolute);
    }
  };
  for (const path of paths) await visit(resolve(rootDir, path));
  return files;
}

async function readLocalDocument(absolute: string, url: string): Promise<ParsedHelpArticle | null> {
  const extension = extname(absolute).toLowerCase();
  const fallbackTitle = basename(absolute, extension).replace(/[-_]+/g, " ");
  const buffer = await readFile(absolute);
  if (extension === ".pdf") {
    const pdf = await extractPdfText(buffer);
    const pages = pdf.text.split(/\n\n(?=Page \d+\n)/).map((page) => page.replace(/^Page \d+\n/, ""));
    return parseTextDocument(pdf.text, url, fallbackTitle, pages);
  }
  const text = buffer.toString("utf8");
  if (extension === ".md" || extension === ".markdown") return parseMarkdownDocument(text, url, fallbackTitle);
  if (extension === ".html" || extension === ".htm") return parseHtmlDocument(text, url, fallbackTitle);
  return parseTextDocument(text, url, fallbackTitle);
}

/** Indexes one source's local documents; cheap when nothing has changed. */
export async function indexLocalHelpDocuments(source: HelpSourceId, config: HelpKbConfig, log: Logger): Promise<HelpSyncResult> {
  const result: HelpSyncResult = { source, kind: "local", seen: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, removed: 0 };
  const writer = new ArticleWriter(source, config, log);
  await writer.load({ local: true });
  const seen = new Set<string>();

  for (const absolute of await listLocalFiles(config.rootDir, HELP_SOURCES[source].localPaths)) {
    const url = LOCAL_PREFIX + relative(config.rootDir, absolute).split(sep).join("/");
    seen.add(url);
    result.seen++;
    try {
      const article = await readLocalDocument(absolute, url);
      if (!article) {
        result.skipped++;
        continue;
      }
      result[await writer.write(article)]++;
    } catch (error) {
      result.failed++;
      log.warn({ error: String(error), url }, "Help sync: local document failed");
    }
  }

  result.removed = await writer.prune(seen);
  if (result.updated > 0 || result.removed > 0) log.info(result, "Help sync: local documents indexed");
  return result;
}

/**
 * Brings the wiki's index up to date with its live (non-archived) articles:
 * new and edited ones are embedded, unchanged ones skipped by content hash,
 * archived and deleted ones removed. Runs after every wiki change and on the
 * scheduled check. Calls that arrive while a pass is running are folded into
 * one more pass, so a burst of autosaves embeds once.
 */
let wikiIndexRun: Promise<void> | null = null;
let wikiIndexAgain = false;

export function indexWikiArticles(config: HelpKbConfig, log: Logger): Promise<void> {
  if (wikiIndexRun) {
    wikiIndexAgain = true;
    return wikiIndexRun;
  }
  wikiIndexRun = (async () => {
    try {
      do {
        wikiIndexAgain = false;
        await indexWikiArticlesOnce(config, log);
      } while (wikiIndexAgain);
    } finally {
      wikiIndexRun = null;
    }
  })();
  return wikiIndexRun;
}

async function indexWikiArticlesOnce(config: HelpKbConfig, log: Logger): Promise<HelpSyncResult> {
  const result: HelpSyncResult = { source: "wiki", kind: "local", seen: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, removed: 0 };
  const writer = new ArticleWriter("wiki", config, log);
  await writer.load({ local: false });
  const rows = await prisma.wikiArticle.findMany({
    where: { isArchived: false },
    select: { id: true, title: true, category: true, tags: true, summary: true, contentHtml: true },
  });
  const seen = new Set<string>();
  for (const row of rows) {
    result.seen++;
    const article = wikiArticleToHelpArticle(row);
    if (!article) {
      result.skipped++;
      continue;
    }
    seen.add(article.url);
    try {
      result[await writer.write(article)]++;
    } catch (error) {
      result.failed++;
      log.warn({ error: String(error), url: article.url }, "Help sync: wiki article failed");
    }
  }
  result.removed = await writer.prune(seen);
  if (result.updated > 0 || result.removed > 0) log.info(result, "Help sync: wiki articles indexed");
  return result;
}

/**
 * The scheduled check: re-indexes the wiki, re-reads every source's local documents, and crawls a
 * source's help centre when its last complete crawl is older than the
 * source's refresh period (or never finished, e.g. cut short by a restart).
 * Sources run one after another so only one crawl is ever in flight.
 */
export async function syncHelpKbIfStale(config: HelpKbConfig, log: Logger): Promise<void> {
  await indexWikiArticles(config, log).catch((error) => {
    log.warn({ error: String(error) }, "Help sync: wiki articles failed");
  });
  for (const source of HELP_SOURCE_IDS) {
    if (HELP_SOURCES[source].localPaths.length === 0) continue;
    await indexLocalHelpDocuments(source, config, log).catch((error) => {
      log.warn({ error: String(error), source }, "Help sync: local documents failed");
    });
  }
  for (const source of HELP_SOURCE_IDS) {
    const crawl = HELP_SOURCES[source].crawl;
    if (!crawl) continue;
    const completedAt = Number(await readSyncCursor(completedKey(source)));
    if (completedAt > 0 && Date.now() - completedAt < crawl.refreshAfterMs) continue;
    await crawlHelpSource(source, config, log);
  }
}

// --- Retrieval -------------------------------------------------------------

type IndexedChunk = { id: number; source: string; local: boolean; vector: Float32Array };

// Every chunk vector held in memory: a few thousand 768-d vectors is a few
// tens of MB and a brute-force scan takes milliseconds, so no vector database
// is needed.
let vectorIndex: IndexedChunk[] | null = null;
let vectorIndexDirty = true;

async function loadVectorIndex(): Promise<IndexedChunk[]> {
  if (vectorIndex && !vectorIndexDirty) return vectorIndex;
  vectorIndexDirty = false;
  const rows = await prisma.helpChunk.findMany({
    where: { embedding: { isEmpty: false } },
    select: { id: true, embedding: true, article: { select: { source: true, url: true } } },
  });
  vectorIndex = rows.map((row) => ({
    id: row.id,
    source: row.article.source,
    local: isInHouseUrl(row.article.url),
    vector: normalizeVector(row.embedding),
  }));
  return vectorIndex;
}

const CANDIDATES_PER_METHOD = 20;
const LOCAL_CANDIDATES = 5;
const PHRASE_CANDIDATES = 10;
// Rank-fusion weights for [vector, full-text, in-house guides, exact phrase].
// Tuned on 2026-10-16 with scripts/help-kb-eval.mts (eight dashboard, Meta, GA and Mailchimp
// questions with known answers): meaning (vector) leads; the OR-ed keyword
// search is noisy and only nudges; an exact phrase ("Review spend") is strong.
const FUSION_WEIGHTS = [2, 0.5, 1, 1.5];
const MAX_CHUNKS_PER_ARTICLE = 2;

// Below this cosine score the best vector match is unrelated to the question,
// so no help text is added at all. Calibrated on nomic-embed-text: how-to and
// "what does this metric mean" questions score ~0.69-0.77, while
// article-writing prompts ("write about Matariki") still reach ~0.62-0.64
// against unrelated help pages, so the gate sits above that.
export const HELP_MIN_SIMILARITY = 0.68;
// Candidates a little under the gate can still support a question that passed it.
const CANDIDATE_MIN_SIMILARITY = 0.62;

export type HelpSource = { title: string; url: string | null; source: HelpSourceId; label: string };

export type HelpGrounding = {
  text: string;
  sources: HelpSource[];
};

export type HelpGroundingOptions = {
  sources: readonly HelpSourceId[];
  // Chats with a large data context get fewer, shorter excerpts so the prompt
  // still fits the model's context window.
  maxChunks: number;
  charBudget: number;
  log?: Logger;
  // Overrides FUSION_WEIGHTS; for tuning the retrieval only.
  fusionWeights?: readonly number[];
};

/**
 * Finds the help chunks for a question within the given sources: vector
 * similarity and Postgres full-text search each return candidates, merged by
 * reciprocal rank fusion. Fails soft: returns null whenever nothing relevant
 * is found or retrieval itself errors, so the chat always answers.
 */
export async function buildHelpGrounding(
  config: HelpKbConfig,
  query: string,
  options: HelpGroundingOptions,
): Promise<HelpGrounding | null> {
  const question = query.trim();
  if (!question || options.sources.length === 0) return null;
  const wanted = new Set<string>(options.sources);

  let vectorIds: number[] = [];
  let localVectorIds: number[] = [];
  let wikiVectorIds: number[] = [];
  let bestSimilarity = 0;
  if (config.ai.AI_PROVIDER === "ollama") {
    try {
      const index = (await loadVectorIndex()).filter((chunk) => wanted.has(chunk.source));
      if (index.length > 0) {
        const [queryVector] = await embedTexts(config.ai, config.embedModel, [question], "query", 15_000);
        const scored = index
          .map((chunk) => ({ id: chunk.id, source: chunk.source, local: chunk.local, score: dot(queryVector, chunk.vector) }))
          .filter((entry) => entry.score >= CANDIDATE_MIN_SIMILARITY)
          .sort((left, right) => right.score - left.score);
        bestSimilarity = scored[0]?.score ?? 0;
        vectorIds = scored.slice(0, CANDIDATES_PER_METHOD).map((entry) => entry.id);
        localVectorIds = scored.filter((entry) => entry.local).map((entry) => entry.id);
        wikiVectorIds = scored.filter((entry) => entry.source === "wiki").map((entry) => entry.id);
      }
    } catch (error) {
      options.log?.warn({ error: String(error) }, "Help vector search unavailable; using full-text only");
    }
  }

  const helpOnTopic =
    bestSimilarity >= HELP_MIN_SIMILARITY || options.sources.some((source) => HELP_SOURCES[source].topic.test(question));
  const wantsWiki = wanted.has("wiki");
  if (!helpOnTopic && !wantsWiki) return null;

  const searchText = async (tsQuery: string, sources: readonly string[], limit: number, label: string): Promise<number[]> => {
    if (!tsQuery) return [];
    try {
      const rows = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT chunk."id"
        FROM "HelpChunk" AS chunk
        JOIN "HelpArticle" AS article ON article."id" = chunk."articleId",
             to_tsquery('english', ${tsQuery}) AS query
        WHERE chunk."searchVector" @@ query AND article."source" = ANY(${[...sources]})
        -- ts_rank normalised by log length (flag 1): plain cover density let
        -- long glossary chunks that repeat a common word ("ads") outrank the
        -- short section that actually answers the question.
        ORDER BY ts_rank(chunk."searchVector", query, 1) DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => row.id);
    } catch (error) {
      options.log?.warn({ error: String(error) }, `Help ${label} search failed`);
      return [];
    }
  };
  const tsQuery = buildFullTextQuery(question);
  const phraseQuery = buildPhraseQuery(question);

  // Things To Know articles are short in-house notes: their best vector match
  // scores well under the help-centre gate even when it is the right article
  // (0.59-0.65 measured), while unrelated questions score about the same, so
  // the vector score cannot tell them apart. A keyword hit on the wiki is the
  // deciding signal instead. The wiki is searched on its own, so its few
  // chunks are not crowded out of the cross-source top 20.
  const wikiTextIds = wantsWiki ? await searchText(tsQuery, ["wiki"], LOCAL_CANDIDATES, "wiki full-text") : [];
  const wikiPhraseIds = wantsWiki ? await searchText(phraseQuery, ["wiki"], LOCAL_CANDIDATES, "wiki phrase") : [];

  let textIds: number[];
  let phraseIds: number[];
  if (helpOnTopic) {
    textIds = await searchText(tsQuery, options.sources, CANDIDATES_PER_METHOD, "full-text");
    phraseIds = await searchText(phraseQuery, options.sources, PHRASE_CANDIDATES, "phrase");
  } else {
    // Off-topic for the help guides: only a wiki keyword match may answer, and
    // only with wiki excerpts.
    if (wikiTextIds.length === 0 && wikiPhraseIds.length === 0) return null;
    vectorIds = wikiVectorIds;
    localVectorIds = wikiVectorIds;
    textIds = wikiTextIds;
    phraseIds = wikiPhraseIds;
  }

  // In-house guides are the authority on how this app works out its numbers,
  // but a handful of them would be outvoted by thousands of help-centre
  // chunks, so they also get a ranked list of their own: their own hybrid of
  // the three signals, so it is an independent vote rather than a recount of
  // the vector ranking.
  // Keyword hits can be chunks the vector search never scored, so which of
  // them are in-house is looked up rather than taken from the vector index.
  const keywordIds = [...new Set([...textIds, ...phraseIds])];
  const localKeywordIds = new Set(
    keywordIds.length
      ? (
          await prisma.helpChunk.findMany({
            where: { id: { in: keywordIds }, article: IN_HOUSE_URL_FILTER },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [],
  );
  const isLocal = (id: number) => localKeywordIds.has(id);
  const localTextIds = [...new Set([...textIds.filter(isLocal), ...wikiTextIds])];
  const localPhraseIds = [...new Set([...phraseIds.filter(isLocal), ...wikiPhraseIds])];
  const localIds = reciprocalRankFusion([localVectorIds, localTextIds, localPhraseIds])
    .slice(0, LOCAL_CANDIDATES)
    .map((entry) => entry.id);

  const ranked = reciprocalRankFusion([vectorIds, textIds, localIds, phraseIds], 60, options.fusionWeights ?? FUSION_WEIGHTS);
  if (ranked.length === 0) return null;

  const chunks = await prisma.helpChunk.findMany({
    where: { id: { in: ranked.slice(0, CANDIDATES_PER_METHOD).map((entry) => entry.id) } },
    select: {
      id: true,
      anchor: true,
      heading: true,
      text: true,
      article: { select: { id: true, url: true, title: true, source: true } },
    },
  });
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const selected: typeof chunks = [];
  const perArticle = new Map<number, number>();
  let used = 0;
  for (const entry of ranked) {
    const chunk = byId.get(entry.id);
    if (!chunk) continue;
    const count = perArticle.get(chunk.article.id) ?? 0;
    if (count >= MAX_CHUNKS_PER_ARTICLE) continue;
    const cost = chunk.text.length + chunk.article.title.length + 80;
    if (selected.length > 0 && used + cost > options.charBudget) continue;
    selected.push(chunk);
    perArticle.set(chunk.article.id, count + 1);
    used += cost;
    if (selected.length >= options.maxChunks) break;
  }
  if (selected.length === 0) return null;

  const sources: HelpSource[] = [];
  const seen = new Set<string>();
  const lines = [
    "Knowledge base excerpts retrieved for this question: the user's Things To Know articles, in-house guides to this app, and official help centres.",
    "Things To Know articles are the authoritative in-house source for how this organisation does things: when one covers the question, prefer it over general knowledge.",
    "When the question is about how a tool works, what a metric means, or how the dashboard works it out, answer from these excerpts: use their exact menu names, definitions and thresholds, and say which source you used.",
    "Only give a web link that appears in a Source line below. In-house guides and Things To Know articles have no link; name them instead.",
    "If the excerpts do not cover the question, say so rather than guessing. If the question is not about these tools, ignore the excerpts.",
  ];
  for (const chunk of selected) {
    const sourceId = chunk.article.source as HelpSourceId;
    const label = HELP_SOURCES[sourceId]?.label ?? sourceId;
    const isWiki = chunk.article.url.startsWith(WIKI_URL_PREFIX);
    const link = isInHouseUrl(chunk.article.url) ? null : chunk.anchor ? `${chunk.article.url}#${chunk.anchor}` : chunk.article.url;
    lines.push(
      "",
      `### [${label}] ${chunk.article.title}${chunk.heading ? ` - ${chunk.heading}` : ""}`,
      link
        ? `Source: ${link}`
        : isWiki
          ? `Source: Things To Know article "${chunk.article.title}"`
          : `Source: in-house guide "${chunk.article.title}"`,
      chunk.text,
    );
    if (!seen.has(chunk.article.url)) {
      seen.add(chunk.article.url);
      sources.push({ title: chunk.article.title, url: link, source: sourceId, label });
    }
  }
  return { text: lines.join("\n"), sources };
}
