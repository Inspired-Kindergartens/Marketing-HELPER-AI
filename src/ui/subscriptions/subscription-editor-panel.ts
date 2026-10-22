import type { SubscriptionView } from "../../storage/subscription-store.js";
import { renderSubscriptionCategoryOptions } from "./subscription-list-panel.js";

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

export type SubscriptionEditorPanelOptions = {
  subscription: SubscriptionView | null;
  categories: string[];
};

export function renderSubscriptionEditorPanel(options: SubscriptionEditorPanelOptions): string {
  const subscription = options.subscription;

  if (!subscription) {
    return `<div class="wiki-editor wiki-editor--empty"><p>Select a link from the list to edit it.</p></div>`;
  }

  return `
    <div class="wiki-editor" data-subscription-editor data-subscription-id="${subscription.id}" data-subscription-url="${escapeHtml(subscription.url)}">
      <form class="wiki-editor__fields flex flex-col gap-10" data-subscription-edit>
        <label class="wiki-editor__field field-label wiki-editor__field--title">
          <span>Title</span>
          <input class="form-control" type="text" name="title" maxlength="200" value="${escapeHtml(subscription.title)}" required />
        </label>
        <div class="wiki-editor__field-row grid gap-10">
          <label class="wiki-editor__field field-label">
            <span>Category</span>
            <select class="form-control" name="category">${renderSubscriptionCategoryOptions(options.categories, subscription.category)}</select>
          </label>
          <label class="wiki-editor__field field-label">
            <span>Link</span>
            <input class="form-control" type="text" name="url" maxlength="2000" value="${escapeHtml(subscription.url)}" placeholder="https://" autocomplete="off" inputmode="url" />
          </label>
        </div>
        <label class="wiki-editor__field field-label">
          <span>Description <small>what it is for, plan, renewal</small></span>
          <input class="form-control" type="text" name="description" maxlength="400" value="${escapeHtml(subscription.description)}" />
        </label>
      </form>

      <div class="wiki-editor__footer flex items-center justify-end gap-12">
        <button type="button" class="wiki-editor__save button-md" data-subscription-open${subscription.url ? "" : " disabled"}><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i><span>Open link</span></button>
        <button type="button" class="wiki-editor__save button-md" data-subscription-copy${subscription.url ? "" : " disabled"}><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy link</span></button>
        <button type="button" class="wiki-editor__save button-md" data-subscription-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
        <span class="wiki-editor__status text-ghost text-small" data-subscription-status role="status" aria-live="polite">Last saved ${escapeHtml(formatTimestamp(subscription.updatedAt))}</span>
      </div>
    </div>
  `;
}
