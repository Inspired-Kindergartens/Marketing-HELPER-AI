// Enrolment Quality panel: each centre's % full roll, month by month.
// The body is one swappable fragment ([data-enrolment-quality]): the window,
// sort, capacity editor and fetch progress all replace it in place from
// /fragments/enrolment-quality instead of reloading the dashboard.
import {
  FIRST_FIGURE_MONTH,
  formatMonthLabel,
  isFirstFigure,
  ORGANISATION_ROW_KEY,
  ROLL_WINDOW_OPTIONS,
  STEADY_POINTS,
  type EnrolmentQualityRow,
  type RollPoint,
  type RollSort,
  type RollWindowKey,
  type TrendDirection,
  rollBand,
} from "../analytics/enrolment-quality.js";
import type { RollHistoryProgress } from "../infocare/roll-history.js";
import { formatAnalyticsServiceDisplayName } from "./centre-name.js";
import { REFRESH_ICON, renderPrintAction, renderRefreshAction, SPINNER_CLASS } from "./action-buttons.js";

export type EnrolmentQualityView = {
  rows: EnrolmentQualityRow[];
  // All kindergartens together, always shown first whatever the sort.
  organisation?: EnrolmentQualityRow | null;
  windowKey: RollWindowKey;
  sort: RollSort;
  currentMonth: string;
  progress: RollHistoryProgress;
  openCentreKey?: number | null;
  // The SLT filter: the chosen SLT (rows are already only their centres) and
  // every SLT in the contact list.
  slt?: string | null;
  sltOptions?: readonly string[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pct(value: number | null) {
  return value == null ? "-" : `${Math.round(value)}%`;
}

function formatChange(value: number | null) {
  if (value == null) return "-";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatAmPm(point: Pick<RollPoint, "avgAm" | "avgPm" | "openDays"> | null) {
  return point && point.openDays > 0 ? `${Math.round(point.avgAm)} / ${Math.round(point.avgPm)}` : "-";
}

// The user's am / pm places, e.g. "30 / 20"; "-" when none are set.
function formatPlaces(am: number | null | undefined, pm: number | null | undefined) {
  return am != null && pm != null ? `${Math.round(am)} / ${Math.round(pm)}` : "-";
}

function formatCapacity(capacity: number | null) {
  return capacity == null ? "-" : String(Math.round(capacity));
}

// The capacity % full roll divides by, then the licence in {curly brackets}.
function formatCapacityWithLicence(capacity: number | null, licence: number | null) {
  if (capacity == null) return "-";
  return `${formatCapacity(capacity)} {${formatCapacity(licence)}}`;
}

function capacityTitle(capacity: EnrolmentQualityRow["currentCapacity"], licence: number | null) {
  if (!capacity) return "";
  const base = capacity.source === "operating"
    ? `Busier of am ${capacity.am ?? "-"} / pm ${capacity.pm ?? "-"} places; licence ${licence ?? "-"} in {}`
    : `Licence (no am / pm places set) ${licence ?? "-"}`;
  return capacity.under2 != null ? `${base}, of which ${capacity.under2} under-2` : base;
}

// A % coloured by its band: 90%+ green, 80-89% grey, under 80% red.
function bandedPct(value: number | null) {
  const band = rollBand(value);
  return band ? `<span class="enrolment-quality__band--${band}">${pct(value)}</span>` : pct(value);
}

export function fragmentQuery(windowKey: RollWindowKey, sort: RollSort, slt?: string | null) {
  return `rollWindow=${encodeURIComponent(windowKey)}&rollSort=${encodeURIComponent(sort)}${slt ? `&rollSlt=${encodeURIComponent(slt)}` : ""}`;
}

// --- Trend line ---------------------------------------------------------------
// Each line is scaled to its own months (at least SPARK_MIN_SPAN points tall,
// so a 1-2 point wobble stays flat while a real rise or fall shows). It is
// coloured, with an arrow, by its direction over the period. A dashed line
// marks 100% when it is in range. Months with no data break the line instead
// of being invented.
const SPARK_WIDTH = 160;
const SPARK_HEIGHT = 32;
const SPARK_MIN_SPAN = 20;

function sparkScale(points: readonly RollPoint[]) {
  const values = points.map((point) => point.percent).filter((value): value is number => value != null);
  let low = values.length ? Math.min(...values) : 0;
  let high = values.length ? Math.max(...values) : 100;
  if (high - low < SPARK_MIN_SPAN) {
    const pad = (SPARK_MIN_SPAN - (high - low)) / 2;
    low -= pad;
    high += pad;
  }
  return (percent: number) => SPARK_HEIGHT - 3 - ((percent - low) / (high - low)) * (SPARK_HEIGHT - 6);
}

const TREND_ICON: Record<TrendDirection, { icon: string; label: string }> = {
  rise: { icon: "bi-arrow-up-right", label: "Rising" },
  fall: { icon: "bi-arrow-down-right", label: "Falling" },
  steady: { icon: "bi-arrow-right", label: "Steady" },
};

function renderTrend(row: EnrolmentQualityRow, label: string) {
  const direction = row.direction;
  const arrow = direction
    ? `<i class="bi ${TREND_ICON[direction].icon} enrolment-quality__trend-arrow" aria-hidden="true"></i>`
    : "";
  const spoken = direction ? `${label}: ${TREND_ICON[direction].label.toLowerCase()}` : label;
  return `<span class="enrolment-quality__trend${direction ? ` enrolment-quality__trend--${direction}` : ""}" title="${direction ? TREND_ICON[direction].label : "Not enough months"}">${arrow}${renderSparkline(row.points, spoken)}</span>`;
}

export function renderSparkline(points: readonly RollPoint[], label: string) {
  const sparkY = sparkScale(points);
  const step = points.length > 1 ? SPARK_WIDTH / (points.length - 1) : 0;
  const segments: string[][] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.percent == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push(`${(index * step).toFixed(1)},${sparkY(point.percent).toFixed(1)}`);
  });
  if (current.length) segments.push(current);
  const lines = segments
    .map((segment) =>
      segment.length === 1
        ? `<circle class="enrolment-quality__spark-dot" cx="${segment[0]!.split(",")[0]}" cy="${segment[0]!.split(",")[1]}" r="1.8" />`
        : `<polyline class="enrolment-quality__spark-line" points="${segment.join(" ")}" />`,
    )
    .join("");
  const last = [...points].reverse().find((point) => point.percent != null);
  const lastIndex = last ? points.lastIndexOf(last) : -1;
  const endDot = last ? `<circle class="enrolment-quality__spark-dot" cx="${(lastIndex * step).toFixed(1)}" cy="${sparkY(last.percent!).toFixed(1)}" r="2.2" />` : "";
  const fullY = sparkY(100);
  const fullLine = fullY >= 0 && fullY <= SPARK_HEIGHT
    ? `<line class="enrolment-quality__spark-full" x1="0" x2="${SPARK_WIDTH}" y1="${fullY.toFixed(1)}" y2="${fullY.toFixed(1)}" />`
    : "";

  return `<svg class="enrolment-quality__spark" viewBox="-3 0 ${SPARK_WIDTH + 6} ${SPARK_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}">${fullLine}${lines}${endDot}</svg>`;
}

// --- Toolbar -------------------------------------------------------------------

function renderToolbar(view: EnrolmentQualityView) {
  const slt = view.slt ?? null;
  // Every link carries the whole view (period, order and SLT).
  const link = (query: string, active: boolean, label: string, extra = "") =>
    `<a class="analytics-toolbar__window${active ? " analytics-toolbar__window--active" : ""}" href="/app?${query}" data-roll-query="${query}"${extra}>${label}</a>`;
  const windowLinks = ROLL_WINDOW_OPTIONS.map((option) => {
    const active = option.key === view.windowKey;
    return link(fragmentQuery(option.key, view.sort, slt), active, option.label, active ? ' aria-current="true"' : "");
  }).join("");
  const sortLink = (sort: RollSort, label: string, aria: string) =>
    link(fragmentQuery(view.windowKey, sort, slt), view.sort === sort, label, ` aria-label="${aria}" title="${aria}"`);
  const sltLink = (name: string | null, label: string) =>
    link(fragmentQuery(view.windowKey, view.sort, name), name === slt, escapeHtml(label), name === slt ? ' aria-current="true"' : "");
  const sltFilter = view.sltOptions?.length
    ? `
    <div class="analytics-toolbar__actions flex flex-wrap gap-4 items-center" data-slt-filter>
      ${sltLink(null, "All SLT")}
      ${view.sltOptions.map((name) => sltLink(name, name)).join("")}
    </div>`
    : "";
  return `
    <div class="analytics-toolbar">
    <div class="analytics-toolbar__actions flex flex-wrap gap-4 items-center">
      ${windowLinks}
      ${sortLink("interest", "Worst change", "Sort by Change, the biggest fall first")}
      ${sortLink("latest", "Worst latest", "Sort by Latest, the lowest % first")}
      ${sortLink("asc", "A-Z", "Sort service A to Z")}
      ${sortLink("desc", "Z-A", "Sort service Z to A")}
    </div>${sltFilter}
    </div>
  `;
}

// Panel header actions, the same icon buttons as the other panels: the PDF
// (print icon) and Update from Infocare. They sit outside the swappable
// fragment, so the script keeps their PDF period/order and fetch state in step.
export function renderEnrolmentQualityHeaderActions(view: EnrolmentQualityView) {
  const running = view.progress.running;
  const fetchLabel = running
    ? `Fetching from Infocare ${view.progress.done}/${view.progress.total}`
    : "Update from Infocare: fetch any missing months (up to 5 years) and this month's figures";
  // Same order as Infocare Analytics: download (update) first, then print.
  return renderRefreshAction({ label: fetchLabel, attributes: "data-roll-fetch", running })
    + renderPrintAction({ label: "Download this view as a PDF to print", href: `/api/enrolment-quality/pdf?${fragmentQuery(view.windowKey, view.sort, view.slt)}`, attributes: "data-roll-pdf" });
}

// --- Detail (month table + am / pm places) -------------------------------------

// When a history entry was saved, e.g. "11 Nov 2026" (New Zealand time).
function formatChangedDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
}

