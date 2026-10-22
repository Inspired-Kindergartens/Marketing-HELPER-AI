import type { SectorCentreView, SectorCrawlRunView } from "../../storage/sector-store.js";
import { normaliseName } from "../../sector/names.js";
import { PROMOTION_CATEGORY_LABELS, type PromotionCategory } from "../../sector/promotions.js";
import { isClosedCentre, SERVICE_TYPE_LABELS } from "../../sector/query.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatSectorDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function serviceTypeLabel(type: string): string {
  const label = SERVICE_TYPE_LABELS[type];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : type || "Unknown";
}

export function promotionCategoryLabel(category: string): string {
  return PROMOTION_CATEGORY_LABELS[category as PromotionCategory] ?? PROMOTION_CATEGORY_LABELS.other;
}

function yesNoUnknown(value: boolean | null): string {
  return value === true ? "yes" : value === false ? "no" : "";
}

function renderFeature(provided: boolean | null, detail: string): string {
  if (provided === true) return `<strong>Yes</strong>${detail && !/^yes$/i.test(detail) ? `<span>${escapeHtml(detail)}</span>` : ""}`;
  if (provided === false) return `<strong>No</strong>${detail && !/^no$/i.test(detail) ? `<span>${escapeHtml(detail)}</span>` : ""}`;
  return detail ? `<span>${escapeHtml(detail)}</span>` : `<span>Not known</span>`;
}

// The small grey line under a centre's name: who runs it and anything to note.
function centreSubtitle(centre: SectorCentreView): string {
  const parts = [centre.operator || "Operator not verified"];
  if (centre.isOwn) parts.push("Inspired centre");
  if (isClosedCentre(centre)) parts.push("No longer in the MoE directory");
  else if (centre.eceId == null) parts.push("Not found in the MoE directory");
  return parts.join(" · ");
}

function renderCentreRow(centre: SectorCentreView): string {
  const search = normaliseName([centre.name, centre.operator, centre.suburb, centre.city, centre.district, ...centre.promotions.map((p) => p.text)].join(" "));
  // The Promotion filter starts on "Running one".
  const hidden = centre.promotions.length === 0;
  const places =
    centre.licensedPlaces != null
      ? `${centre.licensedPlaces}${centre.under2Places ? `<span>${centre.under2Places} under 2</span>` : ""}`
      : "";
  const promotions = centre.promotions.length
    ? centre.promotions.map((promotion) => `<strong>${escapeHtml(promotion.text)}</strong>`).join("")
    : `<span>None found</span>`;

  return `
    <tr data-sector-row
      data-search="${escapeHtml(search)}"
      data-city="${escapeHtml(centre.city)}"
      data-type="${escapeHtml(centre.serviceType)}"
      data-operator="${escapeHtml(centre.operator)}"
      data-meals="${yesNoUnknown(centre.providesMeals)}"
      data-transport="${yesNoUnknown(centre.providesTransport)}"
      data-promo="${centre.promotions.length > 0 ? "1" : "0"}"${hidden ? " hidden" : ""}>
      <td><strong><a href="/sector?centre=${centre.id}">${escapeHtml(centre.name)}</a></strong><span>${escapeHtml(centreSubtitle(centre))}</span></td>
      <td>${escapeHtml(serviceTypeLabel(centre.serviceType))}</td>
      <td><strong>${escapeHtml(centre.city)}</strong>${centre.suburb && centre.suburb !== centre.city ? `<span>${escapeHtml(centre.suburb)}</span>` : ""}</td>
      <td class="google-analytics-table__numeric data-table__numeric">${places}</td>
      <td>${renderFeature(centre.providesMeals, centre.meals)}</td>
      <td>${renderFeature(centre.providesTransport, centre.transport)}</td>
      <td>${promotions}</td>
    </tr>
  `;
}

