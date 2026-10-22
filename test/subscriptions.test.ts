import assert from "node:assert/strict";
import test from "node:test";

import type { SubscriptionView } from "../src/storage/subscription-store.js";
import { renderSubscriptionsAppShell } from "../src/ui/subscriptions-app-shell.js";
import { renderLandingPage } from "../src/ui/landing-page.js";

const SUBSCRIPTION: SubscriptionView = {
  id: 4,
  title: "Canva Pro",
  category: "Design",
  url: "https://www.canva.com/settings/billing",
  description: "Team plan, renews March",
  lastUsedAt: null,
  updatedAt: "2026-10-16T00:00:00.000Z",
};

test("subscriptions page lists links that open in a new tab, full width with no chat", () => {
  const html = renderSubscriptionsAppShell({
    list: { subscriptions: [SUBSCRIPTION], categories: [{ id: 1, name: "Design", isProtected: false, subscriptionCount: 1 }] },
    editor: { subscription: null, categories: ["General", "Design"] },
  });
  assert.match(html, /href="https:\/\/www\.canva\.com\/settings\/billing" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /canva\.com<\/span>/);
  assert.match(html, /Team plan, renews March/);
  assert.match(html, /app-shell--focus/);
  assert.doesNotMatch(html, /data-ai-chat|panel--chat/);
  assert.match(html, /nav-rail__item--current" href="\/subscriptions"/);
  assert.match(html, /<h2 class="wiki-modal__title[^"]*">Add a link<\/h2>/);
});

test("subscription categories are an accordion with only the latest used one open", () => {
  const html = renderSubscriptionsAppShell({
    list: {
      subscriptions: [
        SUBSCRIPTION,
        { ...SUBSCRIPTION, id: 5, title: "Mailchimp", category: "Panui Tools", lastUsedAt: "2026-10-20T01:00:00.000Z" },
        { ...SUBSCRIPTION, id: 6, title: "Google Ads", category: "Paid Subscriptions", updatedAt: "2026-10-19T00:00:00.000Z" },
      ],
      categories: [
        { id: 1, name: "Design", isProtected: false, subscriptionCount: 1 },
        { id: 2, name: "Panui Tools", isProtected: false, subscriptionCount: 1 },
        { id: 3, name: "Paid Subscriptions", isProtected: false, subscriptionCount: 1 },
      ],
    },
    editor: { subscription: null, categories: ["General"] },
  });
  const groups = html.match(/<details class="wiki-list__group[^>]*>\s*<summary[^>]*>[^<]*/g) ?? [];
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.filter((group) => / open>/.test(group)).map((group) => group.replace(/[\s\S]*>/, "").trim()),
    ["Panui Tools"],
  );
  assert.ok(groups.every((group) => /name="subscription-groups"/.test(group)));
});

test("subscriptions page shows the editor when one is open", () => {
  const html = renderSubscriptionsAppShell({
    list: { subscriptions: [SUBSCRIPTION], categories: [] },
    editor: { subscription: SUBSCRIPTION, categories: ["General", "Design"] },
  });
  assert.match(html, /data-subscription-editor data-subscription-id="4"/);
  assert.match(html, /name="url" maxlength="2000" value="https:\/\/www\.canva\.com\/settings\/billing"/);
  assert.match(html, /href="\/subscriptions" data-subscription-done-editing/);
  assert.doesNotMatch(html, /data-subscription-list/);
});

test("landing page has a Links tile after Code Snippets and no Panui Tools tile", () => {
  const html = renderLandingPage();
  const snippets = html.indexOf('href="/snippets"');
  const subscriptions = html.indexOf('href="/subscriptions"');
  assert.ok(snippets > -1 && subscriptions > snippets);
  assert.doesNotMatch(html, /href="\/panui"/);
  assert.match(html, /<span>Links<\/span>/);
});