function renderCapacityEditor(row: EnrolmentQualityRow, currentMonth: string) {
  const history = row.capacities.length
    ? `<ul class="enrolment-quality__capacity-history flex flex-col gap-4">${[...row.capacities]
        .reverse()
        .map(
          (entry) => `
            <li class="flex items-center gap-8" data-roll-capacity-entry="${entry.id ?? ""}">
              <span class="flex items-center gap-8" data-roll-capacity-text>
                <span class="text-strong">${entry.amCapacity ?? entry.capacity} / ${entry.pmCapacity ?? entry.capacity}${entry.under2Capacity != null ? ` (under-2 ${entry.under2Capacity})` : ""}</span>
                <span class="text-ghost">${isFirstFigure(entry, row.capacities) ? "from the start" : `from ${formatMonthLabel(entry.effectiveFrom)}`}, changed ${formatChangedDate(entry.changedAt)}</span>
                ${entry.note ? `<span class="text-ghost">${escapeHtml(entry.note)}</span>` : ""}
              </span>
              <button type="button" class="button-remove" data-roll-capacity-remove aria-pressed="false" aria-label="Remove am / pm places ${entry.amCapacity ?? entry.capacity} / ${entry.pmCapacity ?? entry.capacity} when saved" title="Remove when saved"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            </li>`,
        )
        .join("")}</ul>`
    : "";
  const licence = `<p class="text-ghost text-small">Licence ${row.licence ?? "-"}${row.licenceU2 != null ? ` (under-2 up to ${row.licenceU2})` : ""}</p>`;
  // Only centres whose licence has under-2 places get the under-2 field.
  const under2Field = row.licenceU2 != null
    ? `<label class="field-label">Under-2<input class="form-control form-control--sm" type="number" name="under2Capacity" min="0" max="500" value="${row.currentCapacity?.under2 ?? ""}" /></label>`
    : "";
  const suggestion =
    row.suggestedCapacity != null
      ? `<p class="text-small flex items-center gap-8" title="Teachers on contact at 10am on a typical day × ratio, capped at the licence">Staffing suggests <strong>${row.suggestedCapacity}</strong> <button type="button" class="button-sm" data-roll-use-suggestion="${row.suggestedCapacity}">Use ${row.suggestedCapacity}</button></p>`
      : "";
  // Prefilled with the user's places in force; empty until the user sets
  // some (the licence is never copied in).
  const current = row.currentCapacity?.source === "operating" ? row.currentCapacity : null;
  const amValue = current ? Math.round(current.am ?? current.capacity) : "";
  // The first figure covers the whole history, so it has no From month.
  const fromField = row.capacities.length
    ? `<label class="field-label">From month<input class="form-control form-control--sm" type="month" name="effectiveFrom" required value="${currentMonth}" /></label>`
    : `<input type="hidden" name="effectiveFrom" value="${FIRST_FIGURE_MONTH}" />`;
  const pmValue = current ? Math.round(current.pm ?? current.capacity) : "";

  return `
    <section class="card enrolment-quality__capacity flex flex-col gap-8" data-roll-capacity-editor hidden>
      <h4 class="subheading">Am / pm places</h4>
      ${licence}
      ${history}
      ${suggestion}
      <form class="flex flex-wrap items-end gap-8" data-roll-capacity-form data-centre-key="${row.centreKey}">
        <label class="field-label">Am<input class="form-control form-control--sm" type="number" name="amCapacity" min="0" max="500" value="${amValue}" /></label>
        <label class="field-label">Pm<input class="form-control form-control--sm" type="number" name="pmCapacity" min="0" max="500" value="${pmValue}" /></label>
        ${under2Field}
        ${fromField}
        <label class="field-label">Note<input class="form-control form-control--sm" type="text" name="note" maxlength="200" placeholder="e.g. 4 teachers" /></label>
        <button type="submit" class="button-sm">Save</button>
        <button type="reset" class="button-sm">Cancel</button>
      </form>
    </section>
  `;
}

