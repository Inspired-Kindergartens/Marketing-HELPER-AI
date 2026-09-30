import type { WikiArticleListItem, WikiCategoryView } from "../../storage/wiki-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type WikiListPanelOptions = {
  articles: WikiArticleListItem[];
  search: string;
  categories: WikiCategoryView[];
  // Whether the archive shelf is being shown instead of the live wiki.
  showArchived: boolean;
  archivedCount: number;
};

function renderArticleRow(article: WikiArticleListItem): string {
  // Clicking an article opens it for reading; editing is a step from there.
  const href = `/wiki?panel=wiki-article&article=${article.id}`;
  // The row carries the title alone. The summary is the one thing worth
  // knowing before opening an article, so it rides along as a hover popup
  // rather than a second line on every row. An article with no summary yet is
  // still being classified by the background pass, so the popup says so
  // instead of appearing empty.
  const tip = article.summary
    ? `<span class="wiki-list__tip" role="tooltip">${escapeHtml(article.summary)}</span>`
    : `<span class="wiki-list__tip wiki-list__tip--pending" role="tooltip" data-wiki-tagging="${article.id}">Tagging…</span>`;

  return `
    <article class="wiki-list__row" data-wiki-id="${article.id}">
      <a class="wiki-list__main" href="${href}">
        <span class="wiki-list__title">
          ${article.isPinned ? `<i class="bi bi-pin-angle-fill ui-icon wiki-list__pin-icon" aria-label="Pinned" title="Always sent to AI chat"></i>` : ""}
          ${escapeHtml(article.title)}
        </span>
        ${tip}
      </a>
      <div class="wiki-list__actions">
        ${
          article.isArchived
            ? `<button type="button" class="wiki-list__button" data-wiki-action="restore" data-wiki-id="${article.id}" title="Restore to the wiki"><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i></button>`
            : `<button type="button" class="wiki-list__button" data-wiki-action="pin" data-wiki-id="${article.id}" title="${article.isPinned ? "Unpin from AI chat" : "Pin to AI chat"}" aria-pressed="${article.isPinned ? "true" : "false"}"><i class="bi ${article.isPinned ? "bi-pin-angle-fill" : "bi-pin-angle"} ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button" data-wiki-action="duplicate" data-wiki-id="${article.id}" title="Duplicate"><i class="bi bi-copy ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button" data-wiki-action="archive" data-wiki-id="${article.id}" title="Archive"><i class="bi bi-archive ui-icon" aria-hidden="true"></i></button>`
        }
        <button type="button" class="wiki-list__button wiki-list__button--danger" data-wiki-action="delete" data-wiki-id="${article.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

// Articles sit under their category heading so a long wiki stays scannable.
// Categories are AI-assigned from a closed list, so this grouping stays stable.
//
// The group order follows the category list's stored sortOrder, which is what
// dragging a heading rewrites. A category holding no articles is skipped, and
// any category an article claims that is not in the list (a rename mid-flight)
// still renders, after the known ones, so no article can go missing.
function renderGroups(articles: WikiArticleListItem[], categories: WikiCategoryView[]): string {
  const groups = new Map<string, WikiArticleListItem[]>();
  for (const article of articles) {
    const existing = groups.get(article.category);
    if (existing) {
      existing.push(article);
    } else {
      groups.set(article.category, [article]);
    }
  }

  const ordered: Array<{ id: number | null; name: string; rows: WikiArticleListItem[] }> = [];
  for (const category of categories) {
    const rows = groups.get(category.name);
    if (!rows) continue;
    ordered.push({ id: category.id, name: category.name, rows });
    groups.delete(category.name);
  }
  for (const [name, rows] of groups) {
    ordered.push({ id: null, name, rows });
  }

  return ordered
    .map(
      (group) => `
        <section class="wiki-list__group"${group.id == null ? "" : ` draggable="true" data-wiki-category-order="${group.id}"`}>
          <h3 class="wiki-list__group-heading">${escapeHtml(group.name)}</h3>
          <div class="wiki-list__group-articles">${group.rows.map(renderArticleRow).join("")}</div>
        </section>
      `,
    )
    .join("");
}

// Categories are managed here rather than in the article editor, because they
// are global: renaming one re-files every article under it.
function renderCategoriesDialog(categories: WikiCategoryView[]): string {
  const rows = categories
    .map(
      (category) => `
        <li class="wiki-categories__row" data-wiki-category-id="${category.id}">
          <input
            type="text"
            class="wiki-categories__name"
            value="${escapeHtml(category.name)}"
            maxlength="80"
            aria-label="Category name"
            data-wiki-category-name
          />
          <span class="wiki-categories__count">${category.articleCount} article${category.articleCount === 1 ? "" : "s"}</span>
          ${
            category.isProtected
              ? `<span class="wiki-categories__locked" title="The default category cannot be deleted"><i class="bi bi-lock ui-icon" aria-hidden="true"></i></span>`
              : `<button type="button" class="wiki-categories__delete" data-wiki-category-delete title="Delete category"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>`
          }
        </li>
      `,
    )
    .join("");

  return `
    <dialog class="wiki-modal wiki-modal--wide" data-wiki-categories-dialog aria-label="Manage categories">
      <div class="wiki-modal__form">
        <h2 class="wiki-modal__title">Categories</h2>
        <p class="wiki-modal__hint">Renaming a category re-files every article under it. Deleting one moves its articles to General.</p>

        <ul class="wiki-categories__list">
          ${rows || `<li class="wiki-categories__empty">No categories yet.</li>`}
        </ul>

        <form class="wiki-categories__add" data-wiki-category-create>
          <input type="text" name="name" maxlength="80" required placeholder="New category name" autocomplete="off" aria-label="New category name" />
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>

        <p class="wiki-categories__status" data-wiki-category-status role="status" aria-live="polite"></p>

        <div class="wiki-modal__actions">
          <button type="button" class="wiki-modal__cancel" data-wiki-categories-close><span>Done</span></button>
        </div>
      </div>
    </dialog>
  `;
}

export function renderWikiListPanel(options: WikiListPanelOptions): string {
  const emptyMessage = options.search
    ? `<p class="wiki-list__empty">No ${options.showArchived ? "archived " : ""}articles match "${escapeHtml(options.search)}".</p>`
    : options.showArchived
      ? `<p class="wiki-list__empty">Nothing is archived. Archiving an article takes it off the wiki and out of AI chat without deleting it.</p>`
      : `<p class="wiki-list__empty">No articles yet. Use Add to write the first thing worth knowing.</p>`;

  // The archive is only worth a way in once something is on it; on the archive
  // itself the same button is the way back.
  const archiveToggle = options.showArchived
    ? `<a class="wiki-list__add" href="/wiki"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to the wiki</span></a>`
    : options.archivedCount > 0
      ? `<a class="wiki-list__add" href="/wiki?archived=1"><i class="bi bi-archive ui-icon" aria-hidden="true"></i><span>Archived (${options.archivedCount})</span></a>`
      : "";

  return `
    <div class="wiki-list" data-wiki-list>
      <p class="wiki-list__ai-status" data-wiki-ai-status role="status" aria-live="polite" hidden>Starting local AI… tag generation will be available shortly.</p>

      ${options.showArchived ? `<p class="wiki-list__archive-note">Archived articles are hidden from the wiki and are never sent to AI chat. Restore one to put it back.</p>` : ""}

      <div class="wiki-list__header">
        <form class="wiki-list__search" data-wiki-search method="get" action="/wiki">
          <i class="bi bi-search ui-icon" aria-hidden="true"></i>
          ${options.showArchived ? `<input type="hidden" name="archived" value="1" />` : ""}
          <input type="search" name="q" value="${escapeHtml(options.search)}" placeholder="${options.showArchived ? "Search the archive" : "Search the wiki"}" aria-label="${options.showArchived ? "Search the archive" : "Search the wiki"}" />
        </form>
        ${archiveToggle}
        ${options.showArchived ? "" : `<button type="button" class="wiki-list__add" data-wiki-categories><i class="bi bi-tags ui-icon" aria-hidden="true"></i><span>Categories</span></button>
        <button type="button" class="wiki-list__add" data-wiki-add><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>`}
      </div>

      <div class="wiki-list__rows">
        ${options.articles.length ? renderGroups(options.articles, options.categories) : emptyMessage}
      </div>

      <!-- Adding an article is an occasional action, so it opens in a modal
           rather than taking up room above the wiki itself. -->
      <dialog class="wiki-modal" data-wiki-create-dialog aria-label="Add to the wiki">
        <form class="wiki-modal__form" data-wiki-create>
          <h2 class="wiki-modal__title">Add to the wiki</h2>
          <label class="wiki-modal__field">
            <span>Title</span>
            <input type="text" name="title" maxlength="200" required placeholder="What is this about?" autocomplete="off" />
          </label>
          <p class="wiki-modal__hint">The local AI files it under a category and adds tags once you write the content.</p>
          <div class="wiki-modal__actions">
            <button type="button" class="wiki-modal__cancel" data-wiki-create-cancel><span>Cancel</span></button>
            <button type="submit" class="wiki-modal__submit" data-wiki-create-submit><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Create</span></button>
          </div>
        </form>
      </dialog>

      ${renderCategoriesDialog(options.categories)}
    </div>
  `;
}
