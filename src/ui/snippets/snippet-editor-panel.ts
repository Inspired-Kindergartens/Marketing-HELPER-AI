import type { CodeSnippetView } from "../../storage/code-snippet-store.js";
import { renderSnippetCategoryOptions } from "./snippet-list-panel.js";

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

export type SnippetEditorPanelOptions = {
  snippet: CodeSnippetView | null;
  categories: string[];
};

export function renderSnippetEditorPanel(options: SnippetEditorPanelOptions): string {
  const snippet = options.snippet;

  if (!snippet) {
    return `<div class="wiki-editor wiki-editor--empty"><p>Select a snippet from the list to edit it.</p></div>`;
  }

  return `
    <div class="wiki-editor" data-snippet-editor data-snippet-id="${snippet.id}">
      <form class="wiki-editor__fields" data-snippet-edit>
        <label class="wiki-editor__field wiki-editor__field--title">
          <span>Title</span>
          <input type="text" name="title" maxlength="200" value="${escapeHtml(snippet.title)}" required />
        </label>
        <div class="wiki-editor__field-row">
          <label class="wiki-editor__field">
            <span>Category</span>
            <select name="category">${renderSnippetCategoryOptions(options.categories, snippet.category)}</select>
          </label>
          <label class="wiki-editor__field">
            <span>Language <small>optional, e.g. HTML, CSS, JavaScript</small></span>
            <input type="text" name="language" maxlength="40" value="${escapeHtml(snippet.language)}" autocomplete="off" />
          </label>
        </div>
        <label class="wiki-editor__field">
          <span>Description <small>where and how it is used</small></span>
          <input type="text" name="description" maxlength="400" value="${escapeHtml(snippet.description)}" />
        </label>
        <label class="wiki-editor__field">
          <span>Code</span>
          <textarea class="snippet-editor__code" name="code" spellcheck="false" autocomplete="off" data-snippet-code>${escapeHtml(snippet.code)}</textarea>
        </label>
      </form>


      <div class="wiki-editor__footer">
        <button type="button" class="wiki-editor__save" data-snippet-copy><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy to clipboard</span></button>
        <button type="button" class="wiki-editor__save" data-snippet-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
        <span class="wiki-editor__status" data-snippet-status role="status" aria-live="polite">Last saved ${escapeHtml(formatTimestamp(snippet.updatedAt))}</span>
      </div>
    </div>
  `;
}
