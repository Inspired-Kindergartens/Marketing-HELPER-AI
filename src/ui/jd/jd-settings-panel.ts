import type { JdCentreProfileView, JdTitleProfileView, JdKnowledgeDocView } from "../../storage/jd-store.js";
import type { AgreementStatus, JdGlobalSettingsView } from "../../storage/jd-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type JdSettingsPanelOptions = {
  centreProfiles: JdCentreProfileView[];
  titleProfiles: JdTitleProfileView[];
  knowledgeDocs: JdKnowledgeDocView[];
  agreementStatus: AgreementStatus;
  globalSettings: JdGlobalSettingsView;
};

function renderCentreProfileRow(centre: JdCentreProfileView): string {
  return `
    <form class="jd-settings__centre-row" data-jd-centre-profile data-centre-key="${centre.centreKey}">
      <span class="jd-settings__centre-name">${escapeHtml(centre.centreName)}</span>
      <label>
        <span>Location display</span>
        <input type="text" name="locationDisplay" value="${escapeHtml(centre.locationDisplay)}" />
      </label>
      <label>
        <span>Intro paragraph</span>
        <textarea name="introParagraph">${escapeHtml(centre.introParagraph)}</textarea>
      </label>
      <label>
        <span>Senior Teacher name</span>
        <input type="text" name="seniorTeacherName" value="${escapeHtml(centre.seniorTeacherName)}" />
      </label>
      <label>
        <span>Senior Teacher acronym</span>
        <input type="text" name="seniorTeacherAcronym" value="${escapeHtml(centre.seniorTeacherAcronym)}" />
      </label>
      <label class="jd-settings__checkbox-label">
        <input type="checkbox" name="isEnviroschool" ${centre.isEnviroschool ? "checked" : ""} />
        <span>Registered Enviroschool</span>
      </label>
      <button type="submit"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
    </form>
  `;
}

function renderTitleProfileRow(profile: JdTitleProfileView): string {
  return `
    <details class="jd-settings__title-row">
      <summary>${escapeHtml(profile.jobTitle)} <span class="jd-settings__title-meta">${escapeHtml(profile.jobCategory)} · ${escapeHtml(profile.layoutVariant)}</span></summary>
      <form data-jd-title-profile>
        <input type="hidden" name="jobTitle" value="${escapeHtml(profile.jobTitle)}" />
        <label>
          <span>Qualifications text</span>
          <textarea name="qualificationsText">${escapeHtml(profile.qualificationsText)}</textarea>
        </label>
        <label class="jd-settings__checkbox-label">
          <input type="checkbox" name="isCentreSpecific" ${profile.isCentreSpecific ? "checked" : ""} />
          <span>Centre specific</span>
        </label>
        <p class="jd-settings__hint">Role sections are edited per job description in the JD Editor panel; this text seeds new job descriptions of this title. Untick <strong>Centre specific</strong> for org-wide roles (e.g. office staff) that are not based at a kindergarten - those skip the Location step.</p>
        <button type="submit"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      </form>
    </details>
  `;
}

function renderKnowledgeDocRow(doc: JdKnowledgeDocView, centreName: string | null): string {
  const label = doc.kind === "generic" ? "IK generic text" : `${centreName ?? ""} — ${doc.label}`;
  return `
    <details class="jd-settings__doc-row">
      <summary>${escapeHtml(label)}</summary>
      <form data-jd-knowledge-doc>
        <input type="hidden" name="id" value="${doc.id}" />
        <input type="hidden" name="kind" value="${doc.kind}" />
        ${doc.centreKey != null ? `<input type="hidden" name="centreKey" value="${doc.centreKey}" />` : ""}
        <input type="hidden" name="label" value="${escapeHtml(doc.label)}" />
        <label>
          <span>Content (HTML)</span>
          <textarea name="contentHtml" rows="8">${escapeHtml(doc.contentHtml)}</textarea>
        </label>
        <button type="submit"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      </form>
    </details>
  `;
}

export function renderJdSettingsPanel(options: JdSettingsPanelOptions): string {
  const centreRows = options.centreProfiles.map(renderCentreProfileRow).join("");
  const titleRows = options.titleProfiles.map(renderTitleProfileRow).join("");
  const centreNameByKey = new Map(options.centreProfiles.map((centre) => [centre.centreKey, centre.centreName]));
  const docRows = options.knowledgeDocs
    .map((doc) => renderKnowledgeDocRow(doc, doc.centreKey != null ? (centreNameByKey.get(doc.centreKey) ?? null) : null))
    .join("");

  const agreement = options.agreementStatus;
  const agreementBanner = agreement.latest
    ? `
      <div class="jd-settings__agreement-status${agreement.expired ? " jd-settings__agreement-status--expired" : agreement.expiringSoon ? " jd-settings__agreement-status--warning" : ""}">
        <span>${escapeHtml(agreement.latest.name)} — expires ${escapeHtml(formatDate(agreement.latest.expiresOn))}</span>
        ${agreement.expired ? "<strong>Expired — import a new agreement.</strong>" : agreement.expiringSoon ? `<strong>Expires in ${agreement.daysUntilExpiry} days.</strong>` : ""}
      </div>
    `
    : `<div class="jd-settings__agreement-status jd-settings__agreement-status--warning"><span>No KTCA agreement imported yet.</span></div>`;

  return `
    <div class="jd-settings">
      <section class="jd-settings__section">
        <h3>Kindergarten profiles</h3>
        <div class="jd-settings__centre-list">${centreRows}</div>
      </section>

      <section class="jd-settings__section">
        <h3>Document defaults</h3>
        <form class="jd-settings__global" data-jd-global-settings>
          <label>
            <span>Last Reviewed by</span>
            <input type="text" name="lastReviewedByAcronym" value="${escapeHtml(options.globalSettings.lastReviewedByAcronym)}" placeholder="e.g. VVR" />
          </label>
          <p class="jd-settings__hint">Acronym printed in the <strong>Last Updated By</strong> row of every job description PDF footer.</p>
          <button type="submit"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
        </form>
      </section>

      <section class="jd-settings__section">
        <h3>Job title profiles</h3>
        <div class="jd-settings__title-list">${titleRows}</div>
        <form class="jd-settings__title-create" data-jd-title-create>
          <label>
            <span>New job title</span>
            <input type="text" name="jobTitle" placeholder="e.g. Senior Teacher" required />
          </label>
          <label>
            <span>Job category</span>
            <input type="text" name="jobCategory" placeholder="e.g. Education" required />
          </label>
          <label class="jd-settings__checkbox-label">
            <input type="checkbox" name="isCentreSpecific" checked />
            <span>Centre specific</span>
          </label>
          <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add job type</span></button>
        </form>
        <p data-jd-title-create-status class="jd-settings__ktca-status"></p>
      </section>

      <section class="jd-settings__section">
        <h3>Blurb knowledge base</h3>
        <div class="jd-settings__doc-list">${docRows}</div>
      </section>

      <section class="jd-settings__section">
        <h3>KTCA pay agreement</h3>
        ${agreementBanner}
        <form class="jd-settings__ktca-import" data-jd-ktca-import enctype="multipart/form-data">
          <input type="file" name="agreement" accept=".pdf" required />
          <button type="submit"><i class="bi bi-upload ui-icon" aria-hidden="true"></i><span>Import new KTCA</span></button>
        </form>
        <p data-ktca-import-status class="jd-settings__ktca-status"></p>
      </section>
    </div>
  `;
}
