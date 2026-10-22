import { createHash } from "node:crypto";

// Pure pieces of the help knowledge base (RAG): turning help pages and local
// documents into heading-sized chunks, and merging search results. Everything
// that touches the network, disk or database lives in sources.ts and
// help-kb-store.ts.

// Chunks stay well inside nomic-embed-text's 2048-token window and small
// enough that several fit in the chat model's prompt.
const CHUNK_MAX_CHARS = 1800;
const CHUNK_MIN_CHARS = 300;

export type ParsedHelpSection = {
  // The section's anchor on the page, so a source can link straight to it.
  anchor: string;
  heading: string;
  text: string;
};

export type ParsedHelpArticle = {
  url: string;
  title: string;
  section: string;
  summary: string;
  sections: ParsedHelpSection[];
};

// --- Text helpers -----------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rarr: "→",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// Keeps the structure a reader (and the model) needs: list items as bullets,
// table cells separated, one line per block. Everything else is dropped.
export function helpHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<\/(p|div|li|ul|ol|tr|table|h[1-6]|blockquote|pre|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    // A stripped inline tag (<strong>Save</strong>.) leaves a space before punctuation.
    .replace(/ ([.,;:!?)])/g, "$1")
    .split("\n")
    .map((line) => line.trim().replace(/\s*\|\s*$/, ""))
    .filter((line) => line.length > 0 && line !== "-")
    .join("\n")
    .trim();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function metaDescription(html: string): string {
  return decodeEntities(/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? "").trim();
}

/**
 * Splits an HTML fragment into sections at its h2/h3 headings, keeping each
 * heading's id as the anchor. Text before the first heading becomes an
 * untitled opening section.
 */
export function splitHtmlOnHeadings(fragment: string): ParsedHelpSection[] {
  const cleaned = fragment.replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ");
  const headingPattern = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const sections: ParsedHelpSection[] = [];
  let cursor = 0;
  let current: { anchor: string; heading: string } = { anchor: "", heading: "" };

  const flush = (end: number) => {
    const text = helpHtmlToText(cleaned.slice(cursor, end));
    if (text) sections.push({ ...current, text });
  };

  for (const match of cleaned.matchAll(headingPattern)) {
    flush(match.index ?? 0);
    const heading = oneLine(helpHtmlToText(match[3]));
    const anchor = /\bid="([^"]+)"/.exec(match[2])?.[1] ?? "";
    current = { anchor, heading };
    cursor = (match.index ?? 0) + match[0].length;
  }
  flush(cleaned.length);
  return sections;
}

// --- Mailchimp --------------------------------------------------------------

export const MAILCHIMP_SITEMAP_URL = "https://mailchimp.com/main.xml";
const MAILCHIMP_HELP_PREFIX = "https://mailchimp.com/help/";

export function extractHelpUrls(sitemapXml: string): string[] {
  const urls = new Set<string>();
  for (const match of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = decodeEntities(match[1]);
    // The help index itself is a list of links, not an article.
    if (url.startsWith(MAILCHIMP_HELP_PREFIX) && url !== MAILCHIMP_HELP_PREFIX) urls.add(url);
  }
  return [...urls];
}

/**
 * Reads one Mailchimp help page. Articles are a run of
 * `<section class="helpArticle__section" id="…">` blocks, each opening with an
 * `<h2>`. A page with none (a category index, a redirect page) returns null
 * and is not stored.
 */
export function parseHelpArticle(html: string, url: string): ParsedHelpArticle | null {
  const sections: ParsedHelpSection[] = [];
  const sectionPattern = /<section\b[^>]*class="[^"]*helpArticle__section[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  for (const match of html.matchAll(sectionPattern)) {
    const anchor = /\bid="([^"]+)"/.exec(match[0].slice(0, match[0].indexOf(">") + 1))?.[1] ?? "";
    const inner = match[1];
    const headingMatch = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(inner);
    const heading = headingMatch ? oneLine(helpHtmlToText(headingMatch[1])) : "";
    const body = headingMatch ? inner.replace(headingMatch[0], " ") : inner;
    const text = helpHtmlToText(body);
    if (text) sections.push({ anchor, heading, text });
  }
  if (sections.length === 0) return null;

  const rawTitle = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = oneLine(helpHtmlToText(rawTitle).replace(/\s*\|\s*Mailchimp\s*$/i, "")) || url;

  // The breadcrumb's last link is the help-centre section ("Accounts", "Campaigns").
  const breadcrumbs = /<ul[^>]*class="[^"]*breadcrumbs[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1] ?? "";
  const crumbs = [...breadcrumbs.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((crumb) => helpHtmlToText(crumb[1]));
  const section = crumbs.length > 1 ? crumbs[crumbs.length - 1] : "";

  return { url, title, section, summary: metaDescription(html), sections };
}

