import { splitHtmlOnHeadings, type ParsedHelpArticle, type ParsedHelpSection } from "./parse.js";

// Things To Know articles as help knowledge base documents. Every live
// (non-archived) article is indexed, so the chats find one by what it says,
// the same way they find a help page; none is sent unless it is relevant.

export const WIKI_URL_PREFIX = "wiki:";

export type WikiSourceRow = {
  id: number;
  title: string;
  category: string;
  tags: string;
  summary: string;
  contentHtml: string;
};

export function wikiArticleUrl(id: number): string {
  return `${WIKI_URL_PREFIX}${id}`;
}

/**
 * One wiki article as a parsed help document, split at its headings. The
 * summary and tags open the first chunk, so a question can match on them as
 * well as on the body. An article with no body yet returns null and is not
 * indexed.
 */
export function wikiArticleToHelpArticle(row: WikiSourceRow): ParsedHelpArticle | null {
  const body = splitHtmlOnHeadings(row.contentHtml);
  if (body.length === 0) return null;

  const tags = row.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const opening = [row.summary.trim(), tags.length ? `Tags: ${tags.join(", ")}` : ""].filter(Boolean).join("\n");
  const sections: ParsedHelpSection[] = opening ? [{ anchor: "", heading: "", text: opening }, ...body] : body;

  return {
    url: wikiArticleUrl(row.id),
    title: row.title,
    section: row.category,
    summary: row.summary,
    sections,
  };
}
