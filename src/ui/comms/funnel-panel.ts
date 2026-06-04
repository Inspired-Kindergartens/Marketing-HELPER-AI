import type { FormstackDashboardData } from "../../storage/formstack-store.js";
import type { PostmarkDashboardData } from "../../storage/postmark-store.js";

export type CommsFunnelRow = {
  centreKey: number;
  centreName: string;
  submissions: number;
  webmailDelivered: number;
  webmailOpened: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildCommsFunnelRows(
  formstack: FormstackDashboardData | null | undefined,
  postmark?: PostmarkDashboardData | null,
) {
  const rows = new Map<number, CommsFunnelRow>();

  for (const form of formstack?.forms ?? []) {
    if (form.centreKey == null || !form.centreName) continue;
    const row = rows.get(form.centreKey) ?? {
      centreKey: form.centreKey,
      centreName: form.centreName,
      submissions: 0,
      webmailDelivered: 0,
      webmailOpened: 0,
    };
    row.submissions += form.submissionCount;
    rows.set(row.centreKey, row);
  }

  for (const centre of postmark?.centreActivity ?? []) {
    const row = rows.get(centre.centreKey) ?? {
      centreKey: centre.centreKey,
      centreName: centre.centreName,
      submissions: 0,
      webmailDelivered: 0,
      webmailOpened: 0,
    };
    row.webmailDelivered += centre.delivered;
    row.webmailOpened += centre.opened;
    rows.set(row.centreKey, row);
  }

  return [...rows.values()].sort((left, right) =>
    right.submissions - left.submissions ||
    left.centreName.localeCompare(right.centreName),
  );
}

export function renderCommsFunnelPanel(
  formstack: FormstackDashboardData | null | undefined,
  postmark?: PostmarkDashboardData | null,
) {
  const rows = buildCommsFunnelRows(formstack, postmark);

  return `
    <div class="comms-mailchimp-panel comms-funnel-panel">
      <p class="comms-panel__meta">This is not a conversion funnel. It compares matched Online Forms submissions and Webmail events by centre; it does not track an individual person through those activities.</p>
      <section class="comms-section">
        <header class="comms-section__header"><h3>Centre activity alignment</h3><span>${rows.length} matched centres</span></header>
        <div class="comms-table-wrap">
          <table class="comms-table">
            <thead><tr><th>Centre</th><th class="comms-table__numeric">Form submissions</th><th class="comms-table__numeric">Webmail delivered</th><th class="comms-table__numeric">Webmail opens</th></tr></thead>
            <tbody>${
              rows.length === 0
                ? `<tr><td class="comms-table__empty" colspan="4">No matched Webmail or Online Forms centre data is available yet.</td></tr>`
                : rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.centreName)}</td>
                    <td class="comms-table__numeric">${row.submissions}</td>
                    <td class="comms-table__numeric">${row.webmailDelivered}</td>
                    <td class="comms-table__numeric">${row.webmailOpened}</td>
                  </tr>
                `).join("")
            }</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}