// --- Google Analytics -------------------------------------------------------

export const GOOGLE_ANALYTICS_HELP_START_URL = "https://support.google.com/analytics/?hl=en";

export type GoogleAnalyticsLinks = { answers: string[]; topics: string[] };

// Help-centre links, normalised to one English URL per page so the ref_topic
// variants of the same answer are fetched once.
export function extractGoogleAnalyticsLinks(html: string): GoogleAnalyticsLinks {
  const answers = new Set<string>();
  const topics = new Set<string>();
  for (const match of html.matchAll(/href="(?:https:\/\/support\.google\.com)?\/analytics\/(answer|topic)\/(\d+)/g)) {
    const url = `https://support.google.com/analytics/${match[1]}/${match[2]}?hl=en`;
    (match[1] === "answer" ? answers : topics).add(url);
  }
  return { answers: [...answers], topics: [...topics] };
}

/**
 * Reads one Google Analytics help article: the region from the article
 * container to the "Was this helpful?" survey, split at its headings.
 * Universal Analytics articles ("[UA] …") describe the retired product and are
 * skipped, so answers are always about GA4.
 */
export function parseGoogleAnalyticsArticle(html: string, url: string): ParsedHelpArticle | null {
  const marker = html.indexOf('class="article-container"');
  if (marker === -1) return null;
  // From the container's opening "<", so none of its attributes leak into the text.
  let region = html.slice(html.lastIndexOf("<", marker));
  const ends = ['class="sub-article-container', "article-survey-container", "Was this helpful"]
    .map((marker) => region.indexOf(marker))
    .filter((index) => index > 0);
  if (ends.length) region = region.slice(0, Math.min(...ends));

  const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(region);
  const title = titleMatch ? oneLine(helpHtmlToText(titleMatch[1])) : "";
  if (!title || /^\[UA\]/i.test(title)) return null;
  if (titleMatch) region = region.replace(titleMatch[0], " ");

  const sections = splitHtmlOnHeadings(region);
  if (sections.length === 0) return null;
  return { url, title, section: "Google Analytics", summary: metaDescription(html), sections };
}

// --- Local documents --------------------------------------------------------

/** Markdown split at its #, ## and ### headings; the first # heading is the title. */
export function parseMarkdownDocument(markdown: string, url: string, fallbackTitle: string): ParsedHelpArticle | null {
  const sections: ParsedHelpSection[] = [];
  let title = "";
  let current: ParsedHelpSection = { anchor: "", heading: "", text: "" };
  const lines: string[] = [];

  const flush = () => {
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) sections.push({ ...current, text });
    lines.length = 0;
  };

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2].trim();
      if (heading[1] === "#" && !title) title = text;
      current = { anchor: slugify(text), heading: heading[1] === "#" ? "" : text, text: "" };
      continue;
    }
    lines.push(line);
  }
  flush();
  if (sections.length === 0) return null;
  return { url, title: title || fallbackTitle, section: "", summary: "", sections };
}

/** A saved web page or HTML export: its main content split at headings. */
export function parseHtmlDocument(html: string, url: string, fallbackTitle: string): ParsedHelpArticle | null {
  const title =
    oneLine(helpHtmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "")) ||
    oneLine(helpHtmlToText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")) ||
    fallbackTitle;
  const body =
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ??
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ??
    /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ??
    html;
  const sections = splitHtmlOnHeadings(body.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, " "));
  if (sections.length === 0) return null;
  return { url, title, section: "", summary: metaDescription(html), sections };
}

/** Plain text, or the text of a PDF with one section per page. */
export function parseTextDocument(
  text: string,
  url: string,
  title: string,
  pages?: readonly string[],
): ParsedHelpArticle | null {
  const sections: ParsedHelpSection[] = pages
    ? pages
        .map((page, index) => ({ anchor: `page=${index + 1}`, heading: `Page ${index + 1}`, text: page.replace(/\s+/g, " ").trim() }))
        .filter((section) => section.text.length > 0)
    : text.trim()
      ? [{ anchor: "", heading: "", text: text.replace(/\r\n?/g, "\n").trim() }]
      : [];
  if (sections.length === 0) return null;
  return { url, title, section: "", summary: "", sections };
}

// --- Chunking ---------------------------------------------------------------

export type HelpChunk = {
  anchor: string;
  heading: string;
  text: string;
};

