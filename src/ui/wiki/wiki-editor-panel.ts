import type { WikiArticleView } from "../../storage/wiki-store.js";
import { renderWikiRichText } from "./wiki-rich-text.js";

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

export type WikiEditorPanelOptions = {
  article: WikiArticleView | null;
  categories: string[];
};

export function renderWikiEditorPanel(options: WikiEditorPanelOptions): string {
  const article = options.article;

  if (!article) {
    return `<div class="wiki-editor wiki-editor--empty"><p>Select an article from the list to read or edit it.</p></div>`;
  }

  // Category is AI-assigned from the managed list. It stays editable because a
  // local model will occasionally misfile something, but the user picks from
  // the existing categories rather than inventing one here - new categories are
  // created in the Categories modal on the list page.
  // An article whose category was renamed or removed elsewhere still shows its
  // own value, so the select never silently re-files it.
  const available =
    article.category && !options.categories.includes(article.category)
      ? [article.category, ...options.categories]
      : options.categories;
  const categoryOptions = available.map(
    (category) =>
      `<option value="${escapeHtml(category)}"${category === article.category ? " selected" : ""}>${escapeHtml(category)}</option>`,
  ).join("");

  return `
    <div class="wiki-editor" data-wiki-editor data-wiki-id="${article.id}">
      <form class="wiki-editor__fields" data-wiki-edit>
        <label class="wiki-editor__field wiki-editor__field--title">
          <span>Title</span>
          <input type="text" name="title" maxlength="200" value="${escapeHtml(article.title)}" required />
        </label>
        <label class="wiki-editor__field">
          <span>Summary <small>one line — always sent to the AI</small></span>
          <input type="text" name="summary" maxlength="400" value="${escapeHtml(article.summary)}" placeholder="The gist in a sentence" />
        </label>
        <div class="wiki-editor__field-row">
          <label class="wiki-editor__field">
            <span>Category <small>set by AI</small></span>
            <select name="category">${categoryOptions}</select>
          </label>
          <label class="wiki-editor__field">
            <span>Tags <small>set by AI — these drive what it finds</small></span>
            <input type="text" name="tags" maxlength="400" value="${escapeHtml(article.tags.join(", "))}" data-wiki-tags-field placeholder="Generated once the article has content" />
          </label>
        </div>
        <label class="wiki-editor__pin">
          <input type="checkbox" name="isPinned" value="true"${article.isPinned ? " checked" : ""} />
          <span>Pin to AI chat — always include this article, whatever the question</span>
        </label>
      </form>

      ${renderWikiRichText({
        contentAttribute: "data-wiki-content",
        html: article.contentHtml,
        trailingButtons: `
          <button type="button" class="wiki-editor__regenerate" data-wiki-regenerate><i class="bi bi-stars ui-icon" aria-hidden="true"></i><span>Regenerate tags</span></button>
          <button type="button" class="wiki-editor__copy" data-wiki-copy><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy to clipboard</span></button>
        `,
      })}

      <div class="wiki-editor__footer">
        <button type="button" class="wiki-editor__save" data-wiki-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
        <span class="wiki-editor__status" data-wiki-status role="status" aria-live="polite">Last saved ${escapeHtml(formatTimestamp(article.updatedAt))}</span>
      </div>
    </div>
  `;
}
