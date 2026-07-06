import type { PostmarkDashboardData } from "../../storage/postmark-store.js";

export type CommsFunnelRow = {
  centreKey: number;
  centreName: string;
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
  postmark?: PostmarkDashboardData | null,
) {
  const rows = new Map<number, CommsFunnelRow>();

  for (const centre of postmark?.centreActivity ?? []) {
    const row = rows.get(centre.centreKey) ?? {
      centreKey: centre.centreKey,
      centreName: centre.centreName,
      webmailDelivered: 0,
      webmailOpened: 0,
    };
    row.webmailDelivered += centre.delivered;
    row.webmailOpened += centre.opened;
    rows.set(row.centreKey, row);
  }

  return [...rows.values()].sort((left, right) =>
    right.webmailDelivered - left.webmailDelivered ||
    right.webmailOpened - left.webmailOpened ||
    left.centreName.localeCompare(right.centreName),
  );
}

export function renderCommsFunnelPanel(
  postmark?: PostmarkDashboardData | null,
) {
  const rows = buildCommsFunnelRows(postmark);

  return `
    <div class="comms-mailchimp-panel comms-funnel-panel">
      <p class="comms-panel__meta">This compares matched Webmail events by centre; it does not track an individual person through those activities.</p>
      <section class="comms-section">
        <header class="comms-section__header"><h3>Centre activity alignment</h3><span>${rows.length} matched centres</span></header>
        <div class="comms-table-wrap">
          <table class="comms-table">
            <thead><tr><th>Centre</th><th class="comms-table__numeric">Webmail delivered</th><th class="comms-table__numeric">Webmail opens</th></tr></thead>
            <tbody>${
              rows.length === 0
                ? `<tr><td class="comms-table__empty" colspan="3">No matched Webmail centre data is available yet.</td></tr>`
                : rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.centreName)}</td>
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
