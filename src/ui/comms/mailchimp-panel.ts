import type { MailchimpConfigStatus } from "../../mailchimp/config.js";
import type {
  MailchimpCampaignView,
  MailchimpDashboardData,
  MailchimpListGrowthSnapshotView,
} from "../../storage/mailchimp-store.js";

type MailchimpPanelOptions = {
  dashboardData?: MailchimpDashboardData | null;
  configStatus?: MailchimpConfigStatus | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NZ").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(input: string | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-NZ", { dateStyle: "medium" });
}

function campaignMetrics(campaigns: MailchimpCampaignView[]) {
  return campaigns.reduce(
    (metrics, campaign) => {
      metrics.campaigns += 1;
      metrics.sent += campaign.emailsSent;
      metrics.uniqueOpens += campaign.report?.uniqueOpens ?? 0;
      metrics.uniqueClicks += campaign.report?.uniqueClicks ?? 0;
      metrics.unsubscribes += campaign.report?.unsubscribes ?? 0;
      return metrics;
    },
    { campaigns: 0, sent: 0, uniqueOpens: 0, uniqueClicks: 0, unsubscribes: 0 },
  );
}

function sortCampaignsLatestFirst(campaigns: MailchimpCampaignView[]) {
  return [...campaigns].sort((left, right) => {
    const leftSentAt = left.sendTime ? Date.parse(left.sendTime) : Number.NEGATIVE_INFINITY;
    const rightSentAt = right.sendTime ? Date.parse(right.sendTime) : Number.NEGATIVE_INFINITY;

    if (leftSentAt !== rightSentAt) {
      return rightSentAt - leftSentAt;
    }

    return Date.parse(right.pulledAt) - Date.parse(left.pulledAt);
  });
}

function renderCampaignRows(campaigns: MailchimpCampaignView[]) {
  if (campaigns.length === 0) {
    return `<tr><td class="comms-table__empty" colspan="7">No Panui campaigns have been imported from Mailchimp.</td></tr>`;
  }

  return sortCampaignsLatestFirst(campaigns).slice(0, 20).map((campaign) => {
    const report = campaign.report;
    const campaignLabel = escapeHtml(campaign.subject || "Untitled campaign");
    const campaignTitle = campaign.archiveUrl
      ? `<a class="comms-campaign-link" href="${escapeHtml(campaign.archiveUrl)}" target="_blank" rel="noopener noreferrer">${campaignLabel}</a>`
      : `<strong>${campaignLabel}</strong>`;

    return `
      <tr>
        <td>${campaignTitle}</td>
        <td>${escapeHtml(campaign.status ?? "-")}</td>
        <td>${escapeHtml(formatDate(campaign.sendTime))}</td>
        <td class="comms-table__numeric">${formatNumber(campaign.emailsSent)}</td>
        <td class="comms-table__numeric">${report ? formatPercent(report.openRate) : "-"}</td>
        <td class="comms-table__numeric">${report ? formatPercent(report.clickRate) : "-"}</td>
        <td class="comms-table__numeric">${report ? formatNumber(report.unsubscribes) : "-"}</td>
      </tr>
    `;
  }).join("");
}

function latestGrowthByList(rows: MailchimpListGrowthSnapshotView[]) {
  const latestPulledAt = rows.reduce(
    (latest, row) => Math.max(latest, Date.parse(row.pulledAt)),
    Number.NEGATIVE_INFINITY,
  );
  const latestByList = new Map<string, MailchimpListGrowthSnapshotView>();

  for (const row of rows) {
    if (Date.parse(row.pulledAt) !== latestPulledAt) continue;
    const existing = latestByList.get(row.listId);
    if (!existing || row.snapshotDate > existing.snapshotDate) {
      latestByList.set(row.listId, row);
    }
  }

  return [...latestByList.values()].sort((a, b) => a.listId.localeCompare(b.listId));
}

function renderGrowthRows(rows: MailchimpListGrowthSnapshotView[]) {
  const latestRows = latestGrowthByList(rows);

  if (latestRows.length === 0) {
    return `<tr><td class="comms-table__empty" colspan="5">No audience snapshots have been imported.</td></tr>`;
  }

  return latestRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.listName)}</td>
      <td>${escapeHtml(formatDate(row.snapshotDate))}</td>
      <td class="comms-table__numeric">${formatNumber(row.memberCount)}</td>
      <td class="comms-table__numeric">${formatNumber(row.unsubscribed)}</td>
      <td class="comms-table__numeric">${formatNumber(row.cleaned)}</td>
    </tr>
  `).join("");
}

function renderConfigState(configStatus: MailchimpConfigStatus | null | undefined) {
  if (!configStatus || configStatus.isConfigured) {
    return "";
  }

  return `
    <div class="comms-config-state" role="status">
      <strong>Panui source is not configured.</strong>
      <span>Set ${escapeHtml(configStatus.missingKeys.join(" and "))} in <code>.env</code> to import Mailchimp data.</span>
    </div>
  `;
}

export function renderMailchimpPanel(options: MailchimpPanelOptions = {}) {
  const dashboardData = options.dashboardData ?? { campaigns: [], listGrowth: [], latestPulledAt: null };
  const metrics = campaignMetrics(dashboardData.campaigns);
  const openRate = metrics.sent > 0 ? metrics.uniqueOpens / metrics.sent : 0;
  const clickRate = metrics.sent > 0 ? metrics.uniqueClicks / metrics.sent : 0;
  const unsubscribeRate = metrics.sent > 0 ? metrics.unsubscribes / metrics.sent : 0;

  return `
    <div class="comms-mailchimp-panel">
      ${renderConfigState(options.configStatus)}
      <div class="comms-summary">
        <div class="comms-summary__item"><span>Campaigns</span><strong>${formatNumber(metrics.campaigns)}</strong></div>
        <div class="comms-summary__item"><span>Emails sent</span><strong>${formatNumber(metrics.sent)}</strong></div>
        <div class="comms-summary__item"><span>Open rate</span><strong>${formatPercent(openRate)}</strong></div>
        <div class="comms-summary__item"><span>Click rate</span><strong>${formatPercent(clickRate)}</strong></div>
        <div class="comms-summary__item"><span>Unsubscribe rate</span><strong>${formatPercent(unsubscribeRate)}</strong></div>
      </div>
      <section class="comms-section">
        <header class="comms-section__header"><h3>Recent campaigns</h3><span>Latest to oldest - ${metrics.campaigns} imported</span></header>
        <div class="comms-table-wrap">
          <table class="comms-table">
            <thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th class="comms-table__numeric">Recipients</th><th class="comms-table__numeric">Open rate</th><th class="comms-table__numeric">CTR</th><th class="comms-table__numeric">Unsubs</th></tr></thead>
            <tbody>${renderCampaignRows(dashboardData.campaigns)}</tbody>
          </table>
        </div>
      </section>
      <section class="comms-section">
        <header class="comms-section__header"><h3>Audience snapshots</h3><span>${latestGrowthByList(dashboardData.listGrowth).length} lists</span></header>
        <div class="comms-table-wrap">
          <table class="comms-table comms-table--growth">
            <thead><tr><th>Audience</th><th>Snapshot</th><th class="comms-table__numeric">Members</th><th class="comms-table__numeric">Unsubscribed</th><th class="comms-table__numeric">Cleaned</th></tr></thead>
            <tbody>${renderGrowthRows(dashboardData.listGrowth)}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}
