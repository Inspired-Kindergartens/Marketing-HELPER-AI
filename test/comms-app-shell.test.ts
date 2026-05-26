import assert from "node:assert/strict";
import test from "node:test";

import { renderCommsAppShell } from "../src/ui/comms-app-shell.js";

test("comms shell renders without throwing for empty options", () => {
  const html = renderCommsAppShell();

  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.match(html, /<title>Marketing Helper - Online Communications<\/title>/);
});

test("comms shell renders the four data panels and a chat panel", () => {
  const html = renderCommsAppShell();

  assert.match(html, /id="panel-comms-postmark"/);
  assert.match(html, /id="panel-comms-mailchimp"/);
  assert.match(html, /id="panel-comms-formstack"/);
  assert.match(html, /id="panel-comms-funnel"/);
  assert.match(html, /id="panel-chat"/);
});

test("comms shell renders dashboard panels as an accordion stack", () => {
  const html = renderCommsAppShell();

  assert.match(html, /data-panel-accordion/);
  assert.match(html, /panel--comms-postmark panel--accordion panel--accordion-active/);
  assert.match(html, /panel--comms-mailchimp panel--accordion/);
  assert.match(html, /panel--comms-formstack panel--accordion/);
  assert.match(html, /panel--comms-funnel panel--accordion/);
  assert.match(html, /activatePanel\(accordion, panel\)/);
});

test("comms shell exposes an AI chat panel with the comms endpoint attribute", () => {
  const html = renderCommsAppShell();

  assert.match(html, /data-ai-chat-endpoint="\/api\/comms\/ai\/chat\/stream"/);
});

test("comms shell nav rail links back to landing and across to Online Marketing", () => {
  const html = renderCommsAppShell();

  assert.match(html, /href="\/"[^>]*aria-label="Back to landing"/);
  assert.match(html, /href="\/app"[^>]*aria-label="Online Marketing dashboard"/);
  assert.match(html, /href="\/comms"[^>]*aria-current="page"/);
});

test("comms shell preserves the demo flag in nav links", () => {
  const html = renderCommsAppShell({ demo: true });

  assert.match(html, /<body class="app-shell-body" data-demo="1">/);
  assert.match(html, /href="\/app\?demo=1"[^>]*aria-label="Online Marketing dashboard"/);
  assert.match(html, /href="\/comms\?demo=1"[^>]*aria-current="page"/);
  assert.match(html, /href="\/comms"[^>]*aria-label="Exit demo mode"/);
});

test("comms shell falls back to the full layout for an unknown focus panel id", () => {
  const html = renderCommsAppShell({ focusPanelId: "not-a-panel" });

  assert.match(html, /id="panel-comms-postmark"/);
  assert.match(html, /id="panel-comms-mailchimp"/);
  assert.match(html, /id="panel-comms-formstack"/);
  assert.match(html, /id="panel-comms-funnel"/);
});

test("comms shell focus mode renders only the focused panel", () => {
  const html = renderCommsAppShell({ focusPanelId: "comms-postmark" });

  assert.match(html, /id="panel-comms-postmark"/);
  assert.doesNotMatch(html, /id="panel-comms-mailchimp"/);
  assert.doesNotMatch(html, /id="panel-comms-formstack"/);
  assert.doesNotMatch(html, /id="panel-comms-funnel"/);
  assert.doesNotMatch(html, /id="panel-chat"/);
});
