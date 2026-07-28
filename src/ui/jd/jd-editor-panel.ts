import type { JobDescriptionView, JdTitleProfileView, JdCentreProfileView } from "../../storage/jd-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toDateTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    `<option value="">None</option>`,
    ...profiles.map(
      (profile) =>
        `<option value="${profile.centreKey}"${profile.centreKey === selectedKey ? " selected" : ""}>${escapeHtml(profile.locationDisplay)}</option>`,
    ),
  ].join("");
}

function renderRoleSections(jd: JobDescriptionView): string {
  return jd.roleSections
    .map(
      (section, sectionIndex) => `
        <section class="jd-editor__role-section" data-section-index="${sectionIndex}">
          <div class="jd-editor__role-section-actions">
            <input type="text" class="jd-editor__role-heading" name="roleSections[${sectionIndex}][heading]" value="${escapeHtml(section.heading)}" placeholder="Section heading" />
            <button type="button" class="jd-editor__mini-button" data-jd-remove-role-section title="Remove section"><i class="bi bi-trash ui-icon" aria-hidden="true"></i></button>
          </div>
          <textarea name="roleSections[${sectionIndex}][intro]" placeholder="Intro sentence">${escapeHtml(section.intro ?? "")}</textarea>
          <ul class="jd-editor__role-bullets">
            ${section.bullets
              .map(
                (bullet, bulletIndex) => `
                  <li>
                    <input type="text" class="jd-editor__bullet-text" name="roleSections[${sectionIndex}][bullets][${bulletIndex}][text]" value="${escapeHtml(bullet.text)}" placeholder="Bullet text" />
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
    <a class="jd-back-link" href="/jd?panel=jd-list"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to Job Descriptions</span></a>
    <a class="jd-back-link" href="/jd?panel=jd-blurb&jd=${jd.id}"><i class="bi bi-file-earmark-richtext ui-icon" aria-hidden="true"></i><span>Website blurb for this JD</span></a>
    <form class="jd-editor" data-jd-edit data-jd-id="${jd.id}">
      <div class="jd-editor__field-grid">
        <label>
          <span>Job Title</span>
          <input type="text" name="jobTitle" value="${escapeHtml(jd.jobTitle)}" required />
        </label>
        <label>
          <span>Job Category</span>
          <input type="text" name="jobCategory" value="${escapeHtml(jd.jobCategory)}" />
        </label>
        <label>
          <span>Location</span>
          <input type="text" name="locationDisplay" value="${escapeHtml(jd.locationDisplay)}" />
        </label>
        <label>
          <span>Collective Agreement</span>
          <input type="text" name="agreementText" value="${escapeHtml(jd.agreementText)}" />
        </label>
        <label>
          <span>Position Type</span>
          <select name="positionType">
            <option value="Full Time"${!isPartTime ? " selected" : ""}>Full Time</option>
            <option value="Part-time"${isPartTime ? " selected" : ""}>Part-time</option>
          </select>
        </label>
        <label>
          <span>Date advertised</span>
          <span class="jd-editor__date-combo">
            <input type="text" name="dateAdvertised" value="${toDateInputValue(jd.dateAdvertised)}" placeholder="YYYY-MM-DD" inputmode="numeric" data-jd-date-text />
            <button type="button" class="jd-editor__date-button" data-jd-open-date-picker title="Choose date" aria-label="Choose date advertised"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="date" class="jd-editor__date-picker" value="${toDateInputValue(jd.dateAdvertised)}" data-jd-date-picker tabindex="-1" aria-hidden="true" />
          </span>
        </label>
        <label>
          <span>Level/Salary Range</span>
          <input type="text" name="salaryRangeText" value="${escapeHtml(jd.salaryRangeText)}" />
        </label>
        <label>
          <span>Closing Date</span>
          <span class="jd-editor__date-combo">
            <input type="text" name="closingAt" value="${toDateTimeInputValue(jd.closingAt)}" placeholder="YYYY-MM-DDTHH:mm" inputmode="numeric" data-jd-date-text />
            <button type="button" class="jd-editor__date-button" data-jd-open-date-picker title="Choose closing date and time" aria-label="Choose closing date and time"><i class="bi bi-calendar3 ui-icon" aria-hidden="true"></i></button>
            <input type="datetime-local" class="jd-editor__date-picker" value="${toDateTimeInputValue(jd.closingAt)}" data-jd-date-picker tabindex="-1" aria-hidden="true" />
          </span>
        </label>
        <label>
          <span>Senior Teacher</span>
          <input type="text" name="seniorTeacherName" value="${escapeHtml(jd.seniorTeacherName)}" />
        </label>
        <label>
          <span>Start Date</span>
          <input type="text" name="startDateText" value="${escapeHtml(jd.startDateText)}" />
        </label>
      </div>

      <label class="jd-editor__block">
        <span>Qualifications</span>
        <textarea name="qualificationsText">${escapeHtml(jd.qualificationsText)}</textarea>
      </label>

      <label class="jd-editor__block">
        <span>Job Description intro paragraph</span>
        <textarea name="introParagraph">${escapeHtml(jd.introParagraph)}</textarea>
      </label>

      <div class="jd-editor__roles">
        <h3>Role &amp; Responsibilities</h3>
        ${renderRoleSections(jd)}
        <button type="button" class="jd-editor__inline-button" data-jd-add-role-section><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add section</span></button>
      </div>

      <div class="jd-editor__field-grid jd-editor__footer-fields">
        <label>
          <span>Reviewed By</span>
          <input type="text" name="reviewedByAcronym" value="${escapeHtml(jd.reviewedByAcronym)}" />
        </label>
        <label>
          <span>Approved By</span>
          <input type="text" name="approvedByAcronym" value="${escapeHtml(jd.approvedByAcronym)}" />
        </label>
        <label>
          <span>Last Updated By</span>
          <input type="text" name="lastUpdatedByAcronym" value="${escapeHtml(jd.lastUpdatedByAcronym)}" />
        </label>
      </div>

      <div class="jd-editor__actions">
        <button type="button" class="jd-editor__pdf" data-jd-action="pdf" data-jd-id="${jd.id}"><i class="bi bi-file-earmark-pdf ui-icon" aria-hidden="true"></i><span>Download PDF</span></button>
        <button type="submit" class="jd-editor__save"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      </div>
    </form>
  `;
}