// Splits on lines, so a long section breaks between steps rather than
// mid-sentence. An over-long line is split between sentences, and cut hard
// only as a last resort.
function splitLongText(text: string): string[] {
  const pieces: string[] = [];
  let current = "";
  const units = text.split("\n").flatMap((line) =>
    line.length <= CHUNK_MAX_CHARS ? [line] : line.split(/(?<=[.!?])\s+/),
  );
  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;
    if (candidate.length <= CHUNK_MAX_CHARS) {
      current = candidate;
      continue;
    }
    if (current) pieces.push(current);
    current = unit;
    while (current.length > CHUNK_MAX_CHARS) {
      pieces.push(current.slice(0, CHUNK_MAX_CHARS));
      current = current.slice(CHUNK_MAX_CHARS);
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * One chunk per section, which is how a help page already divides a topic.
 * Long sections are split; short ones are folded into the next so a two-line
 * "Before you start" does not become a chunk with nothing to retrieve on.
 */
export function chunkHelpArticle(article: ParsedHelpArticle): HelpChunk[] {
  const chunks: HelpChunk[] = [];
  let carry: HelpChunk | null = null;

  for (const section of article.sections) {
    const merged: HelpChunk = carry
      ? {
          anchor: carry.anchor,
          heading: carry.heading && section.heading ? `${carry.heading} / ${section.heading}` : carry.heading || section.heading,
          text: `${carry.text}\n${section.heading ? `${section.heading}:\n` : ""}${section.text}`,
        }
      : { anchor: section.anchor, heading: section.heading, text: section.text };
    carry = null;

    if (merged.text.length < CHUNK_MIN_CHARS) {
      carry = merged;
      continue;
    }
    for (const piece of splitLongText(merged.text)) {
      chunks.push({ anchor: merged.anchor, heading: merged.heading, text: piece });
    }
  }

  if (carry) {
    // A short tail joins the previous chunk when it fits, else stands alone.
    const last = chunks[chunks.length - 1];
    if (last && last.text.length + carry.text.length < CHUNK_MAX_CHARS) {
      last.text = `${last.text}\n${carry.heading ? `${carry.heading}:\n` : ""}${carry.text}`;
    } else {
      chunks.push(carry);
    }
  }
  return chunks;
}

// What gets embedded: the article title gives a section like "Overview" the
// context it needs to be found.
export function chunkEmbeddingText(title: string, chunk: Pick<HelpChunk, "heading" | "text">): string {
  return `${title}${chunk.heading ? ` - ${chunk.heading}` : ""}\n${chunk.text}`;
}

export function hashHelpArticle(article: ParsedHelpArticle): string {
  return createHash("sha256")
    .update(JSON.stringify([article.title, article.section, article.sections]))
    .digest("hex");
}

// --- Retrieval --------------------------------------------------------------

/**
 * Reciprocal rank fusion: merges the vector and full-text result lists by rank
 * rather than raw score, since cosine similarity and ts_rank are not on the
 * same scale. k=60 is the standard constant from the original paper.
 */
export function reciprocalRankFusion(
  lists: ReadonlyArray<readonly number[]>,
  k = 60,
  weights: readonly number[] = [],
): Array<{ id: number; score: number }> {
  const scores = new Map<number, number>();
  lists.forEach((list, index) => {
    const weight = weights[index] ?? 1;
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank + 1));
    });
  });
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score);
}

// Words too common to help a full-text search; the rest are OR-ed so a
// natural question still matches chunks that only share some of its words.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "our", "with", "that", "this", "what", "when",
  "where", "which", "who", "how", "why", "can", "does", "did", "was", "were", "has", "have", "had",
  "from", "into", "about", "there", "their", "them", "they", "its", "all", "any", "some", "get",
  "use", "using", "should", "would", "could", "please", "tell", "give", "need", "want", "know",
  "make", "your", "just", "like", "more", "mailchimp", "help", "way", "able", "possible",
]);

function queryTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function buildFullTextQuery(text: string): string {
  return [...new Set(queryTokens(text))].slice(0, 24).join(" | ");
}

/**
 * Consecutive word pairs from the question as Postgres phrase searches
 * ("review <-> spend"), OR-ed together. A named thing the user asks about (a
 * dashboard label, a metric, a menu item) is matched as that exact phrase,
 * which the single-word search above cannot tell apart from the words
 * scattered through a long glossary.
 */
export function buildPhraseQuery(text: string): string {
  const tokens = queryTokens(text);
  const pairs = new Set<string>();
  for (let index = 1; index < tokens.length; index++) pairs.add(`${tokens[index - 1]} <-> ${tokens[index]}`);
  return [...pairs].slice(0, 16).join(" | ");
}
