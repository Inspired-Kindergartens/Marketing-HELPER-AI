import type { SubscriptionCategoryView, SubscriptionView } from "../../storage/subscription-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type SubscriptionListPanelOptions = {
  subscriptions: SubscriptionView[];
  categories: SubscriptionCategoryView[];
};

// Options for a category <select class="form-control">, the same control Code Snippets uses. A subscription
// whose category was renamed or removed elsewhere still shows its own value,
// so the select never silently re-files it.
export function renderSubscriptionCategoryOptions(categories: string[], selected: string): string {
  const available = selected && !categories.includes(selected) ? [selected, ...categories] : categories;
  return available
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}"${category === selected ? " selected" : ""}>${escapeHtml(category)}</option>`,
    )
    .join("");
}

// The host is shown beside the title so two similarly named links can be told
// apart at a glance.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function renderSubscriptionRow(subscription: SubscriptionView): string {
  // Clicking a subscription opens its link in a new tab, the common case; editing is
  // the pencil button. A subscription with no link yet opens the editor instead.
  const description = subscription.description
    ? `<span class="snippets-list__description min-w-0 text-ghost text-small nowrap">${escapeHtml(subscription.description)}</span>`
    : "";
  const host = hostOf(subscription.url);
  const main = subscription.url
    ? `<a class="wiki-list__main flex items-center text-body min-w-0" href="${escapeHtml(subscription.url)}" target="_blank" rel="noopener noreferrer" data-subscription-row title="Open ${escapeHtml(subscription.url)}">`
    : `<a class="wiki-list__main flex items-center text-body min-w-0" href="/subscriptions?subscription=${subscription.id}" data-subscription-row title="No link yet. Click to add one">`;

  return `
    <article class="wiki-list__row list-row" data-subscription-id="${subscription.id}" data-subscription-url="${escapeHtml(subscription.url)}">
      ${main}
        <span class="wiki-list__title flex items-center gap-6 text-strong min-w-0">
          ${escapeHtml(subscription.title)}
          ${host ? `<span class="snippets-list__language text-muted badge">${escapeHtml(host)}</span>` : ""}
        </span>
        ${description}
      </a>
      <div class="wiki-list__actions flex gap-6">
        <button type="button" class="wiki-list__button button-icon" data-subscription-copy title="Copy link"${subscription.url ? "" : " disabled"}><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon" data-subscription-action="edit" data-subscription-id="${subscription.id}" title="Edit"><i class="bi bi-pencil ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon" data-subscription-action="duplicate" data-subscription-id="${subscription.id}" title="Duplicate"><i class="bi bi-copy ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="wiki-list__button button-icon wiki-list__button--danger button-danger" data-subscription-action="delete" data-subscription-id="${subscription.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

// The category of the most recently used link (a never-used link counts from
// its last change), or null when there are no links.
export function latestUsedSubscriptionCategory(subscriptions: SubscriptionView[]): string | null {
  let latest: { category: string; at: string } | null = null;
  for (const subscription of subscriptions) {
    const at = subscription.lastUsedAt ?? subscription.updatedAt;
    if (!latest || at > latest.at) latest = { category: subscription.category, at };
  }
  return latest?.category ?? null;
}

// Subscriptions sit under their category heading, in the category list's order. A
// category nobody uses is skipped, and one a subscription claims that is not in the
// list still renders, after the known ones. Each category is a collapsible
// section; only the latest used one starts open, and the shared name makes them
// an exclusive accordion (opening one closes the others).
function renderGroups(subscriptions: SubscriptionView[], categories: SubscriptionCategoryView[]): string {
  const openCategory = latestUsedSubscriptionCategory(subscriptions);
  const groups = new Map<string, SubscriptionView[]>();
  for (const subscription of subscriptions) {
    const existing = groups.get(subscription.category);
    if (existing) existing.push(subscription);
    else groups.set(subscription.category, [subscription]);
  }

  const ordered: Array<[string, SubscriptionView[]]> = [];
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
        <details class="wiki-list__group flex flex-col wiki-list__group--collapsible" name="subscription-groups" data-subscription-group${name === openCategory ? " open" : ""}>
          <summary class="wiki-list__group-heading text-strong font-strong">${escapeHtml(name)}</summary>
          <div class="wiki-list__group-articles flex flex-col gap-4">${rows.map(renderSubscriptionRow).join("")}</div>
        </details>
      `,
    )
    .join("");
}

