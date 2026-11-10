// Enrolment Quality panel: each centre's % full roll, month by month.
// The body is one swappable fragment ([data-enrolment-quality]): the window,
// sort, capacity editor and fetch progress all replace it in place from
// /fragments/enrolment-quality instead of reloading the dashboard.
import {
  formatMonthLabel,
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

export type EnrolmentQualityView = {
  rows: EnrolmentQualityRow[];
  // All kindergartens together, always shown first whatever the sort.
  organisation?: EnrolmentQualityRow | null;
  windowKey: RollWindowKey;
  sort: RollSort;
  currentMonth: string;
  progress: RollHistoryProgress;
  openCentreKey?: number | null;
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

function formatCapacity(capacity: number | null) {
  return capacity == null ? "-" : String(Math.round(capacity));
}

// A % coloured by its band: 90%+ green, 80-89% grey, under 80% red.
function bandedPct(value: number | null) {
  const band = rollBand(value);
  return band ? `<span class="enrolment-quality__band--${band}">${pct(value)}</span>` : pct(value);
}

export function fragmentQuery(windowKey: RollWindowKey, sort: RollSort) {
  return `rollWindow=${encodeURIComponent(windowKey)}&rollSort=${encodeURIComponent(sort)}`;
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
  const windowLinks = ROLL_WINDOW_OPTIONS.map((option) => {
    const active = option.key === view.windowKey;
    return `<a class="analytics-toolbar__window${active ? " analytics-toolbar__window--active" : ""}" href="/app?${fragmentQuery(option.key, view.sort)}" data-roll-query="${fragmentQuery(option.key, view.sort)}"${active ? ' aria-current="true"' : ""}>${option.label}</a>`;
  }).join("");
  const sortLink = (sort: RollSort, label: string, aria: string) =>
    `<a class="analytics-toolbar__window${view.sort === sort ? " analytics-toolbar__window--active" : ""}" href="/app?${fragmentQuery(view.windowKey, sort)}" data-roll-query="${fragmentQuery(view.windowKey, sort)}" aria-label="${aria}" title="${aria}">${label}</a>`;
  return `
    <div class="analytics-toolbar__actions flex flex-wrap gap-4 items-center">
      ${windowLinks}
      ${sortLink("interest", "Worst change", "Sort by Change, the biggest fall first")}
      ${sortLink("latest", "Worst latest", "Sort by Latest, the lowest % first")}
      ${sortLink("asc", "A-Z", "Sort service A to Z")}
      ${sortLink("desc", "Z-A", "Sort service Z to A")}
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
  return `<button class="panel-action-button${running ? " panel-action-button--disabled" : ""}" type="button" data-roll-fetch${running ? " disabled" : ""} aria-label="${fetchLabel}" title="${fetchLabel}"><i class="bi ${running ? "bi-arrow-repeat panel-action-button__spinner" : "bi-download"} ui-icon" aria-hidden="true"></i></button>`
    + `<a class="panel-action-button" href="/api/enrolment-quality/pdf?${fragmentQuery(view.windowKey, view.sort)}" download data-roll-pdf aria-label="Download this view as a PDF to print" title="Download this view as a PDF to print"><i class="bi bi-printer ui-icon" aria-hidden="true"></i></a>`;
}

// --- Detail (month table + operating capacity) ---------------------------------

function renderCapacityEditor(row: EnrolmentQualityRow, currentMonth: string) {
  const history = row.capacities.length
    ? `<ul class="enrolment-quality__capacity-history flex flex-col gap-4">${[...row.capacities]
        .reverse()
        .map(
          (entry) => `
            <li class="flex items-center gap-8">
              <span class="text-strong">${entry.capacity}${entry.under2Capacity != null ? ` (under-2 ${entry.under2Capacity})` : ""}</span>
              <span class="text-ghost">from ${formatMonthLabel(entry.effectiveFrom)}</span>
              ${entry.note ? `<span class="text-ghost">${escapeHtml(entry.note)}</span>` : ""}
              <button type="button" class="button-remove" data-roll-capacity-delete data-centre-key="${row.centreKey}" data-effective-from="${entry.effectiveFrom}" aria-label="Remove operating capacity ${entry.capacity} from ${formatMonthLabel(entry.effectiveFrom)}" title="Remove"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
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
  const defaultFrom = row.capacities.length ? currentMonth : row.firstStoredMonth ?? currentMonth;

  return `
    <section class="card enrolment-quality__capacity flex flex-col gap-8">
      <h4 class="subheading">Operating capacity</h4>
      ${licence}
      ${history}
      ${suggestion}
      <form class="flex flex-wrap items-end gap-8" data-roll-capacity-form data-centre-key="${row.centreKey}">
        <label class="field-label">Capacity<input class="form-control form-control--sm" type="number" name="capacity" min="1" max="500" required value="${row.currentCapacity ? Math.round(row.currentCapacity.capacity) : ""}" /></label>
        ${under2Field}
        <label class="field-label">From month<input class="form-control form-control--sm" type="month" name="effectiveFrom" required value="${defaultFrom}" /></label>
        <label class="field-label">Note<input class="form-control form-control--sm" type="text" name="note" maxlength="200" placeholder="e.g. 4 teachers" /></label>
        <button type="submit" class="button-sm">Save</button>
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
          <td class="data-table__numeric">${point.openDays || "-"}</td>
          <td class="data-table__numeric" title="${point.capacitySource === "operating" ? "Operating capacity" : point.capacitySource === "licence" ? "Licence (no operating capacity set)" : ""}">${formatCapacity(point.capacity)}</td>
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
            <th class="data-table__numeric">Avg am / pm</th>
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
      <td class="data-table__numeric text-strong nowrap" title="All centres' capacities added up (licences ${row.licence ?? "-"})">${formatCapacity(row.currentCapacity?.capacity ?? null)}</td>
    </tr>
    <tr class="enrolment-quality__detail" data-roll-detail="${row.centreKey}"${open ? "" : " hidden"}>
      <td colspan="7">${renderMonthTable(row)}</td>
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
      <td class="data-table__numeric nowrap" title="${row.currentCapacity?.source === "operating" ? `Operating capacity (licence ${row.licence ?? "-"})` : "Licence (no operating capacity set)"}${row.currentCapacity?.under2 != null ? `, of which ${row.currentCapacity.under2} under-2` : ""}">${formatCapacity(row.currentCapacity?.capacity ?? null)} <button type="button" class="button-remove" data-roll-edit-capacity="${row.centreKey}" aria-label="Edit operating capacity for ${escapeHtml(shortName)}" title="Edit operating capacity"><i class="bi bi-pencil" aria-hidden="true"></i></button></td>
    </tr>
    <tr class="enrolment-quality__detail" data-roll-detail="${row.centreKey}"${open ? "" : " hidden"}>
      <td colspan="7">
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
              <th class="data-table__numeric" title="Average children booked in the morning / afternoon, latest month">Am / pm</th>
              <th class="data-table__numeric" title="Operating capacity, or the licence (lic) when none is set">Capacity</th>
            </tr>
          </thead>
          <tbody>${view.organisation ? renderOrganisationRow(view.organisation, view) : ""}${view.rows.map((row) => renderRow(row, view)).join("")}</tbody>
        </table>
      </div>`
    : `<p class="text-empty">No roll history stored yet.${progress.running ? "" : " Press <strong>Update from Infocare</strong> to fetch it."}</p>`;

  return `
    <div class="enrolment-quality grid gap-10" data-enrolment-quality data-roll-window="${view.windowKey}" data-roll-sort="${view.sort}"${progress.running ? ` data-roll-fetching="${progress.done}/${progress.total}"` : ""}>
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
          if (icon) icon.className = "bi " + (running ? "bi-arrow-repeat panel-action-button__spinner" : "bi-download") + " ui-icon";
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
        // While a fetch runs, refresh every 20s so months appear as they arrive.
        function schedulePoll() {
          if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
          var el = current();
          if (el && el.hasAttribute("data-roll-fetching")) {
            pollTimer = setTimeout(function() { load().catch(function() {}); }, 20000);
          }
        }
        // The Capacity cell's pencil: open the centre's row and its editor.
        function editCapacity(key) {
          var row = current().querySelector("[data-roll-row='" + key + "']");
          var detail = current().querySelector("[data-roll-detail='" + key + "']");
          if (!row || !detail) return;
          if (detail.hasAttribute("hidden")) toggleRow(row);
          var input = detail.querySelector("[data-roll-capacity-form] input[name='capacity']");
          if (input) { input.focus(); input.select(); }
        }
        function toggleRow(row) {
          var key = row.getAttribute("data-roll-row");
          var detail = current().querySelector("[data-roll-detail='" + key + "']");
          if (!detail) return;
          var opening = detail.hasAttribute("hidden");
          detail.toggleAttribute("hidden", !opening);
          row.setAttribute("aria-expanded", String(opening));
          row.classList.toggle("analytics-table__row--selected", opening);
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
            var form = suggestion.closest("td").querySelector("[data-roll-capacity-form] input[name='capacity']");
            if (form) { form.value = suggestion.getAttribute("data-roll-use-suggestion"); form.focus(); }
            return;
          }
          var remove = target.closest("[data-roll-capacity-delete]");
          if (remove) {
            post("/api/enrolment-quality/capacity/delete", {
              centreKey: Number(remove.getAttribute("data-centre-key")),
              effectiveFrom: remove.getAttribute("data-effective-from"),
            }).then(function() { return load(); }).catch(function(error) { window.alert(error.message); });
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
          post("/api/enrolment-quality/capacity", {
            centreKey: Number(form.getAttribute("data-centre-key")),
            capacity: Number(data.get("capacity")),
            under2Capacity: data.has("under2Capacity") && String(data.get("under2Capacity")) !== "" ? Number(data.get("under2Capacity")) : null,
            effectiveFrom: String(data.get("effectiveFrom") || ""),
            note: String(data.get("note") || ""),
          }).then(function() { return load(); }).catch(function(error) { window.alert(error.message); });
        });
        schedulePoll();
      })();
    </script>
  `;
}
