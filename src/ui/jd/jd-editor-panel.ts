import {
  JD_OTHER_LOCATION_KEY,
  type JobDescriptionView,
  type JdTitleProfileView,
  type JdCentreProfileView,
} from "../../storage/jd-store.js";
import { formatNzDateInput, formatNzDateTimeInput } from "./jd-date.js";
import { formatJdLocationDisplay } from "./jd-email.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type JdEditorPanelOptions = {
  jobDescription: JobDescriptionView | null;
  titleProfiles: JdTitleProfileView[];
  centreProfiles: JdCentreProfileView[];
};

function renderTitleProfileOptions(profiles: JdTitleProfileView[], selectedId: number | null): string {
  return [
    `<option value="">None</option>`,
    ...profiles.map(
      (profile) =>
        `<option value="${profile.id}"${profile.id === selectedId ? " selected" : ""}>${escapeHtml(profile.jobTitle)}</option>`,
    ),
  ].join("");
}

function renderCentreProfileOptions(profiles: JdCentreProfileView[], selectedKey: number | null): string {
  return [
    // A JD with no centre is an org-wide role, so "Other" (not the bare "None")
    // is what a null centreKey means here.
    `<option value="${JD_OTHER_LOCATION_KEY}"${selectedKey == null ? " selected" : ""}>Other (not centre based)</option>`,
    ...profiles.map(
      (profile) =>
        `<option value="${profile.centreKey}"${profile.centreKey === selectedKey ? " selected" : ""}>${escapeHtml(formatJdLocationDisplay(profile.locationDisplay))}</option>`,
    ),
  ].join("");
}

function renderRoleSections(jd: JobDescriptionView): string {
  return jd.roleSections
    .map(
      (section, sectionIndex) => `
        <section class="jd-editor__role-section flex flex-col gap-8" data-section-index="${sectionIndex}">
          <div class="jd-editor__role-section-actions flex gap-6 items-center">
            <input type="text" class="jd-editor__role-heading form-control" name="roleSections[${sectionIndex}][heading]" value="${escapeHtml(section.heading)}" placeholder="Section heading" />
            <button type="button" class="jd-editor__mini-button" data-jd-remove-role-section title="Remove section"><i class="bi bi-trash ui-icon" aria-hidden="true"></i></button>
          </div>
          <textarea class="form-control" name="roleSections[${sectionIndex}][intro]" placeholder="Intro sentence">${escapeHtml(section.intro ?? "")}</textarea>
          <ul class="jd-editor__role-bullets flex flex-col gap-6">
            ${section.bullets
              .map(
                (bullet, bulletIndex) => `
                  <li>
                    <input type="text" class="jd-editor__bullet-text form-control" name="roleSections[${sectionIndex}][bullets][${bulletIndex}][text]" value="${escapeHtml(bullet.text)}" placeholder="Bullet text" />
                    <button type="button" class="jd-editor__mini-button" data-jd-remove-role-bullet title="Remove bullet"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>
                  </li>
                `,
              )
              .join("")}
          </ul>
          <button type="button" class="jd-editor__inline-button" data-jd-add-role-bullet><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add bullet</span></button>
        </section>
      `,
    )
    .join("");
}