// The one "Add a subscription" modal, used by the list's Add button.
export function renderSubscriptionCreateDialog(categories: string[]): string {
  return `
    <dialog class="wiki-modal text-body" data-subscription-create-dialog aria-label="Add a link">
      <form class="wiki-modal__form flex flex-col gap-12" data-subscription-create>
        <h2 class="wiki-modal__title text-strong">Add a link</h2>
        <label class="wiki-modal__field field-label">
          <span>Title</span>
          <input class="form-control" type="text" name="title" maxlength="200" required placeholder="e.g. Canva Pro" autocomplete="off" />
        </label>
        <label class="wiki-modal__field field-label">
          <span>Link</span>
          <input class="form-control" type="text" name="url" maxlength="2000" required placeholder="https://" autocomplete="off" inputmode="url" />
        </label>
        <label class="wiki-modal__field field-label">
          <span>Category</span>
          <select class="form-control" name="category">${renderSubscriptionCategoryOptions(categories, "General")}</select>
        </label>
        <p class="wiki-modal__hint text-ghost text-small">New categories are added from Categories on the list.</p>
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-subscription-create-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Create</span></button>
        </div>
      </form>
    </dialog>
  `;
}

// Categories are managed here rather than in the editor, because they are
// global: renaming one re-files every subscription under it. Same modal as snippets.
function renderCategoriesDialog(categories: SubscriptionCategoryView[]): string {
  const rows = categories
    .map(
      (category) => `
        <li class="wiki-categories__row flex items-center gap-8" data-subscription-category-id="${category.id}">
          <input
            type="text"
            class="wiki-categories__name min-w-0 form-control"
            value="${escapeHtml(category.name)}"
            maxlength="80"
            aria-label="Category name"
            data-subscription-category-name
          />
          <span class="wiki-categories__count text-ghost text-small nowrap">${category.subscriptionCount} link${category.subscriptionCount === 1 ? "" : "s"}</span>
          ${
            category.isProtected
              ? `<span class="wiki-categories__locked text-ghost button-icon" title="The default category cannot be deleted"><i class="bi bi-lock ui-icon" aria-hidden="true"></i></span>`
              : `<button type="button" class="wiki-categories__delete button-danger button-icon" data-subscription-category-delete title="Delete category"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>`
          }
        </li>
      `,
    )
    .join("");

  return `
    <dialog class="wiki-modal text-body wiki-modal--wide" data-subscription-categories-dialog aria-label="Manage categories">
      <div class="wiki-modal__form flex flex-col gap-12">
        <h2 class="wiki-modal__title text-strong">Categories</h2>
        <p class="wiki-modal__hint text-ghost text-small">Renaming a category re-files every link under it. Deleting one moves its links to General.</p>

        <ul class="wiki-categories__list flex flex-col gap-6">
          ${rows || `<li class="wiki-categories__empty text-empty text-small">No categories yet.</li>`}
        </ul>

        <form class="wiki-categories__add flex gap-8" data-subscription-category-create>
          <input class="form-control" type="text" name="name" maxlength="80" required placeholder="New category name" autocomplete="off" aria-label="New category name" />
          <button class="button-md" type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
        </form>

        <p class="wiki-categories__status text-ghost text-small" data-subscription-category-status role="status" aria-live="polite"></p>

        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-subscription-categories-close><span>Done</span></button>
        </div>
      </div>
    </dialog>
  `;
}

export function renderSubscriptionListPanel(options: SubscriptionListPanelOptions): string {
  const emptyMessage = `<p class="wiki-list__empty">No links yet. Use Add to save the first one.</p>`;

  return `
    <div class="wiki-list" data-subscription-list>
      <div class="wiki-list__header flex items-center gap-10">
        <button type="button" class="wiki-list__add nowrap button-md" data-subscription-categories><i class="bi bi-tags ui-icon" aria-hidden="true"></i><span>Categories</span></button>
        <button type="button" class="wiki-list__add nowrap button-md" data-subscription-add><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add</span></button>
      </div>

      <div class="wiki-list__rows flex flex-col wiki-list__rows--accordion">
        ${options.subscriptions.length ? renderGroups(options.subscriptions, options.categories) : emptyMessage}
      </div>

      ${renderCategoriesDialog(options.categories)}
    </div>
  `;
}
