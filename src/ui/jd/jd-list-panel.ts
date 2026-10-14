import {
  JD_OTHER_LOCATION_DISPLAY,
  JD_OTHER_LOCATION_KEY,
  type JobDescriptionListItem,
  type JdTitleProfileView,
  type JdCentreProfileView,
  defaultClosingDate,
} from "../../storage/jd-store.js";
import { formatNzDateTimeInput, formatNzDisplayDate } from "./jd-date.js";
import { formatJdLocationDisplay } from "./jd-email.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type JdListPanelOptions = {
  jobDescriptions: JobDescriptionListItem[];
  titleProfiles: JdTitleProfileView[];
  centreProfiles: JdCentreProfileView[];
};

function renderJdRow(jd: JobDescriptionListItem): string {
  const href = `/jd?panel=jd-editor&jd=${jd.id}`;
  return `
    <article class="jd-list__row" data-jd-id="${jd.id}">
      <a class="jd-list__main" href="${href}">
        <span class="jd-list__title">${escapeHtml(jd.jobTitle)}</span>
        <span class="jd-list__meta">${escapeHtml(formatJdLocationDisplay(jd.locationDisplay))} · ${escapeHtml(jd.positionType)}</span>
      </a>
      <div class="jd-list__badges">
        ${jd.dateAdvertised ? `<span class="jd-list__badge">Advertised ${escapeHtml(formatNzDisplayDate(jd.dateAdvertised))}</span>` : ""}
        ${jd.closingAt ? `<span class="jd-list__badge">Closes ${escapeHtml(formatNzDisplayDate(jd.closingAt))}</span>` : ""}
      </div>
      <div class="jd-list__actions">
        <a class="jd-list__link" href="/jd?panel=jd-blurb&jd=${jd.id}" title="Website blurb"><i class="bi bi-file-earmark-richtext ui-icon" aria-hidden="true"></i></a>
        <button type="button" class="jd-list__button" data-jd-action="pdf" data-jd-id="${jd.id}" title="Download PDF"><i class="bi bi-file-earmark-pdf ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="jd-list__button" data-jd-action="duplicate" data-jd-id="${jd.id}" title="Duplicate"><i class="bi bi-copy ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="jd-list__button jd-list__button--danger" data-jd-action="delete" data-jd-id="${jd.id}" title="Delete"><i class="bi bi-trash3 ui-icon" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

const JD_LIST_PAGE_SIZE = 10;

export function renderJdListPanel(options: JdListPanelOptions): string {
  const rows = options.jobDescriptions.map(renderJdRow).join("");
  const pageCount = Math.ceil(options.jobDescriptions.length / JD_LIST_PAGE_SIZE);
  // Both sets are rendered; the client script hides the ones that don't apply to
  // the selected location, so the Job Title list differs for "Other".
  const titleOptions = options.titleProfiles
    .map(
      (profile) =>
        `<option value="${profile.id}" data-centre-specific="${profile.isCentreSpecific ? "true" : "false"}">${escapeHtml(profile.jobTitle)}</option>`,
    )
    .join("");
  const locationOptions = [
    ...options.centreProfiles.map(
      (centre) =>
        `<option value="${centre.centreKey}">${escapeHtml(formatJdLocationDisplay(centre.locationDisplay))}</option>`,
    ),
    // Org-wide roles that are not based at a kindergarten. Selected by default.
    `<option value="${JD_OTHER_LOCATION_KEY}" selected>Other (not centre based)</option>`,
  ].join("");

  return `
    <div class="jd-list" data-jd-list>
      <h3 class="jd-list__heading">New Job Description</h3>
      <form class="jd-list__create" data-jd-create>
        <label data-jd-location-field>
          <span>Location</span>
          <select name="centreKey" required>
            <option value="" disabled>Select a location</option>
            ${locationOptions}
          </select>
        </label>
        <label data-jd-other-location-field hidden>
          <span>Location name</span>
          <input
            type="text"
            name="locationDisplay"
            placeholder="${escapeHtml(JD_OTHER_LOCATION_DISPLAY)}"
          />
        </label>
        <label>
          <span>Job Title</span>
          <select name="jobTitleProfileId" required>
            <option value="" disabled selected>Select a job title</option>
            ${titleOptions}
          </select>
        </label>
        <label data-jd-other-title-field hidden>
          <span>Job title (optional override)</span>
          <input
            type="text"
            name="jobTitleOverride"
            maxlength="200"
            placeholder="Leave blank to use the selected title"
          />
        </label>
        <label>
          <span>Closing Date</span>
          <span class="jd-editor__date-combo">
            <input type="text" name="closingAt" value="${formatNzDateTimeInput(defaultClosingDate(new Date()))}" placeholder="YYYY-MM-DDTHH:mm" inputmode="numeric" data-jd-date-text />
            <button type="button" class="jd-editor__date-button" data-jd-open-date-picker title="Choose closing date and time" aria-label="Choose closing date and time"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="jd-editor__date-picker" value="${formatNzDateTimeInput(defaultClosingDate(new Date())).slice(0, 10)}" data-jd-date-picker data-jd-keep-time tabindex="-1" aria-hidden="true" />
          </span>
        </label>
        <label>
          <span>Start Date</span>
          <input type="text" name="startDateText" value="To be negotiated" />
        </label>
        <button type="submit" class="panel-action-button" data-jd-create-submit><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New Job Description</span></button>
        <div class="jd-list__create-busy" data-jd-create-busy role="status" aria-live="polite" hidden>
          <span class="jd-list__create-spinner" aria-hidden="true"></span>
          <span>Generating job description intro...</span>
        </div>
      </form>
      <script>
        (function() {
          // Location leads: "Other" (an org-wide role with no kindergarten) is
          // the default, and the Job Title list is filtered to match — office
          // titles for "Other", centre titles for a kindergarten. Picking
          // "Other" also reveals a free-text location name and an optional
          // job-title override, so a one-off role can be named without first
          // creating a profile for it.
          var form = document.querySelector("[data-jd-create]");
          if (!form) return;
          var titleSelect = form.querySelector('[name="jobTitleProfileId"]');
          var locationSelect = form.querySelector('[name="centreKey"]');
          var otherLocationField = form.querySelector("[data-jd-other-location-field]");
          var otherTitleField = form.querySelector("[data-jd-other-title-field]");
          if (!titleSelect || !locationSelect || !otherLocationField || !otherTitleField) return;
          var OTHER = "${JD_OTHER_LOCATION_KEY}";

          // The placeholder is the first option; every other one is a profile.
          var titleOptions = Array.prototype.slice.call(titleSelect.options, 1);
          var placeholder = titleSelect.options[0];

          function syncTitlesForLocation() {
            var isOther = locationSelect.value === OTHER;
            var selected = null;

            titleOptions.forEach(function(option) {
              var centreSpecific = option.getAttribute("data-centre-specific") !== "false";
              // Show the titles that belong to the chosen kind of location.
              var applies = isOther ? !centreSpecific : centreSpecific;
              option.hidden = !applies;
              option.disabled = !applies;
              if (applies && selected === null) selected = option;
            });

            // If the current pick no longer applies, fall back to the
            // placeholder so a hidden option can never be submitted.
            var current = titleSelect.options[titleSelect.selectedIndex];
            if (!current || current.disabled) {
              if (placeholder) placeholder.selected = true;
            }

            otherLocationField.hidden = !isOther;
            otherTitleField.hidden = !isOther;
          }

          locationSelect.addEventListener("change", syncTitlesForLocation);
          syncTitlesForLocation();
        })();
      </script>
      <h3 class="jd-list__heading">Generated Jobs List</h3>
      <div class="jd-list__rows" data-jd-rows>
        ${rows || `<p class="jd-list__empty">No job descriptions yet. Create one above.</p>`}
      </div>
      ${
        pageCount > 1
          ? `<nav class="comms-pagination" aria-label="Job description pages" data-jd-pagination>
              <button type="button" data-jd-page="prev" disabled>Previous</button>
              <span data-jd-page-label>Page 1 of ${pageCount}</span>
              <button type="button" data-jd-page="next">Next</button>
            </nav>
            <script>
              (function() {
                var pageSize = ${JD_LIST_PAGE_SIZE};
                var pageCount = ${pageCount};
                var page = 1;
                var rows = Array.prototype.slice.call(document.querySelectorAll("[data-jd-rows] > .jd-list__row"));
                var nav = document.querySelector("[data-jd-pagination]");
                var prev = nav.querySelector('[data-jd-page="prev"]');
                var next = nav.querySelector('[data-jd-page="next"]');
                var label = nav.querySelector("[data-jd-page-label]");

                function show() {
                  rows.forEach(function(row, index) {
                    row.hidden = index < (page - 1) * pageSize || index >= page * pageSize;
                  });
                  prev.disabled = page <= 1;
                  next.disabled = page >= pageCount;
                  label.textContent = "Page " + page + " of " + pageCount;
                }

                prev.addEventListener("click", function() { if (page > 1) { page -= 1; show(); } });
                next.addEventListener("click", function() { if (page < pageCount) { page += 1; show(); } });
                show();
              })();
            </script>`
          : ""
      }
    </div>
  `;
}
