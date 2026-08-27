import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("snapshot stores append new records instead of overwriting historical pulls", () => {
  const analytics = source("../src/storage/analytics-store.ts");
  const googleAnalytics = source("../src/storage/google-analytics-store.ts");
  const mailchimp = source("../src/storage/mailchimp-store.ts");

  assert.doesNotMatch(analytics, /analyticsSnapshotRun\.upsert/);
  assert.doesNotMatch(analytics, /serviceAnalyticsSnapshot\.deleteMany/);
  assert.match(analytics, /analyticsSnapshotRun\.create/);

  assert.doesNotMatch(googleAnalytics, /googleAnalyticsDailySnapshot\.upsert/);
  assert.doesNotMatch(googleAnalytics, /googleAnalyticsPageSnapshot\.deleteMany/);
  assert.match(googleAnalytics, /googleAnalyticsDailySnapshot\.create/);

  assert.doesNotMatch(mailchimp, /mailchimpCampaignReport\.upsert/);
  assert.doesNotMatch(mailchimp, /mailchimpListGrowthSnapshot\.upsert/);
  assert.match(mailchimp, /mailchimpCampaignReport\.create/);
  assert.match(mailchimp, /mailchimpListGrowthSnapshot\.create/);
});

test("external provider clients append raw response payload captures", () => {
  for (const file of [
    "../src/infocare/client.ts",
    "../src/meta/client.ts",
    "../src/google-analytics/client.ts",
    "../src/mailchimp/client.ts",
    "../src/formstack/client.ts",
    "../src/postmark/webhook.ts",
  ]) {
    assert.match(source(file), /appendExternalApiCapture/);
  }

  const schema = source("../prisma/schema.prisma");
  assert.match(schema, /model ExternalApiCapture/);
});

test("Infocare client remains allowlisted and blocks write-like modes", () => {
  const infocareClient = source("../src/infocare/client.ts");

  assert.match(infocareClient, /ALLOWED_INFOCARE_MODES[\s\S]*"get_child_list"/);
  assert.match(infocareClient, /ALLOWED_INFOCARE_MODES[\s\S]*"get_contact_list"/);
  assert.match(infocareClient, /BLOCKED_INFOCARE_MODE_PREFIXES[\s\S]*"create_"/);
  assert.match(infocareClient, /BLOCKED_INFOCARE_MODE_PREFIXES[\s\S]*"update_"/);
  assert.match(infocareClient, /BLOCKED_INFOCARE_MODE_PREFIXES[\s\S]*"delete_"/);
  assert.match(infocareClient, /validateInfocareMode\(mode\)/);
  assert.match(infocareClient, /isBlockedMode\(parsedMode\)/);
});

test("dashboard live Infocare chat reads API data without write endpoints", () => {
  const infocareLive = source("../src/ai/infocare-live.ts");
  const server = source("../src/server.ts");

  assert.match(infocareLive, /client\.request\("get_child_list"/);
  assert.match(infocareLive, /client\.request\("get_child"/);
  assert.match(infocareLive, /client\.request\("get_contact_list"/);
  assert.match(infocareLive, /client\.request\("get_license_list"/);
  assert.match(infocareLive, /client\.request\("get_centre_list"/);
  assert.doesNotMatch(infocareLive, /client\.request\("(create|update|delete|set)_/);
  assert.match(server, /\/api\/general-chat\/conversations\/:id\/stream[\s\S]*?isLiveInfocarePrompt\(prompt\)[\s\S]*?runLiveInfocareRequest/);
  assert.match(server, /isLiveInfocarePrompt\(prompt\)[\s\S]*?return;[\s\S]*?const messages = await buildGeneralChatMessages/);
});

test("capture failures are not acknowledged or suppressed", () => {
  const server = source("../src/server.ts");
  const mailchimpRefresh = source("../src/mailchimp/refresh.ts");

  assert.match(server, /postmark webhook: ingestion failed[\s\S]*?reply\.code\(503\)/);
  assert.match(mailchimpRefresh, /error instanceof MailchimpApiError/);
  assert.match(mailchimpRefresh, /error\.status !== 404/);
});

test("Postmark Webmail display reads stored webhook events without altering them", () => {
  const postmarkStore = source("../src/storage/postmark-store.ts");
  const postmarkPanel = source("../src/ui/comms/postmark-panel.ts");

  assert.match(postmarkStore, /postmarkMessageEvent\.findMany/);
  assert.doesNotMatch(postmarkStore, /\.(update|delete|upsert|create)\(/);
  assert.match(postmarkPanel, /Recent messages/);
  assert.match(postmarkPanel, /External test activity is excluded from this list/);
});

test("Postmark Recent messages RSS flags a seven-day quiet period", () => {
  const server = source("../src/server.ts");

  assert.match(server, /\/rss\/postmark-recent-messages/);
  assert.match(server, /application\/rss\+xml; charset=utf-8/);
  assert.match(server, /readPostmarkDashboardData\(\{ fromDate: weekStart \}\)/);
  assert.match(server, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(server, /ALERT: No emails have been sent from our website for \$\{daysSinceLatest\} days/);
  assert.match(server, /#b42318/);
});

test("Postmark CSV export imports historical events into retained message storage", () => {
  const importer = source("../src/postmark/csv-import.ts");

  assert.match(importer, /activity-csv-import/);
  assert.match(importer, /postmarkMessageEvent\.createMany/);
  assert.match(importer, /skipDuplicates:\s*true/);
});
