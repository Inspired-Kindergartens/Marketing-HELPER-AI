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
    .map((tag) => `<span class="wiki-article__tag">${escapeHtml(tag)}</span>`)
    .join("");

  return `
    <div class="wiki-article" data-wiki-article data-wiki-id="${article.id}">
      <header class="wiki-article__header">
        <div class="wiki-article__heading">
          <h2 class="wiki-article__title">
            ${article.isPinned ? `<i class="bi bi-pin-angle-fill ui-icon wiki-article__pin" aria-label="Pinned to AI chat" title="Always sent to AI chat"></i>` : ""}
            ${escapeHtml(article.title)}
          </h2>
          ${article.summary ? `<p class="wiki-article__summary">${escapeHtml(article.summary)}</p>` : ""}
        </div>
        <div class="wiki-article__actions">
          <button type="button" class="wiki-article__copy" data-wiki-copy><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy to clipboard</span></button>
          ${
            article.isArchived
              ? `<button type="button" class="wiki-article__edit" data-wiki-action="restore" data-wiki-id="${article.id}"><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i><span>Restore</span></button>`
              : `<button type="button" class="wiki-article__edit" data-wiki-action="archive" data-wiki-id="${article.id}"><i class="bi bi-archive ui-icon" aria-hidden="true"></i><span>Archive</span></button>`
          }
          <button type="button" class="wiki-article__edit wiki-article__edit--danger" data-wiki-action="delete" data-wiki-id="${article.id}"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i><span>Delete</span></button>
          <a class="wiki-article__edit" href="/wiki?panel=wiki-editor&article=${article.id}">
            <i class="bi bi-pencil ui-icon" aria-hidden="true"></i><span>Edit</span>
          </a>
        </div>
      </header>

      ${article.isArchived ? `<p class="wiki-article__archived-note"><i class="bi bi-archive ui-icon" aria-hidden="true"></i><span>Archived — hidden from the wiki and never sent to AI chat.</span></p>` : ""}

      <p class="wiki-article__meta">
        <span class="wiki-article__category">${escapeHtml(article.category)}</span>
        <span>Updated ${escapeHtml(formatTimestamp(article.updatedAt))}</span>
      </p>

      <div class="wiki-article__body" data-wiki-article-body>
        ${article.contentHtml || `<p class="wiki-article__blank">This article has no content yet. Use Edit to write it.</p>`}
      </div>

      ${tags ? `<div class="wiki-article__tags">${tags}</div>` : ""}
    </div>
  `;
}
