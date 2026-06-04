import type { PostmarkDashboardData } from "../../storage/postmark-store.js";

export type CentreActivitySortOrder = "centre" | "last-sent";

type PostmarkPanelOptions = {
  dashboardData?: PostmarkDashboardData | null;
  centreActivitySort?: CentreActivitySortOrder;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" });
}

function renderWebhookCheck(data: PostmarkDashboardData) {
  const check = data.webhookCheck;
  if (!check) return "";

  const label = check.status === "ok"
    ? "Webhook current"
    : check.status === "stale"
      ? "Webhook quiet"
      : check.status === "gap"
        ? "Webhook gap"
        : "No webhook events";

  return `
      <section class="comms-section comms-webhook-check comms-webhook-check--${check.status}">
        <header class="comms-section__header"><h3>Webhook check</h3><span>${escapeHtml(label)}</span></header>
        <p class="comms-panel__meta">${escapeHtml(check.message)}</p>
        <div class="comms-summary comms-summary--four">
          <div class="comms-summary__item"><span>Checked</span><strong>${escapeHtml(formatDate(check.checkedAt))}</strong></div>
          <div class="comms-summary__item"><span>Last received</span><strong>${check.latestReceivedAt ? escapeHtml(formatDate(check.latestReceivedAt)) : "-"}</strong></div>
          <div class="comms-summary__item"><span>Last 24h</span><strong>${check.eventsLast24h}</strong></div>
          <div class="comms-summary__item"><span>Last 48h</span><strong>${check.eventsLast48h}</strong></div>
        </div>
      </section>
  `;
}

function rate(part: number, total: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "-";
}

function statusBadge(label: string, active: boolean, className: string) {
  return active ? `<span class="comms-status-badge comms-status-badge--${className}">${label}</span>` : "";
}

function categoryBadge(category: "centre" | "office-staff") {
  const label = category === "centre" ? "Centre" : "Office staff";
  return `<span class="comms-category-badge comms-category-badge--${category}">${label}</span>`;
}

function messageCountLabel(data: PostmarkDashboardData) {
  const count = data.relevantMessageCount ?? data.recentMessages.length;
  const page = data.messagePage ?? 1;
  const pageSize = data.messagePageSize ?? 10;
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(count, page * pageSize);

  return count === 0 ? "No relevant messages" : `Showing ${first}-${last} of ${count} relevant messages`;
}

export function renderPostmarkMessageList(data: PostmarkDashboardData) {
  const page = data.messagePage ?? 1;
  const pageCount = data.messagePageCount ?? 1;
  const hasTags = data.recentMessages.some((message) => message.tag != null && message.tag.trim().length > 0);

  return `
      <section class="comms-section">
        <header class="comms-section__header"><h3>Recent messages</h3><span>${messageCountLabel(data)}</span></header>
        <p class="comms-panel__meta">Centre messages and internal office staff messages are shown. External test activity is excluded from this list.</p>
        <div class="comms-table-wrap">
          <table class="comms-table">
            <thead><tr><th>Status</th><th>Category</th><th>Recipient</th><th>${hasTags ? "Centre / Tag" : "Centre"}</th><th>Date &amp; Time</th></tr></thead>
            <tbody>${
              data.recentMessages.length === 0
                ? `<tr><td class="comms-table__empty" colspan="5">No centre or office staff Postmark webhook messages have been received.</td></tr>`
                : data.recentMessages.map((message) => `
                  <tr>
                    <td><div class="comms-status-badges">${statusBadge("Delivered", message.delivered, "delivered")}${statusBadge("Opened", message.opened, "opened")}${statusBadge("Clicked", message.clicked, "clicked")}${statusBadge("Bounced", message.bounced, "bounced")}</div></td>
                    <td>${categoryBadge(message.category)}</td>
                    <td>${escapeHtml(message.recipient ?? "-")}</td>
                    <td><strong>${escapeHtml(message.centreName ?? "Office staff")}</strong>${hasTags && message.tag ? `<span>${escapeHtml(message.tag)}</span>` : ""}</td>
                    <td>${escapeHtml(formatDate(message.latestOccurredAt))}</td>
                  </tr>
                `).join("")
            }</tbody>
          </table>
        </div>
        ${
          pageCount > 1
            ? `<nav class="comms-pagination" aria-label="Webmail message pages">
                <button type="button" data-postmark-page="${page - 1}"${page <= 1 ? " disabled" : ""}>Previous</button>
                <span>Page ${page} of ${pageCount}</span>
                <button type="button" data-postmark-page="${page + 1}"${page >= pageCount ? " disabled" : ""}>Next</button>
              </nav>`
            : ""
        }
      </section>
  `;
}

