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

// Options for a category <select class="form-control">, the same control the wiki uses. A snippet
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
    ? `<span class="snippets-list__description min-w-0 text-ghost text-small nowrap">${escapeHtml(snippet.description)}</span>`
    : "";

  return `
    <article class="wiki-list__row list-row" data-snippet-id="${snippet.id}">
      <a class="wiki-list__main flex items-center text-body min-w-0" href="/snippets?snippet=${snippet.id}" data-snippet-copy data-snippet-row title="Click to copy to clipboard">
        <span class="wiki-list__title flex items-center gap-6 text-strong min-w-0">
          ${escapeHtml(snippet.title)}
          ${snippet.language ? `<span class="snippets-list__language text-muted badge">${escapeHtml(snippet.language)}</span>` : ""}
        </span>
        ${description}
      </a>
      <textarea class="snippets-list__code" data-snippet-code hidden aria-hidden="true">${escapeHtml(snippet.code)}</textarea>
      <div class="wiki-list__actions flex gap-6">
        <button type="button" class="wiki-list__button button-icon" data-snippet-copy data-snippet-copy-icon title="Copy to clipboard"><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon" data-snippet-action="edit" data-snippet-id="${snippet.id}" title="Edit"><i class="bi bi-pencil ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon" data-snippet-action="duplicate" data-snippet-id="${snippet.id}" title="Duplicate"><i class="bi bi-copy ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon wiki-list__button--danger button-danger" data-snippet-action="delete" data-snippet-id="${snippet.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
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
        <section class="wiki-list__group flex flex-col">
          <h3 class="wiki-list__group-heading text-strong font-strong">${escapeHtml(name)}</h3>
          <div class="wiki-list__group-articles flex flex-col gap-4">${rows.map(renderSnippetRow).join("")}</div>
        </section>
      `,
    )
    .join("");
}

// The one "Add a code snippet" modal, used by the list's Add button and by the
// chat's "Save as snippet" (which fills the hidden code/language fields).
export function renderSnippetCreateDialog(categories: string[]): string {
  return `
    <dialog class="wiki-modal text-body" data-snippet-create-dialog aria-label="Add a code snippet">
      <form class="wiki-modal__form flex flex-col gap-12" data-snippet-create>
        <h2 class="wiki-modal__title text-strong">Add a code snippet</h2>
        <label class="wiki-modal__field field-label">
          <span>Title</span>
          <input class="form-control" type="text" name="title" maxlength="200" required placeholder="What is this snippet for?" autocomplete="off" />
        </label>
        <label class="wiki-modal__field field-label">
          <span>Category</span>
          <select class="form-control" name="category">${renderSnippetCategoryOptions(categories, "General")}</select>
        </label>
        <input type="hidden" name="language" value="" />
        <input type="hidden" name="code" value="" />
        <p class="wiki-modal__hint text-ghost text-small">New categories are added from Categories on the list.</p>
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-snippet-create-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Create</span></button>
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
        <li class="wiki-categories__row flex items-center gap-8" data-snippet-category-id="${category.id}">
          <input
            type="text"
            class="wiki-categories__name min-w-0 form-control"
            value="${escapeHtml(category.name)}"
            maxlength="80"
            aria-label="Category name"
            data-snippet-category-name
          />
          <span class="wiki-categories__count text-ghost text-small nowrap">${category.snippetCount} snippet${category.snippetCount === 1 ? "" : "s"}</span>
          ${
            category.isProtected
              ? `<span class="wiki-categories__locked text-ghost button-icon" title="The default category cannot be deleted"><i class="bi bi-lock ui-icon" aria-hidden="true"></i></span>`
              : `<button type="button" class="wiki-categories__delete button-danger button-icon" data-snippet-category-delete title="Delete category"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>`
          }
        </li>
      `,
    )
    .join("");

  return `
    <dialog class="wiki-modal text-body wiki-modal--wide" data-snippet-categories-dialog aria-label="Manage categories">
      <div class="wiki-modal__form flex flex-col gap-12">
        <h2 class="wiki-modal__title text-strong">Categories</h2>
        <p class="wiki-modal__hint text-ghost text-small">Renaming a category re-files every snippet under it. Deleting one moves its snippets to General.</p>

        <ul class="wiki-categories__list flex flex-col gap-6">
          ${rows || `<li class="wiki-categories__empty text-empty text-small">No categories yet.</li>`}
        </ul>

        <form class="wiki-categories__add flex gap-8" data-snippet-category-create>
          <input class="form-control" type="text" name="name" maxlength="80" required placeholder="New category name" autocomplete="off" aria-label="New category name" />
          <button class="button-md" type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>

        <p class="wiki-categories__status text-ghost text-small" data-snippet-category-status role="status" aria-live="polite"></p>

        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-snippet-categories-close><span>Done</span></button>
        </div>
      </div>
    </dialog>
  `;
}

export function renderSnippetListPanel(options: SnippetListPanelOptions): string {
  const emptyMessage = `<p class="wiki-list__empty">No snippets yet. Use Add to save the first one.</p>`;

  return `
    <div class="wiki-list" data-snippet-list>
      <div class="wiki-list__header flex items-center gap-10">
        <button type="button" class="wiki-list__add nowrap button-md" data-snippet-categories><i class="bi bi-tags ui-icon" aria-hidden="true"></i><span>Categories</span></button>
        <button type="button" class="wiki-list__add nowrap button-md" data-snippet-add><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
      </div>

      <div class="wiki-list__rows flex flex-col">
        ${options.snippets.length ? renderGroups(options.snippets, options.categories) : emptyMessage}
      </div>

      ${renderCategoriesDialog(options.categories)}
    </div>
  `;
}
