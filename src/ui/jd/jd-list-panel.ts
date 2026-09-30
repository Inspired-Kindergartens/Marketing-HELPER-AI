import {
  JD_OTHER_LOCATION_DISPLAY,
  JD_OTHER_LOCATION_KEY,
  type JobDescriptionListItem,
  type JdTitleProfileView,
  type JdCentreProfileView,
} from "../../storage/jd-store.js";
import { formatNzDisplayDate } from "./jd-date.js";
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

export function renderJdListPanel(options: JdListPanelOptions): string {
  const rows = options.jobDescriptions.map(renderJdRow).join("");
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
      <form class="jd-list__create" data-jd-create>
        <label>
          <span>Job Title</span>
          <select name="jobTitleProfileId" required>
            <option value="" disabled selected>Select a job title</option>
            ${titleOptions}
          </select>
        </label>
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
        <label data-jd-other-title-field hidden>
          <span>Job title (optional override)</span>
          <input
            type="text"
            name="jobTitleOverride"
            maxlength="200"
            placeholder="Leave blank to use the selected title"
          />
        </label>
        <button type="submit" data-jd-create-submit><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New Job Description</span></button>
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
      <div class="jd-list__rows">
        ${rows || `<p class="jd-list__empty">No job descriptions yet. Create one above.</p>`}
      </div>
    </div>
  `;
}