function sortCentreActivity(activity: PostmarkDashboardData["centreActivity"], sort: CentreActivitySortOrder) {
  const rows = [...activity];
  if (sort === "last-sent") {
    rows.sort((a, b) => {
      if (a.lastSentAt && b.lastSentAt) return b.lastSentAt.localeCompare(a.lastSentAt);
      if (a.lastSentAt) return -1;
      if (b.lastSentAt) return 1;
      return a.centreName.localeCompare(b.centreName);
    });
  } else {
    rows.sort((a, b) => a.centreName.localeCompare(b.centreName));
  }
  return rows;
}

export function renderPostmarkPanel(options: PostmarkPanelOptions = {}) {
  const centreActivitySort: CentreActivitySortOrder = options.centreActivitySort ?? "centre";
  const data = options.dashboardData ?? {
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    latestReceivedAt: null,
    recentMessages: [],
    relevantMessageCount: 0,
      centreMessageCount: 0,
      officeStaffMessageCount: 0,
      messagePage: 1,
      messagePageSize: 10,
      messagePageCount: 1,
      centreActivity: [],
    };
  const sortedCentreActivity = sortCentreActivity(data.centreActivity, centreActivitySort);

  return `
    <div class="comms-mailchimp-panel comms-webmail-panel">
      ${renderWebhookCheck(data)}
      <div class="comms-summary comms-summary--four">
        <div class="comms-summary__item"><span>Delivered</span><strong>${data.delivered}</strong></div>
        <div class="comms-summary__item"><span>Opened</span><strong>${data.opened}</strong></div>
        <div class="comms-summary__item"><span>Open rate</span><strong>${rate(data.opened, data.delivered)}</strong></div>
        <div class="comms-summary__item"><span>Centre</span><strong>${data.centreMessageCount ?? 0}</strong></div>
        <div class="comms-summary__item"><span>Office</span><strong>${data.officeStaffMessageCount ?? 0}</strong></div>
      </div>
      <div data-postmark-message-list>${renderPostmarkMessageList(data)}</div>
      <section class="comms-section">
        <header class="comms-section__header">
          <h3>Email Count by Service</h3>
          <span>${data.centreActivity.length} centres</span>
          <label class="comms-sort-control">Sort by
            <select data-centre-activity-sort>
              <option value="centre"${centreActivitySort === "centre" ? " selected" : ""}>Centre</option>
              <option value="last-sent"${centreActivitySort === "last-sent" ? " selected" : ""}>Last Sent</option>
            </select>
          </label>
        </header>
        <div class="comms-table-wrap">
          <table class="comms-table">
            <thead><tr><th>Centre</th><th class="comms-table__numeric">Delivered</th><th class="comms-table__numeric">Opened</th><th class="comms-table__numeric">Bounced</th><th>Last Sent</th></tr></thead>
            <tbody>${
              data.centreActivity.length === 0
                ? `<tr><td class="comms-table__empty" colspan="5">No webhook events are matched to a centre tag yet.</td></tr>`
                : sortedCentreActivity.map((centre) => `
                  <tr>
                    <td>${escapeHtml(centre.centreName)}</td>
                    <td class="comms-table__numeric">${centre.delivered}</td>
                    <td class="comms-table__numeric">${centre.opened}</td>
                    <td class="comms-table__numeric">${centre.bounced}</td>
                    <td>${centre.lastSentAt ? escapeHtml(formatDate(centre.lastSentAt)) : "-"}</td>
                  </tr>
                `).join("")
            }</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}