function renderOptions(values: Array<[string, string]>, anyLabel: string, selected = ""): string {
  return [["", anyLabel] as [string, string], ...values]
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export type SectorCentresPanelOptions = {
  centres: SectorCentreView[];
};

export function renderSectorCentresPanel(options: SectorCentresPanelOptions): string {
  const centres = options.centres;
  if (centres.length === 0) {
    return `<p class="google-analytics-panel__empty">No centres yet. Use Update now to import the competitor spreadsheet and the Ministry of Education ECE directory. The first update reads every competitor website, so it takes a while.</p>`;
  }

  // The table lists competitors only. Inspired's own and closed centres stay
  // in the database for the chat and the export, but are not shown here.
  const competitors = centres.filter((centre) => !centre.isOwn && !isClosedCentre(centre));
  const withPromotion = competitors.filter((centre) => centre.promotions.length > 0).length;
  const summary: Array<[string, number]> = [
    ["Competitor services", competitors.length],
    ["Running a promotion", withPromotion],
    ["Provide meals", competitors.filter((centre) => centre.providesMeals === true).length],
    ["Provide transport", competitors.filter((centre) => centre.providesTransport === true).length],
  ];

  return `
    <div class="sector-toolbar flex flex-col gap-12">
    <div class="google-analytics-summary grid gap-8 sector-toolbar__summary">
      ${summary.map(([label, value]) => `<div class="google-analytics-summary__item card stat-tile"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join("")}
    </div>

    <div class="google-analytics-filter flex flex-wrap gap-8 sector-toolbar__filters" data-sector-filters>
      <label class="wiki-list__search flex items-center gap-8 text-muted">Search<input class="form-control" type="search" name="q" placeholder="Centre, operator, suburb or offer" autocomplete="off" /></label>
      <label>Town<select name="city">${renderOptions(distinct(competitors.map((centre) => centre.city)).map((city) => [city, city]), "All towns")}</select></label>
      <label>Type<select name="type">${renderOptions(distinct(competitors.map((centre) => centre.serviceType)).map((type) => [type, serviceTypeLabel(type)]), "All types")}</select></label>
      <label>Operator<select name="operator">${renderOptions(distinct(competitors.map((centre) => centre.operator)).map((operator) => [operator, operator]), "All operators")}</select></label>
      <label>Meals<select name="meals">${renderOptions([["yes", "Provided"], ["no", "Not provided"], ["unknown", "Not known"]], "Any")}</select></label>
      <label>Transport<select name="transport">${renderOptions([["yes", "Provided"], ["unknown", "Not known"]], "Any")}</select></label>
      <label>Promotion<select name="promo">${renderOptions([["1", "Running one"], ["0", "None found"]], "Any", "1")}</select></label>
    </div>
    </div>
    <div class="google-analytics-panel__meta flex flex-wrap gap-10"><span data-sector-count>${withPromotion} of ${competitors.length} centres shown</span></div>

    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table" data-sector-table>
        <thead>
          <tr><th>Centre</th><th>Type</th><th>Town</th><th class="google-analytics-table__numeric data-table__numeric">Places</th><th>Meals</th><th>Transport</th><th>Promotions</th></tr>
        </thead>
        <tbody>
          ${competitors.map(renderCentreRow).join("")}
          <tr data-sector-empty hidden><td colspan="7" class="google-analytics-table__empty text-ghost">No centres match these filters.</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

// Every active offer in the market, once, with how many competitor centres
// carry it: the "what are they doing" view.
export function renderSectorPromotionsPanel(centres: SectorCentreView[]): string {
  const offers = new Map<string, { text: string; category: string; firstSeenAt: string; sourceUrl: string; centres: SectorCentreView[] }>();
  for (const centre of centres) {
    if (centre.isOwn || isClosedCentre(centre)) continue;
    for (const promotion of centre.promotions) {
      const key = promotion.text.toLowerCase();
      const offer = offers.get(key) ?? { text: promotion.text, category: promotion.category, firstSeenAt: promotion.firstSeenAt, sourceUrl: promotion.sourceUrl, centres: [] };
      offer.centres.push(centre);
      if (promotion.firstSeenAt < offer.firstSeenAt) offer.firstSeenAt = promotion.firstSeenAt;
      offers.set(key, offer);
    }
  }
  const rows = [...offers.values()].sort((a, b) => b.centres.length - a.centres.length || a.text.localeCompare(b.text));
  if (rows.length === 0) return `<p class="google-analytics-panel__empty">No active promotions found yet.</p>`;

  return `
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table">
        <thead>
          <tr><th>Promotion</th><th class="google-analytics-table__numeric data-table__numeric">Centres</th><th>Who</th><th>First seen</th><th>Source</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((offer) => {
              const operators = distinct(offer.centres.map((centre) => centre.operator || centre.name));
              const names = offer.centres.map((centre) => `<a href="/sector?centre=${centre.id}">${escapeHtml(centre.name)}</a>`).join(", ");
              return `
                <tr>
                  <td><strong>${escapeHtml(offer.text)}</strong><span>${escapeHtml(promotionCategoryLabel(offer.category))}</span></td>
                  <td class="google-analytics-table__numeric data-table__numeric">${offer.centres.length}</td>
                  <td><strong>${escapeHtml(operators.join(", "))}</strong><span>${names}</span></td>
                  <td>${escapeHtml(formatSectorDate(offer.firstSeenAt))}</td>
                  <td>${offer.sourceUrl ? `<a href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostOf(offer.sourceUrl))}</a>` : ""}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderSectorRunsPanel(runs: SectorCrawlRunView[]): string {
  if (runs.length === 0) return `<p class="google-analytics-panel__empty">No updates yet. They run monthly, or use Update now.</p>`;
  return `
    <div class="google-analytics-table-wrap table-frame table-frame--scroll">
      <table class="google-analytics-table data-table">
        <thead>
          <tr><th>Started</th><th>Status</th><th>Centres</th><th>Websites</th><th>Promotions</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${runs
            .map(
              (run) => `
                <tr>
                  <td><strong>${escapeHtml(formatSectorDate(run.startedAt))}</strong><span>${run.trigger === "manual" ? "Update now" : "Monthly"}</span></td>
                  <td>${escapeHtml(run.status === "completed" ? "Finished" : run.status === "running" ? "Running" : "Failed")}</td>
                  <td><strong>${run.centresAdded} added</strong><span>${run.centresUpdated} updated · ${run.centresClosed} closed</span></td>
                  <td><strong>${run.sitesChecked} read</strong><span>${run.sitesFailed} could not be read</span></td>
                  <td><strong>${run.promotionsAdded} new</strong><span>${run.promotionsEnded} ended</span></td>
                  <td><span>${escapeHtml(run.message)}</span></td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