export function renderJdEditorPanel(options: JdEditorPanelOptions): string {
  const jd = options.jobDescription;

  if (!jd) {
    return `<div class="jd-editor jd-editor--empty"><p>Select a job description from the list, or create a new one.</p></div>`;
  }

  const isPartTime = jd.positionType === "Part-time";

  return `
    <form class="jd-editor" id="jd-edit-${jd.id}" data-jd-edit data-jd-id="${jd.id}">
      <div class="jd-editor__field-grid grid gap-10">
        <label class="field-label">
          <span>Job Title</span>
          <input class="form-control" type="text" name="jobTitle" value="${escapeHtml(jd.jobTitle)}" required />
        </label>
        <label class="field-label">
          <span>Job Category</span>
          <input class="form-control" type="text" name="jobCategory" value="${escapeHtml(jd.jobCategory)}" />
        </label>
        <label class="field-label">
          <span>Location</span>
          <input class="form-control" type="text" name="locationDisplay" value="${escapeHtml(jd.locationDisplay)}" />
        </label>
        <label class="field-label">
          <span>Collective Agreement</span>
          <input class="form-control" type="text" name="agreementText" value="${escapeHtml(jd.agreementText)}" />
        </label>
        <label class="field-label">
          <span>Position Type</span>
          <select class="form-control" name="positionType">
            <option value="Full Time"${!isPartTime ? " selected" : ""}>Full Time</option>
            <option value="Part-time"${isPartTime ? " selected" : ""}>Part-time</option>
          </select>
        </label>
        <label class="field-label">
          <span>Date advertised</span>
          <span class="jd-editor__date-combo">
            <input class="form-control" type="text" name="dateAdvertised" value="${formatNzDateInput(jd.dateAdvertised)}" placeholder="YYYY-MM-DD" inputmode="numeric" data-jd-date-text />
            <button type="button" class="jd-editor__date-button" data-jd-open-date-picker title="Choose date" aria-label="Choose date advertised"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="jd-editor__date-picker" value="${formatNzDateInput(jd.dateAdvertised)}" data-jd-date-picker tabindex="-1" aria-hidden="true" />
          </span>
        </label>
        <label class="field-label">
          <span>Level/Salary Range</span>
          <input class="form-control" type="text" name="salaryRangeText" value="${escapeHtml(jd.salaryRangeText)}" />
        </label>
        <label class="field-label">
          <span>Closing Date</span>
          <span class="jd-editor__date-combo">
            <input class="form-control" type="text" name="closingAt" value="${formatNzDateTimeInput(jd.closingAt)}" placeholder="YYYY-MM-DDTHH:mm" inputmode="numeric" data-jd-date-text />
            <button type="button" class="jd-editor__date-button" data-jd-open-date-picker title="Choose closing date and time" aria-label="Choose closing date and time"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="jd-editor__date-picker" value="${formatNzDateTimeInput(jd.closingAt).slice(0, 10)}" data-jd-date-picker data-jd-keep-time tabindex="-1" aria-hidden="true" />
          </span>
        </label>
        <label class="field-label">
          <span>Senior Teacher</span>
          <input class="form-control" type="text" name="seniorTeacherName" value="${escapeHtml(jd.seniorTeacherName)}" />
        </label>
        <label class="field-label">
          <span>Start Date</span>
          <input class="form-control" type="text" name="startDateText" value="${escapeHtml(jd.startDateText)}" />
        </label>
      </div>

      <label class="jd-editor__block field-label">
        <span>Qualifications</span>
        <textarea class="form-control" name="qualificationsText">${escapeHtml(jd.qualificationsText)}</textarea>
      </label>

      <label class="jd-editor__block field-label">
        <span>Job Description intro paragraph</span>
        <textarea class="form-control" name="introParagraph">${escapeHtml(jd.introParagraph)}</textarea>
      </label>

      <div class="jd-editor__roles flex flex-col gap-12">
        <h3 class="subheading">Role &amp; Responsibilities</h3>
        ${renderRoleSections(jd)}
        <button type="button" class="jd-editor__inline-button" data-jd-add-role-section><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add section</span></button>
      </div>

      <div class="jd-editor__field-grid grid gap-10 jd-editor__footer-fields">
        <label class="field-label">
          <span>Reviewed By</span>
          <input class="form-control" type="text" name="reviewedByAcronym" value="${escapeHtml(jd.reviewedByAcronym)}" />
        </label>
        <label class="field-label">
          <span>Approved By</span>
          <input class="form-control" type="text" name="approvedByAcronym" value="${escapeHtml(jd.approvedByAcronym)}" />
        </label>
        <label class="field-label">
          <span>Last Updated By</span>
          <input class="form-control" type="text" name="lastUpdatedByAcronym" value="${escapeHtml(jd.lastUpdatedByAcronym)}" />
        </label>
      </div>

      <div class="jd-editor__actions flex gap-10 justify-end">
        <button type="button" class="panel-action-button" data-jd-action="pdf" data-jd-id="${jd.id}"><i class="bi bi-file-earmark-pdf ui-icon" aria-hidden="true"></i><span>Download PDF</span></button>
        <button type="submit" class="panel-action-button"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      </div>
    </form>
  `;
}
