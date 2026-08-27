import type { JobDescriptionListItem, JdTitleProfileView, JdCentreProfileView } from "../../storage/jd-store.js";
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
  const titleOptions = options.titleProfiles
    .map((profile) => `<option value="${profile.id}">${escapeHtml(profile.jobTitle)}</option>`)
    .join("");
  const locationOptions = options.centreProfiles
    .map((centre) => `<option value="${centre.centreKey}">${escapeHtml(centre.locationDisplay)}</option>`)
    .join("");

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
        <label>
          <span>Location</span>
          <select name="centreKey" required>
            <option value="" disabled selected>Select a kindergarten</option>
            ${locationOptions}
          </select>
        </label>
        <button type="submit" data-jd-create-submit><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New Job Description</span></button>
        <div class="jd-list__create-busy" data-jd-create-busy role="status" aria-live="polite" hidden>
          <span class="jd-list__create-spinner" aria-hidden="true"></span>
          <span>Generating job description intro...</span>
        </div>
      </form>
      <div class="jd-list__rows">
        ${rows || `<p class="jd-list__empty">No job descriptions yet. Create one above.</p>`}
      </div>
    </div>
  `;
}
