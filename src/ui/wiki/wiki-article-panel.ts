import type { WikiArticleView } from "../../storage/wiki-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type WikiArticlePanelOptions = {
  article: WikiArticleView | null;
};

// The default view for an article: read it. Editing is a deliberate step behind
// the Edit button, because reading is what happens nearly every time.
export function renderWikiArticlePanel(options: WikiArticlePanelOptions): string {
  const article = options.article;

  if (!article) {
    return `<div class="wiki-article wiki-article--empty"><p>Select an article from the list to read it.</p></div>`;
  }

  const tags = article.tags
    .map((tag) => `<span class="wiki-article__tag badge">${escapeHtml(tag)}</span>`)
    .join("");

  return `
    <div class="wiki-article" data-wiki-article data-wiki-id="${article.id}">
      <header class="wiki-article__header flex items-start justify-between gap-16">
        <div class="wiki-article__heading flex flex-col gap-4 min-w-0">
          <h2 class="wiki-article__title flex items-center gap-8 text-strong">
            ${article.isPinned ? `<i class="bi bi-pin-angle-fill ui-icon wiki-article__pin text-accent" aria-label="Pinned to AI chat" title="Always sent to AI chat"></i>` : ""}
            ${escapeHtml(article.title)}
          </h2>
          ${article.summary ? `<p class="wiki-article__summary text-body">${escapeHtml(article.summary)}</p>` : ""}
        </div>
        <div class="wiki-article__actions flex items-center gap-8">
          <button type="button" class="wiki-article__copy nowrap button-md" data-wiki-copy><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy to clipboard</span></button>
          ${
            article.isArchived
              ? `<button type="button" class="wiki-article__edit text-body nowrap button-md" data-wiki-action="restore" data-wiki-id="${article.id}"><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i><span>Restore</span></button>`
              : `<button type="button" class="wiki-article__edit text-body nowrap button-md" data-wiki-action="archive" data-wiki-id="${article.id}"><i class="bi bi-archive ui-icon" aria-hidden="true"></i><span>Archive</span></button>`
          }
          <button type="button" class="wiki-article__edit text-body nowrap button-md wiki-article__edit--danger button-danger" data-wiki-action="delete" data-wiki-id="${article.id}"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i><span>Delete</span></button>
          <a class="wiki-article__edit text-body nowrap button-md" href="/wiki?panel=wiki-editor&article=${article.id}">
            <i class="bi bi-pencil ui-icon" aria-hidden="true"></i><span>Edit</span>
          </a>
        </div>
      </header>

      ${article.isArchived ? `<p class="wiki-article__archived-note flex items-center gap-8 note-box"><i class="bi bi-archive ui-icon" aria-hidden="true"></i><span>Archived — hidden from the wiki and never sent to AI chat.</span></p>` : ""}

      <p class="wiki-article__meta flex flex-wrap items-center gap-10 text-ghost text-small">
        <span class="wiki-article__category badge">${escapeHtml(article.category)}</span>
        <span>Updated ${escapeHtml(formatTimestamp(article.updatedAt))}</span>
      </p>

      <div class="wiki-article__body rich-text" data-wiki-article-body>
        ${article.contentHtml || `<p class="wiki-article__blank text-empty text-small">This article has no content yet. Use Edit to write it.</p>`}
      </div>

      ${tags ? `<div class="wiki-article__tags flex flex-wrap gap-6">${tags}</div>` : ""}
    </div>
  `;
}
