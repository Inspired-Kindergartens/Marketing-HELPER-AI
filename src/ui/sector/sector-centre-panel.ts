import type { SectorCentreView, SectorPromotionView } from "../../storage/sector-store.js";
import { isClosedCentre } from "../../sector/query.js";
import { formatSectorDate, hostOf, promotionCategoryLabel, serviceTypeLabel } from "./sector-list-panel.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function triStateOptions(value: boolean | null): string {
  const current = value === true ? "yes" : value === false ? "no" : "";
  return [
    ["", "Not known"],
    ["yes", "Yes"],
    ["no", "No"],
  ]
    .map(([option, label]) => `<option value="${option}"${option === current ? " selected" : ""}>${label}</option>`)
    .join("");
}

const ORIGIN_LABELS: Record<string, string> = { csv: "Spreadsheet", crawl: "Website", manual: "Added by hand" };

function renderSource(url: string): string {
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostOf(url) || url)}</a>` : "";
}

// The promotions table, also returned on its own after an add / end / delete
// so the page swaps it in place.
export function renderSectorCentrePromotions(centre: Pick<SectorCentreView, "id" | "promotions" | "pastPromotions">): string {
  const row = (promotion: SectorPromotionView) => `
    <tr>
      <td><strong>${escapeHtml(promotion.text)}</strong><span>${escapeHtml(promotionCategoryLabel(promotion.category))}</span></td>
      <td><strong>${escapeHtml(ORIGIN_LABELS[promotion.origin] ?? promotion.origin)}</strong><span>${renderSource(promotion.sourceUrl)}</span></td>
      <td><strong>${escapeHtml(formatSectorDate(promotion.firstSeenAt))}</strong><span>${
        promotion.active ? `last seen ${escapeHtml(formatSectorDate(promotion.lastSeenAt))}` : `ended ${escapeHtml(formatSectorDate(promotion.endedAt))}`
      }</span></td>
      <td>
        <div class="wiki-list__actions flex gap-6">
          ${promotion.active ? `<button type="button" class="wiki-list__button button-icon" data-sector-promotion-end="${promotion.id}" title="Mark as ended"><i class="bi bi-stop-circle ui-icon" aria-hidden="true"></i></button>` : ""}
          <button type="button" class="wiki-list__button button-icon wiki-list__button--danger button-danger" data-sector-promotion-delete="${promotion.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
        </div>
      </td>
    </tr>
  `;

  return `
    <div class="google-analytics-table-wrap table-frame table-frame--scroll" data-sector-promotions>
      <table class="google-analytics-table data-table">
        <thead><tr><th>Promotion</th><th>From</th><th>Seen</th><th></th></tr></thead>
        <tbody>
          ${centre.promotions.map(row).join("") || `<tr><td colspan="4" class="google-analytics-table__empty text-ghost">No active promotion found.</td></tr>`}
          ${centre.pastPromotions.map(row).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderSectorCentrePanel(centre: SectorCentreView | null): string {
  if (!centre) {
    return `<div class="wiki-editor wiki-editor--empty"><p>That centre no longer exists. Go back to the list.</p></div>`;
  }

  const facts: Array<[string, string]> = [
    ["Type", serviceTypeLabel(centre.serviceType)],
    ["Ownership", centre.authority],
    ["Address", [centre.address, centre.suburb, centre.city].filter(Boolean).join(", ")],
    ["District", centre.district],
    ["Licensed places", centre.licensedPlaces != null ? `${centre.licensedPlaces}${centre.under2Places ? ` (${centre.under2Places} under 2)` : ""}` : ""],
    ["Roll", centre.roll != null ? `${centre.roll}${centre.rollDate ? ` at ${formatSectorDate(centre.rollDate)}` : ""}` : ""],
    ["20 Hours ECE", centre.twentyHoursEce === true ? "Yes" : centre.twentyHoursEce === false ? "No" : ""],
    ["Phone", centre.phone],
    ["Email", centre.email],
    ["MoE licence", centre.eceId != null ? String(centre.eceId) : "Not found in the directory"],
    ["Website last read", formatSectorDate(centre.lastCrawledAt)],
  ];
  const status = centre.isOwn
    ? "An Inspired Kindergartens centre: kept for comparison, never counted as a competitor."
    : isClosedCentre(centre)
      ? "No longer in the Ministry of Education ECE directory, so probably closed or relicensed."
      : "";

  return `
    <div class="wiki-editor" data-sector-centre data-sector-centre-id="${centre.id}">
      ${status ? `<p class="wiki-modal__hint text-ghost text-small">${escapeHtml(status)}</p>` : ""}
      <div class="google-analytics-summary grid gap-8">
        ${facts
          .filter(([, value]) => value)
          .map(([label, value]) => `<div class="google-analytics-summary__item card stat-tile"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`)
          .join("")}
      </div>

      <form class="wiki-editor__fields flex flex-col gap-10" data-sector-centre-edit>
        <div class="wiki-editor__field-row grid gap-10">
          <label class="wiki-editor__field field-label">
            <span>Operator / service group <small>blank when not verified</small></span>
            <input class="form-control" type="text" name="operator" maxlength="200" value="${escapeHtml(centre.operator)}" />
          </label>
          <label class="wiki-editor__field field-label">
            <span>Website <small>read by the monthly update</small></span>
            <input class="form-control" type="text" name="website" maxlength="2000" value="${escapeHtml(centre.website)}" placeholder="https://" inputmode="url" />
          </label>
          <label class="wiki-editor__field field-label">
            <span>Promotions page <small>read too, if different</small></span>
            <input class="form-control" type="text" name="promotionUrl" maxlength="2000" value="${escapeHtml(centre.promotionUrl)}" placeholder="https://" inputmode="url" />
          </label>
        </div>
        <div class="wiki-editor__field-row grid gap-10">
          <label class="wiki-editor__field field-label">
            <span>Provides meals</span>
            <select class="form-control" name="providesMeals">${triStateOptions(centre.providesMeals)}</select>
          </label>
          <label class="wiki-editor__field field-label">
            <span>Meals detail</span>
            <input class="form-control" type="text" name="meals" maxlength="300" value="${escapeHtml(centre.meals)}" placeholder="e.g. Morning tea, lunch and afternoon tea" />
          </label>
          <label class="wiki-editor__field field-label">
            <span>Provides transport</span>
            <select class="form-control" name="providesTransport">${triStateOptions(centre.providesTransport)}</select>
          </label>
          <label class="wiki-editor__field field-label">
            <span>Transport detail</span>
            <input class="form-control" type="text" name="transport" maxlength="300" value="${escapeHtml(centre.transport)}" placeholder="e.g. Van pick-up in Western Heights" />
          </label>
        </div>
        <label class="wiki-editor__field field-label">
          <span>Notes <small>anything the team knows; the AI chat can see these</small></span>
          <input class="form-control" type="text" name="notes" maxlength="4000" value="${escapeHtml(centre.notes)}" />
        </label>
      </form>
      <div class="wiki-editor__footer flex items-center justify-end gap-12">
        <button type="button" class="wiki-editor__save button-md" data-sector-centre-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
        ${centre.website ? `<a class="wiki-editor__save button-md panel-action-link" href="${escapeHtml(centre.website)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i><span>Open website</span></a>` : ""}
        <span class="wiki-editor__status text-ghost text-small" data-sector-centre-status role="status" aria-live="polite"></span>
      </div>

      <div class="google-analytics-section__header section-header"><h3 class="section-title">Promotions &amp; incentives</h3></div>
      ${renderSectorCentrePromotions(centre)}
      <form class="wiki-editor__fields flex flex-col gap-10" data-sector-promotion-add>
        <div class="wiki-editor__field-row grid gap-10">
          <label class="wiki-editor__field field-label">
            <span>Add a promotion <small>one you've heard about; the monthly update never ends these</small></span>
            <input class="form-control" type="text" name="text" maxlength="300" required placeholder="e.g. 50% off fees for the first 4 months" autocomplete="off" />
          </label>
          <label class="wiki-editor__field field-label">
            <span>Where you saw it <small>optional link</small></span>
            <input class="form-control" type="text" name="sourceUrl" maxlength="2000" placeholder="https://" inputmode="url" autocomplete="off" />
          </label>
        </div>
        <div class="wiki-editor__footer flex items-center justify-end gap-12">
          <button type="submit" class="wiki-editor__save button-md"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add promotion</span></button>
        </div>
      </form>
    </div>
  `;
}
