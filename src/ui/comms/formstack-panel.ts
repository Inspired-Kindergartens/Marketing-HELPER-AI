import type { FormstackConfigStatus } from "../../formstack/config.js";
import type { FormstackDashboardData } from "../../storage/formstack-store.js";

type FormstackPanelOptions = {
  dashboardData?: FormstackDashboardData | null;
  configStatus?: FormstackConfigStatus | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-NZ", { dateStyle: "medium" });
}

function payloadPreview(value: unknown) {
  const text = JSON.stringify(value ?? {});
  return text.length > 110 ? `${text.slice(0, 107)}...` : text;
}

function renderCentreName(centreName: string | null) {
  return centreName ? `<span>${escapeHtml(centreName)}</span>` : "";
}

function renderFormName(form: { name: string; formUrl: string | null }) {
  const label = escapeHtml(form.name);
  return form.formUrl
    ? `<a class="comms-campaign-link text-accent" href="${escapeHtml(form.formUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : `<strong>${label}</strong>`;
}

function renderConfigState(status: FormstackConfigStatus | null | undefined) {
  if (!status || status.isConfigured) return "";

  return `
    <div class="comms-config-state flex flex-wrap card card--inset" role="status">
      <strong>Online Forms source is not configured.</strong>
      <span>Set ${escapeHtml(status.missingKeys.join(" and "))} in <code>.env</code> to import Formstack data.</span>
    </div>
  `;
}

export function renderFormstackPanel(options: FormstackPanelOptions = {}) {
  const data = options.dashboardData ?? {
    forms: [],
    latestSubmissions: [],
    totalStoredSubmissions: 0,
    latestPulledAt: null,
  };
  const matchedForms = data.forms.filter((form) => form.centreKey != null).length;

  return `
    <div class="comms-mailchimp-panel grid gap-10 text-small comms-formstack-panel">
      ${renderConfigState(options.configStatus)}
      <div class="comms-summary grid gap-8 comms-summary--three">
        <div class="comms-summary__item card stat-tile"><span>Forms</span><strong>${data.forms.length}</strong></div>
        <div class="comms-summary__item card stat-tile"><span>Submissions stored</span><strong>${data.totalStoredSubmissions}</strong></div>
        <div class="comms-summary__item card stat-tile"><span>Matched forms</span><strong>${matchedForms}</strong></div>
      </div>
      <section class="comms-section grid gap-8 card">
        <header class="comms-section__header section-header"><h3 class="section-title">Forms</h3><span>Latest activity first</span></header>
        <div class="comms-table-wrap table-frame table-frame--scroll">
          <table class="comms-table data-table">
            <thead><tr><th>Form / Centre</th><th class="comms-table__numeric data-table__numeric">Submissions</th><th>Latest</th></tr></thead>
            <tbody>${
              data.forms.length === 0
                ? `<tr><td class="comms-table__empty" colspan="3">No online forms have been imported from Formstack.</td></tr>`
                : data.forms.map((form) => `
                  <tr>
                    <td>${renderFormName(form)}${renderCentreName(form.centreName)}</td>
                    <td class="comms-table__numeric data-table__numeric">${form.submissionCount}</td>
                    <td>${escapeHtml(formatDate(form.lastSubmissionAt))}</td>
                  </tr>
                `).join("")
            }</tbody>
          </table>
        </div>
      </section>
      <section class="comms-section grid gap-8 card">
        <header class="comms-section__header section-header"><h3 class="section-title">Latest submissions</h3><span>Most recent 20 stored</span></header>
        <div class="comms-table-wrap table-frame table-frame--scroll">
          <table class="comms-table data-table">
            <thead><tr><th>Submitted</th><th>Form / Centre</th><th>Payload preview</th></tr></thead>
            <tbody>${
              data.latestSubmissions.length === 0
                ? `<tr><td class="comms-table__empty" colspan="3">No online form submissions have been imported from Formstack.</td></tr>`
                : data.latestSubmissions.map((submission) => `
                  <tr>
                    <td>${escapeHtml(formatDate(submission.submittedAt))}</td>
                    <td><strong>${escapeHtml(submission.formName)}</strong>${renderCentreName(submission.centreName)}</td>
                    <td class="comms-table__payload text-ghost">${escapeHtml(payloadPreview(submission.payload))}</td>
                  </tr>
                `).join("")
            }</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}
