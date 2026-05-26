import { renderLayout } from "./layout.js";

const PANEL_DEFINITIONS = [
  { id: "comms-postmark", title: "Postmark", className: "panel--comms-postmark" },
  { id: "comms-mailchimp", title: "Mailchimp", className: "panel--comms-mailchimp" },
  { id: "comms-formstack", title: "Formstack", className: "panel--comms-formstack" },
  { id: "comms-funnel", title: "Funnel", className: "panel--comms-funnel" },
  { id: "chat", title: "AI Chat with Beep Beep", className: "panel--chat" },
] as const;

const VALID_COMMS_PANEL_IDS = new Set<string>(PANEL_DEFINITIONS.map((panel) => panel.id));

export type CommsAppShellOptions = {
  focusPanelId?: string | null;
  demo?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveCommsFocusPanelId(input?: string | null) {
  if (input && VALID_COMMS_PANEL_IDS.has(input)) {
    return input;
  }

  return null;
}

function renderPlaceholderPanel(title: string, blurb: string) {
  return `
    <div class="comms-placeholder">
      <p class="comms-placeholder__title">${escapeHtml(title)}</p>
      <p class="comms-placeholder__body">${escapeHtml(blurb)}</p>
      <p class="comms-placeholder__hint">Real data lands in Phase 5 of <code>PLAN.md</code>.</p>
    </div>
  `;
}

function renderCommsAiChatPanel() {
  return `
    <div class="chat-shell" data-ai-chat data-ai-chat-endpoint="/api/comms/ai/chat/stream">
      <div class="chat-shell__messages">
        <div class="chat-message chat-message--assistant">
          <span class="chat-message__role">Beep Beep</span>
          <p class="chat-message__body">Ready to talk about email and form data once Phase 6 wires me up.</p>
        </div>
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label" for="chat-prompt">Prompt</label>
        <textarea id="chat-prompt" class="chat-shell__prompt-input" placeholder="Ask about email opens, form submissions, or campaign performance." disabled></textarea>
        <button class="chat-shell__send" type="button" data-ai-chat-send disabled><i class="bi bi-send ui-icon" aria-hidden="true"></i><span>Send</span></button>
      </div>
    </div>
  `;
}

function renderPanelContent(panelId: string) {
  if (panelId === "comms-postmark") {
    return renderPlaceholderPanel(
      "Postmark",
      "Email send volume, delivery rate, open and click trends, bounce reasons, and suppression growth — scoped per centre by tag.",
    );
  }

  if (panelId === "comms-mailchimp") {
    return renderPlaceholderPanel(
      "Mailchimp",
      "Recent campaigns with open and click-through rates, audience growth per list, and link-level engagement.",
    );
  }

  if (panelId === "comms-formstack") {
    return renderPlaceholderPanel(
      "Formstack",
      "Tour and enquiry submissions per centre, weekly trend, latest submissions list, and time-to-waitlist.",
    );
  }

  if (panelId === "comms-funnel") {
    return renderPlaceholderPanel(
      "Cross-source funnel",
      "Per centre: form submission → email engagement → Infocare waitlist entry → tour scheduled.",
    );
  }

  return renderCommsAiChatPanel();
}

export function renderCommsAppShell(options: CommsAppShellOptions = {}) {
  const focusPanelId = resolveCommsFocusPanelId(options.focusPanelId);
  const demo = options.demo === true;

  const panelContent = PANEL_DEFINITIONS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    children: renderPanelContent(panel.id),
  }));

  const layout = renderLayout({
    panels: panelContent,
    focusPanelId,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Online Communications</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="app-shell-body"${demo ? ` data-demo="1"` : ""}>
    <aside class="nav-rail" aria-label="Primary navigation">
      <a class="nav-rail__item" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/app${demo ? "?demo=1" : ""}" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item nav-rail__item--current" href="/comms${demo ? "?demo=1" : ""}" aria-label="Online Communications dashboard" title="Online Communications" aria-current="page"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      ${demo ? `<a class="nav-rail__item nav-rail__item--exit-demo" href="/comms" aria-label="Exit demo mode" title="Exit demo"><i class="bi bi-eject" aria-hidden="true"></i></a>` : ""}
    </aside>
    ${layout}
    <script>
      (function() {
        var demo = document.body.dataset.demo === "1";
        window.MH_DEMO = demo;
        window.mhDemoBody = function(obj) {
          if (!demo) return obj || {};
          return Object.assign({}, obj || {}, { demo: "1" });
        };
        window.mhDemoUrl = function(url) {
          if (!demo) return url;
          var sep = url.indexOf("?") === -1 ? "?" : "&";
          return url + sep + "demo=1";
        };
      })();
    </script>
  </body>
</html>`;
}

export { VALID_COMMS_PANEL_IDS };