function renderMonthTable(row: EnrolmentQualityRow) {
  const body = row.points
    .map(
      (point) => `
        <tr>
          <td>${formatMonthLabel(point.month)}${point.monthToDate ? ' <span class="badge">to date</span>' : ""}</td>
          <td class="data-table__numeric">${bandedPct(point.percent)}</td>
          <td class="data-table__numeric">${point.openDays > 0 ? point.avgPlacements.toFixed(1) : "-"}</td>
          <td class="data-table__numeric">${formatAmPm(point)}</td>
          <td class="data-table__numeric">${formatPlaces(point.placesAm, point.placesPm)}</td>
          <td class="data-table__numeric">${point.openDays || "-"}</td>
          <td class="data-table__numeric nowrap" title="${point.capacitySource === "operating" ? "Busier of the am / pm places; licence in {}" : point.capacitySource === "licence" ? "Licence (no am / pm places set)" : ""}">${formatCapacityWithLicence(point.capacity, point.licence)}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="table-frame">
      <table class="data-table">
        <thead>
          <tr>
            <th>Month</th>
            <th class="data-table__numeric">% full roll</th>
            <th class="data-table__numeric">Placements</th>
            <th class="data-table__numeric" title="Average children booked in the morning / afternoon (Infocare)">Booked am / pm</th>
            <th class="data-table__numeric" title="Your am / pm places for the month">Places am / pm</th>
            <th class="data-table__numeric">Open days</th>
            <th class="data-table__numeric">Capacity</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// --- Body ----------------------------------------------------------------------

// The organisation row: the same columns, no capacity editor (its capacity is
// the sum of the centres').
function renderOrganisationRow(row: EnrolmentQualityRow, view: EnrolmentQualityView) {
  const open = view.openCentreKey === row.centreKey;
  const latestLabel = row.latest ? `${formatMonthLabel(row.latest.month)}${row.latest.monthToDate ? " (to date)" : ""}` : "";

  return `
    <tr class="analytics-table__row--clickable enrolment-quality__total-row${open ? " analytics-table__row--selected" : ""}" data-roll-row="${row.centreKey}" tabindex="0" aria-expanded="${open}">
      <td class="text-strong nowrap">${escapeHtml(row.name)}</td>
      <td>${renderTrend(row, `${row.name} % full roll trend`)}</td>
      <td class="data-table__numeric text-strong">${bandedPct(row.startPercent)}</td>
      <td class="data-table__numeric text-strong" title="${escapeHtml(latestLabel)}">${bandedPct(row.latestPercent)}</td>
      <td class="data-table__numeric text-strong${row.direction ? ` enrolment-quality__trend--${row.direction}` : ""}">${formatChange(row.change)}</td>
      <td class="data-table__numeric text-strong">${formatAmPm(row.latest)}</td>
      <td class="data-table__numeric text-strong">-</td>
      <td class="data-table__numeric text-strong nowrap" title="All centres' capacities added up; licences in {}">${formatCapacityWithLicence(row.currentCapacity?.capacity ?? null, row.licence)}</td>
    </tr>
    <tr class="enrolment-quality__detail" data-roll-detail="${row.centreKey}"${open ? "" : " hidden"}>
      <td colspan="8">${renderMonthTable(row)}</td>
    </tr>
  `;
}

function renderRow(row: EnrolmentQualityRow, view: EnrolmentQualityView) {
  const open = view.openCentreKey === row.centreKey;
  const shortName = formatAnalyticsServiceDisplayName(row.name);
  const latestLabel = row.latest ? `${formatMonthLabel(row.latest.month)}${row.latest.monthToDate ? " (to date)" : ""}` : "";

  return `
    <tr class="analytics-table__row--clickable${open ? " analytics-table__row--selected" : ""}" data-roll-row="${row.centreKey}" tabindex="0" aria-expanded="${open}">
      <td class="text-strong nowrap" title="${escapeHtml(row.name)}">${escapeHtml(shortName)}</td>
      <td>${renderTrend(row, `${shortName} % full roll trend`)}</td>
      <td class="data-table__numeric">${bandedPct(row.startPercent)}</td>
      <td class="data-table__numeric" title="${escapeHtml(latestLabel)}">${bandedPct(row.latestPercent)}</td>
      <td class="data-table__numeric${row.direction ? ` enrolment-quality__trend--${row.direction}` : ""}">${formatChange(row.change)}</td>
      <td class="data-table__numeric">${formatAmPm(row.latest)}</td>
      <td class="data-table__numeric nowrap">${formatPlaces(row.currentCapacity?.source === "operating" ? row.currentCapacity.am : null, row.currentCapacity?.source === "operating" ? row.currentCapacity.pm : null)} <button type="button" class="button-remove" data-roll-edit-capacity="${row.centreKey}" aria-label="Edit am / pm places for ${escapeHtml(shortName)}" title="Edit am / pm places"><i class="bi bi-pencil" aria-hidden="true"></i></button></td>
      <td class="data-table__numeric nowrap" title="${escapeHtml(capacityTitle(row.currentCapacity, row.licence))}">${formatCapacityWithLicence(row.currentCapacity?.capacity ?? null, row.licence)}</td>
    </tr>
    <tr class="enrolment-quality__detail" data-roll-detail="${row.centreKey}"${open ? "" : " hidden"}>
      <td colspan="8">
        <div class="enrolment-quality__detail-grid grid gap-10">
          ${renderMonthTable(row)}
          ${renderCapacityEditor(row, view.currentMonth)}
        </div>
      </td>
    </tr>
  `;
}

export function renderEnrolmentQualityBody(view: EnrolmentQualityView) {
  const hasData = view.rows.some((row) => row.points.some((point) => point.percent != null));
  const progress = view.progress;
  const table = hasData
    ? `
      <div class="table-frame table-frame--scroll">
        <table class="data-table enrolment-quality__table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Trend</th>
              <th class="data-table__numeric" title="% full roll in the first month of the period">Start</th>
              <th class="data-table__numeric" title="% full roll in the latest month (this month is month to date)">Latest</th>
              <th class="data-table__numeric" title="Latest month minus the first month of the period. Steady = within ${STEADY_POINTS}% either way">Change</th>
              <th class="data-table__numeric" title="Average children booked in the morning / afternoon, latest month (Infocare)">Booked am / pm</th>
              <th class="data-table__numeric" title="Your am / pm places this month (pencil to edit)">Places am / pm</th>
              <th class="data-table__numeric" title="The busier of the am / pm places (the licence when none are set), with the licence in {}">Capacity</th>
            </tr>
          </thead>
          <tbody>${view.organisation ? renderOrganisationRow(view.organisation, view) : ""}${view.rows.map((row) => renderRow(row, view)).join("")}</tbody>
        </table>
      </div>`
    : `<p class="text-empty">No roll history stored yet.${progress.running ? "" : " Press <strong>Update from Infocare</strong> to fetch it."}</p>`;

  return `
    <div class="enrolment-quality grid gap-10" data-enrolment-quality data-roll-window="${view.windowKey}" data-roll-sort="${view.sort}"${view.slt ? ` data-roll-slt="${escapeHtml(view.slt)}"` : ""}${progress.running ? ` data-roll-fetching="${progress.done}/${progress.total}"` : ""}>
      ${renderToolbar(view)}
      ${table}
    </div>
  `;
}

// Delegated, so it keeps working after every fragment swap.
export function renderEnrolmentQualityScript() {
  return `
    <script>
      (function() {
        var pollTimer = null;
        function current() { return document.querySelector("[data-enrolment-quality]"); }
        function query(extra) {
          var el = current();
          var params = new URLSearchParams();
          params.set("rollWindow", el ? el.getAttribute("data-roll-window") : "12M");
          params.set("rollSort", el ? el.getAttribute("data-roll-sort") : "interest");
          // A filter link carries the whole view, so the SLT comes from it
          // (All SLT has none); otherwise the SLT on screen is kept.
          if (!extra && el && el.hasAttribute("data-roll-slt")) params.set("rollSlt", el.getAttribute("data-roll-slt"));
          var open = el && el.querySelector("[data-roll-row][aria-expanded='true']");
          if (open) params.set("rollOpen", open.getAttribute("data-roll-row"));
          if (extra) new URLSearchParams(extra).forEach(function(value, key) { params.set(key, value); });
          return params;
        }
        function swap(html) {
          var el = current();
          if (!el) return;
          var holder = document.createElement("div");
          holder.innerHTML = html;
          if (holder.firstElementChild) el.replaceWith(holder.firstElementChild);
          syncHeader();
          schedulePoll();
        }
        // The header's PDF link and Update button live outside the fragment.
        function syncHeader() {
          var el = current();
          if (!el) return;
          var pdf = document.querySelector("[data-roll-pdf]");
          if (pdf) {
            var params = new URLSearchParams();
            params.set("rollWindow", el.getAttribute("data-roll-window"));
            params.set("rollSort", el.getAttribute("data-roll-sort"));
            if (el.hasAttribute("data-roll-slt")) params.set("rollSlt", el.getAttribute("data-roll-slt"));
            pdf.setAttribute("href", "/api/enrolment-quality/pdf?" + params.toString());
          }
          var fetchButton = document.querySelector("[data-roll-fetch]");
          if (!fetchButton) return;
          var running = el.hasAttribute("data-roll-fetching");
          var label = running
            ? "Fetching from Infocare " + el.getAttribute("data-roll-fetching")
            : "Update from Infocare: fetch any missing months (up to 5 years) and this month's figures";
          fetchButton.disabled = running;
          fetchButton.classList.toggle("panel-action-button--disabled", running);
          fetchButton.setAttribute("aria-label", label);
          fetchButton.setAttribute("title", label);
          var icon = fetchButton.querySelector("i");
          if (icon) icon.className = "bi ${REFRESH_ICON} ui-icon" + (running ? " ${SPINNER_CLASS}" : "");
        }
        function load(extra) {
          var params = query(extra);
          return fetch("/fragments/enrolment-quality?" + params.toString(), { headers: { accept: "text/html" } })
            .then(function(response) { if (!response.ok) throw new Error("Could not load Enrolment Quality."); return response.text(); })
            .then(function(html) {
              swap(html);
              var url = new URL(window.location.href);
              url.searchParams.set("rollWindow", params.get("rollWindow"));
              url.searchParams.set("rollSort", params.get("rollSort"));
              if (params.get("rollSlt")) url.searchParams.set("rollSlt", params.get("rollSlt"));
              else url.searchParams.delete("rollSlt");
              window.history.replaceState(null, "", url.toString());
            });
        }
        function post(path, body) {
          return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
            .then(function(response) {
              return response.json().catch(function() { return {}; }).then(function(result) {
                if (!response.ok) throw new Error(result.error || "Request failed.");
                return result;
              });
            });
        }
        // Infocare Analytics uses the same capacity: after a Save its panel is
        // swapped in place from the page as rendered now (no reload).
        function refreshAnalytics() {
          var panel = document.querySelector("[data-panel-id='analytics']");
          if (!panel) return;
          fetch(window.location.href, { headers: { accept: "text/html" } })
            .then(function(response) { if (!response.ok) throw new Error("Could not refresh Infocare Analytics."); return response.text(); })
            .then(function(html) {
              var fresh = new DOMParser().parseFromString(html, "text/html").querySelector("[data-panel-id='analytics']");
              var here = document.querySelector("[data-panel-id='analytics']");
              if (fresh && here) here.replaceWith(document.importNode(fresh, true));
            })
            .catch(function() {});
        }
        // While a fetch runs, refresh every 20s so months appear as they arrive.
        function schedulePoll() {
          if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
          var el = current();
          if (el && el.hasAttribute("data-roll-fetching")) {
            pollTimer = setTimeout(function() { load().catch(function() {}); }, 20000);
          }
        }
        // The Places cell's pencil: open the centre's row and show its editor
        // (the editor stays hidden until then).
        function editCapacity(key) {
          var row = current().querySelector("[data-roll-row='" + key + "']");
          var detail = current().querySelector("[data-roll-detail='" + key + "']");
          if (!row || !detail) return;
          if (detail.hasAttribute("hidden")) toggleRow(row);
          var editor = detail.querySelector("[data-roll-capacity-editor]");
          if (editor) editor.removeAttribute("hidden");
          var input = detail.querySelector("[data-roll-capacity-form] input[name='amCapacity']");
          if (input) { input.focus(); input.select(); }
        }
        function markForRemoval(entry, removing) {
          if (!entry) return;
          var button = entry.querySelector("[data-roll-capacity-remove]");
          var text = entry.querySelector("[data-roll-capacity-text]");
          var struck = text && text.parentElement && text.parentElement.tagName === "DEL" ? text.parentElement : null;
          if (removing && text && !struck) {
            var del = document.createElement("del");
            text.replaceWith(del);
            del.appendChild(text);
          } else if (!removing && struck) {
            struck.replaceWith(text);
          }
          button.setAttribute("aria-pressed", String(removing));
          button.setAttribute("title", removing ? "Keep (undo remove)" : "Remove when saved");
          var icon = button.querySelector("i");
          if (icon) icon.className = "bi " + (removing ? "bi-arrow-counterclockwise" : "bi-x-lg");
        }
        function toggleRow(row) {
          var key = row.getAttribute("data-roll-row");
          var detail = current().querySelector("[data-roll-detail='" + key + "']");
          if (!detail) return;
          var opening = detail.hasAttribute("hidden");
          detail.toggleAttribute("hidden", !opening);
          row.setAttribute("aria-expanded", String(opening));
          row.classList.toggle("analytics-table__row--selected", opening);
          if (!opening) {
            var editor = detail.querySelector("[data-roll-capacity-editor]");
            var form = editor && editor.querySelector("[data-roll-capacity-form]");
            if (form) form.reset();
            if (editor) editor.setAttribute("hidden", "");
          }
          // Opening a centre points Beep Beep's chat at it (not the organisation row).
          if (opening && key !== "${ORGANISATION_ROW_KEY}") {
            document.dispatchEvent(new CustomEvent("centre-selected", { detail: { centreKey: key } }));
          }
        }
        document.addEventListener("click", function(event) {
          var target = event.target instanceof Element ? event.target : null;
          var fetchButton = target && target.closest("[data-roll-fetch]");
          if (fetchButton) {
            if (fetchButton.disabled) return;
            post("/api/enrolment-quality/sync", {}).then(function() { return load(); }).catch(function(error) { window.alert(error.message); });
            return;
          }
          var root = target && target.closest("[data-enrolment-quality]");
          if (!root) return;
          var link = target.closest("[data-roll-query]");
          if (link) {
            event.preventDefault();
            load(link.getAttribute("data-roll-query")).catch(function(error) { window.alert(error.message); });
            return;
          }
          var edit = target.closest("[data-roll-edit-capacity]");
          if (edit) {
            editCapacity(edit.getAttribute("data-roll-edit-capacity"));
            return;
          }
          var suggestion = target.closest("[data-roll-use-suggestion]");
          if (suggestion) {
            var suggestionForm = suggestion.closest("td").querySelector("[data-roll-capacity-form]");
            if (suggestionForm) {
              var places = suggestion.getAttribute("data-roll-use-suggestion");
              suggestionForm.querySelector("input[name='amCapacity']").value = places;
              suggestionForm.querySelector("input[name='pmCapacity']").value = places;
              suggestionForm.querySelector("input[name='amCapacity']").focus();
            }
            return;
          }
          // Removing only marks the entry (struck through); nothing changes
          // until Save. Pressing it again keeps the entry.
          var remove = target.closest("[data-roll-capacity-remove]");
          if (remove) {
            markForRemoval(remove.closest("[data-roll-capacity-entry]"), remove.getAttribute("aria-pressed") !== "true");
            return;
          }
          var row = target.closest("[data-roll-row]");
          if (row && !target.closest("a, button, input, select, textarea, label")) toggleRow(row);
        });
        document.addEventListener("keydown", function(event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          var row = event.target instanceof Element ? event.target.closest("[data-roll-row]") : null;
          if (!row) return;
          event.preventDefault();
          toggleRow(row);
        });
        document.addEventListener("submit", function(event) {
          var form = event.target instanceof Element ? event.target.closest("[data-roll-capacity-form]") : null;
          if (!form) return;
          event.preventDefault();
          var data = new FormData(form);
          var section = form.closest(".enrolment-quality__capacity");
          // Every change is sent together on Save: the entries marked for
          // removal, and a new figure only when a box was changed.
          var removeIds = Array.prototype.slice
            .call(section.querySelectorAll("[data-roll-capacity-remove][aria-pressed='true']"))
            .map(function(button) { return Number(button.closest("[data-roll-capacity-entry]").getAttribute("data-roll-capacity-entry")); });
          var changed = Array.prototype.some.call(form.querySelectorAll("input"), function(input) { return input.value !== input.defaultValue; });
          if (!changed && removeIds.length === 0) return;
          var add = null;
          if (changed) {
            if (String(data.get("amCapacity") || "") === "" || String(data.get("pmCapacity") || "") === "") {
              window.alert("Enter both the am and pm places.");
              return;
            }
            add = {
              amCapacity: Number(data.get("amCapacity")),
              pmCapacity: Number(data.get("pmCapacity")),
              effectiveFrom: String(data.get("effectiveFrom") || ""),
              under2Capacity: data.has("under2Capacity") && String(data.get("under2Capacity")) !== "" ? Number(data.get("under2Capacity")) : null,
              note: String(data.get("note") || ""),
            };
          }
          post("/api/enrolment-quality/capacity", {
            centreKey: Number(form.getAttribute("data-centre-key")),
            removeIds: removeIds,
            add: add,
          }).then(function() { refreshAnalytics(); return load(); }).then(function() {
            // The new figures can re-sort the table: keep the saved centre (still open) in view.
            var saved = current().querySelector("[data-roll-row='" + form.getAttribute("data-centre-key") + "']");
            if (saved) saved.scrollIntoView({ block: "nearest" });
          }).catch(function(error) { window.alert(error.message); });
        });
        // Cancel puts the boxes back, un-marks every entry and hides the editor.
        document.addEventListener("reset", function(event) {
          var form = event.target instanceof Element ? event.target.closest("[data-roll-capacity-form]") : null;
          if (!form) return;
          var section = form.closest(".enrolment-quality__capacity");
          section.querySelectorAll("[data-roll-capacity-entry]").forEach(function(entry) { markForRemoval(entry, false); });
          section.setAttribute("hidden", "");
        });
        schedulePoll();
      })();
    </script>
  `;
}
