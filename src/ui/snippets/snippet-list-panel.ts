import type { CodeSnippetCategoryView, CodeSnippetView } from "../../storage/code-snippet-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type SnippetListPanelOptions = {
  snippets: CodeSnippetView[];
  categories: CodeSnippetCategoryView[];
};

// Options for a category <select>, the same control the wiki uses. A snippet
// whose category was renamed or removed elsewhere still shows its own value,
// so the select never silently re-files it.
export function renderSnippetCategoryOptions(categories: string[], selected: string): string {
  const available = selected && !categories.includes(selected) ? [selected, ...categories] : categories;
  return available
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}"${category === selected ? " selected" : ""}>${escapeHtml(category)}</option>`,
    )
    .join("");
}

function renderSnippetRow(snippet: CodeSnippetView): string {
  // Clicking a snippet copies its code, the common case; editing is the pencil
  // button. The description sits beside the title in small grey text.
  const description = snippet.description
    ? `<span class="snippets-list__description">${escapeHtml(snippet.description)}</span>`
    : "";

  return `
    <article class="wiki-list__row" data-snippet-id="${snippet.id}">
      <a class="wiki-list__main" href="/snippets?snippet=${snippet.id}" data-snippet-copy data-snippet-row title="Click to copy to clipboard">
        <span class="wiki-list__title">
          ${escapeHtml(snippet.title)}
          ${snippet.language ? `<span class="snippets-list__language">${escapeHtml(snippet.language)}</span>` : ""}
        </span>
        ${description}
      </a>
      <textarea class="snippets-list__code" data-snippet-code hidden aria-hidden="true">${escapeHtml(snippet.code)}</textarea>
      <div class="wiki-list__actions">
        <button type="button" class="wiki-list__button" data-snippet-copy data-snippet-copy-icon title="Copy to clipboard"><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button" data-snippet-action="edit" data-snippet-id="${snippet.id}" title="Edit"><i class="bi bi-pencil ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button" data-snippet-action="duplicate" data-snippet-id="${snippet.id}" title="Duplicate"><i class="bi bi-copy ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button wiki-list__button--danger" data-snippet-action="delete" data-snippet-id="${snippet.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

// Snippets sit under their category heading, using the wiki list's grouping,
// in the category list's order. A category nobody uses is skipped, and one a
// snippet claims that is not in the list still renders, after the known ones.
function renderGroups(snippets: CodeSnippetView[], categories: CodeSnippetCategoryView[]): string {
  const groups = new Map<string, CodeSnippetView[]>();
  for (const snippet of snippets) {
    const existing = groups.get(snippet.category);
    if (existing) existing.push(snippet);
    else groups.set(snippet.category, [snippet]);
  }

  const ordered: Array<[string, CodeSnippetView[]]> = [];
  for (const category of categories) {
    const rows = groups.get(category.name);
    if (!rows) continue;
    ordered.push([category.name, rows]);
    groups.delete(category.name);
  }
  ordered.push(...groups);

  return ordered
    .map(
      ([name, rows]) => `
        <section class="wiki-list__group">
          <h3 class="wiki-list__group-heading">${escapeHtml(name)}</h3>
          <div class="wiki-list__group-articles">${rows.map(renderSnippetRow).join("")}</div>
        </section>
      `,
    )
    .join("");
}

// The one "Add a code snippet" modal, used by the list's Add button and by the
// chat's "Save as snippet" (which fills the hidden code/language fields).
export function renderSnippetCreateDialog(categories: string[]): string {
  return `
    <dialog class="wiki-modal" data-snippet-create-dialog aria-label="Add a code snippet">
      <form class="wiki-modal__form" data-snippet-create>
        <h2 class="wiki-modal__title">Add a code snippet</h2>
        <label class="wiki-modal__field">
          <span>Title</span>
          <input type="text" name="title" maxlength="200" required placeholder="What is this snippet for?" autocomplete="off" />
        </label>
        <label class="wiki-modal__field">
          <span>Category</span>
          <select name="category">${renderSnippetCategoryOptions(categories, "General")}</select>
        </label>
        <input type="hidden" name="language" value="" />
        <input type="hidden" name="code" value="" />
        <p class="wiki-modal__hint">New categories are added from Categories on the list.</p>
        <div class="wiki-modal__actions">
          <button type="button" class="wiki-modal__cancel" data-snippet-create-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Create</span></button>
        </div>
      </form>
    </dialog>
  `;
}

// Categories are managed here rather than in the editor, because they are
// global: renaming one re-files every snippet under it. Same modal as the wiki.
function renderCategoriesDialog(categories: CodeSnippetCategoryView[]): string {
  const rows = categories
    .map(
      (category) => `
        <li class="wiki-categories__row" data-snippet-category-id="${category.id}">
          <input
            type="text"
            class="wiki-categories__name"
            value="${escapeHtml(category.name)}"
            maxlength="80"
            aria-label="Category name"
            data-snippet-category-name
          />
          <span class="wiki-categories__count">${category.snippetCount} snippet${category.snippetCount === 1 ? "" : "s"}</span>
          ${
            category.isProtected
              ? `<span class="wiki-categories__locked" title="The default category cannot be deleted"><i class="bi bi-lock ui-icon" aria-hidden="true"></i></span>`
              : `<button type="button" class="wiki-categories__delete" data-snippet-category-delete title="Delete category"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>`
          }
        </li>
      `,
    )
    .join("");

  return `
    <dialog class="wiki-modal wiki-modal--wide" data-snippet-categories-dialog aria-label="Manage categories">
      <div class="wiki-modal__form">
        <h2 class="wiki-modal__title">Categories</h2>
        <p class="wiki-modal__hint">Renaming a category re-files every snippet under it. Deleting one moves its snippets to General.</p>

        <ul class="wiki-categories__list">
          ${rows || `<li class="wiki-categories__empty">No categories yet.</li>`}
        </ul>

        <form class="wiki-categories__add" data-snippet-category-create>
          <input type="text" name="name" maxlength="80" required placeholder="New category name" autocomplete="off" aria-label="New category name" />
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>

        <p class="wiki-categories__status" data-snippet-category-status role="status" aria-live="polite"></p>

        <div class="wiki-modal__actions">
          <button type="button" class="wiki-modal__cancel" data-snippet-categories-close><span>Done</span></button>
        </div>
      </div>
    </dialog>
  `;
}

export function renderSnippetListPanel(options: SnippetListPanelOptions): string {
  const emptyMessage = `<p class="wiki-list__empty">No snippets yet. Use Add to save the first one.</p>`;

  return `
    <div class="wiki-list" data-snippet-list>
      <div class="wiki-list__header">
        <button type="button" class="wiki-list__add" data-snippet-categories><i class="bi bi-tags ui-icon" aria-hidden="true"></i><span>Categories</span></button>
        <button type="button" class="wiki-list__add" data-snippet-add><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
      </div>

      <div class="wiki-list__rows">
        ${options.snippets.length ? renderGroups(options.snippets, options.categories) : emptyMessage}
      </div>

      ${renderCategoriesDialog(options.categories)}
    </div>
  `;
}
