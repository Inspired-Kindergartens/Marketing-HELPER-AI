import type { FormstackConfigStatus } from "../formstack/config.js";
import type { MailchimpConfigStatus } from "../mailchimp/config.js";
import { resolveWindowKey, type WindowKey, WINDOW_OPTIONS } from "../analytics/windows.js";
import type { FormstackDashboardData } from "../storage/formstack-store.js";
import type { MailchimpDashboardData } from "../storage/mailchimp-store.js";
import type { PostmarkDashboardData } from "../storage/postmark-store.js";
import { renderLayout } from "./layout.js";
import { renderCommsFunnelPanel } from "./comms/funnel-panel.js";
import { renderFormstackPanel } from "./comms/formstack-panel.js";
import { renderMailchimpPanel } from "./comms/mailchimp-panel.js";
import { renderPostmarkPanel } from "./comms/postmark-panel.js";

const PANEL_DEFINITIONS = [
  { id: "comms-postmark", title: "Webmail", className: "panel--comms-postmark" },
  { id: "comms-mailchimp", title: "Panui", className: "panel--comms-mailchimp" },
  { id: "comms-formstack", title: "Online Forms", className: "panel--comms-formstack" },
  { id: "comms-funnel", title: "Centre Activity", className: "panel--comms-funnel" },
  { id: "chat", title: "AI Chat with Beep Beep", className: "panel--chat" },
] as const;

const VALID_COMMS_PANEL_IDS = new Set<string>(PANEL_DEFINITIONS.map((panel) => panel.id));

export type CommsAppShellOptions = {
  focusPanelId?: string | null;
  demo?: boolean;
  mailchimpDashboardData?: MailchimpDashboardData | null;
  mailchimpConfigStatus?: MailchimpConfigStatus | null;
  formstackDashboardData?: FormstackDashboardData | null;
  formstackConfigStatus?: FormstackConfigStatus | null;
  postmarkDashboardData?: PostmarkDashboardData | null;
  selectedWindowKey?: string | null;
  metaAdsFilter?: string | null;
  metaAdvertCentreCount?: number | null;
  integrationError?: string | null;
  integrationSource?: "mailchimp" | "formstack" | "postmark" | null;
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
  return input && VALID_COMMS_PANEL_IDS.has(input) ? input : null;
}

function formatTimestamp(input: string | null | undefined) {
  if (!input) return "No pull yet";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" });
}

function latestTimestamp(values: (string | null | undefined)[]) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);
}

function buildCommsQueryString(
  selectedWindowKey: WindowKey,
  options: { panel?: string; demo?: boolean; metaAdsFilter?: string | null } = {},
) {
  const params = new URLSearchParams();
  params.set("window", selectedWindowKey);
  if (options.panel) params.set("panel", options.panel);
  if (options.metaAdsFilter === "active-recent") params.set("metaAdsFilter", "active-recent");
  if (options.demo) params.set("demo", "1");
  return params.toString();
}

function resolveCommsMetaAdsFilter(input?: string | null) {
  return input === "active-recent" ? "active-recent" : "all";
}

function renderWebmailWindowActions(
  selectedWindowKey: WindowKey,
  demo: boolean,
  metaAdsFilter: string,
  metaAdvertCentreCount: number | null | undefined,
) {
  const resetHref = `/comms?${buildCommsQueryString("3M", { panel: "comms-postmark", demo, metaAdsFilter })}`;
  const checkHref = `/actions/check-postmark?${buildCommsQueryString(selectedWindowKey, { demo, metaAdsFilter })}`;
  const allHref = `/comms?${buildCommsQueryString(selectedWindowKey, { panel: "comms-postmark", demo })}`;
  const activeRecentHref = `/comms?${buildCommsQueryString(selectedWindowKey, { panel: "comms-postmark", demo, metaAdsFilter: "active-recent" })}`;
  const activeRecentLabel = metaAdsFilter === "active-recent" && metaAdvertCentreCount != null
    ? `Meta active/recent (${metaAdvertCentreCount})`
    : "Meta active/recent";

  return `
    <div class="analytics-toolbar__actions">
      <a
        class="analytics-toolbar__icon-action"
        href="${resetHref}"
        aria-label="Reset Webmail email window"
        title="Reset Webmail email window"
      ><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i></a>
      ${WINDOW_OPTIONS.map((option) => {
        const className =
          option.key === selectedWindowKey
            ? "analytics-toolbar__window analytics-toolbar__window--active"
            : "analytics-toolbar__window";

        return `<a class="${className}" href="/comms?${buildCommsQueryString(option.key, { panel: "comms-postmark", demo, metaAdsFilter })}">${option.label}</a>`;
      }).join("")}
      <a class="analytics-toolbar__window${metaAdsFilter === "all" ? " analytics-toolbar__window--active" : ""}" href="${allHref}">All emails</a>
      <a class="analytics-toolbar__window${metaAdsFilter === "active-recent" ? " analytics-toolbar__window--active" : ""}" href="${activeRecentHref}">${activeRecentLabel}</a>
      <a class="panel-action-button" href="${checkHref}" aria-label="Check latest Webmail webhook activity" title="Check latest Webmail webhook activity"><i class="bi bi-arrow-repeat ui-icon" aria-hidden="true"></i></a>
    </div>
  `;
}

function renderCommsAiChatPanel() {
  return `
    <div class="chat-shell" data-ai-chat data-ai-chat-endpoint="/api/comms/ai/chat/stream">
      <div class="chat-shell__messages">
        <div class="chat-message chat-message--assistant">
          <span class="chat-message__role">Beep Beep</span>
          <p class="chat-message__body">Ask about imported Panui campaigns, Online Forms submissions, or matched centre activity.</p>
        </div>
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label" for="comms-chat-prompt">Prompt</label>
        <textarea id="comms-chat-prompt" class="chat-shell__prompt-input" placeholder="Ask about email opens, form submissions, or campaign performance."></textarea>
        <button class="chat-shell__send" type="button" data-ai-chat-send><i class="bi bi-send ui-icon" aria-hidden="true"></i><span>Send</span></button>
      </div>
    </div>
  `;
}

function renderRefreshOutcome(options: CommsAppShellOptions) {
  if (options.integrationError) {
    const label = options.integrationSource === "formstack"
      ? "Online Forms"
      : options.integrationSource === "postmark"
        ? "Webmail"
        : "Panui";

    return `
      <div class="snapshot-outcome-banner snapshot-outcome-banner--error" role="alert">
        <div class="snapshot-outcome-banner__body">
          <p class="snapshot-outcome-banner__heading">${label} ${options.integrationSource === "postmark" ? "check" : "refresh"} couldn't complete</p>
          <p class="snapshot-outcome-banner__error">${escapeHtml(options.integrationError)}</p>
        </div>
      </div>
    `;
  }

  return "";
}

function renderPanelContent(panelId: string, options: CommsAppShellOptions) {
  if (panelId === "comms-postmark") {
    return renderPostmarkPanel({ dashboardData: options.postmarkDashboardData });
  }

  if (panelId === "comms-mailchimp") {
    return renderMailchimpPanel({
      dashboardData: options.mailchimpDashboardData,
      configStatus: options.mailchimpConfigStatus,
    });
  }

  if (panelId === "comms-formstack") {
    return renderFormstackPanel({
      dashboardData: options.formstackDashboardData,
      configStatus: options.formstackConfigStatus,
    });
  }

  if (panelId === "comms-funnel") {
    return renderCommsFunnelPanel(options.formstackDashboardData, options.postmarkDashboardData);
  }

  return renderCommsAiChatPanel();
}

function renderCommsChatScript() {
  return `
    <script>
      (function() {
        var shell = document.querySelector("[data-ai-chat]");
        if (!shell) return;
        var input = shell.querySelector(".chat-shell__prompt-input");
        var button = shell.querySelector("[data-ai-chat-send]");
        var messages = shell.querySelector(".chat-shell__messages");
        var history = [];
        function append(role, text) {
          var row = document.createElement("div");
          row.className = "chat-message chat-message--" + role;
          var title = document.createElement("span");
          title.className = "chat-message__role";
          title.textContent = role === "assistant" ? "Beep Beep" : "You";
          var body = document.createElement("p");
          body.className = "chat-message__body";
          body.textContent = text;
          row.append(title, body);
          messages.appendChild(row);
          messages.scrollTop = messages.scrollHeight;
          return body;
        }
        async function send() {
          var prompt = input.value.trim();
          if (!prompt || button.disabled) return;
          append("user", prompt);
          input.value = "";
          button.disabled = true;
          var output = append("assistant", "");
          var answer = "";
          try {
            var response = await fetch(shell.dataset.aiChatEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(window.mhDemoBody({ prompt: prompt, messages: history })),
            });
            if (!response.ok || !response.body) throw new Error("Chat request failed.");
            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";
            while (true) {
              var part = await reader.read();
              if (part.done) break;
              buffer += decoder.decode(part.value, { stream: true });
              var events = buffer.split("\\n\\n");
              buffer = events.pop() || "";
              events.forEach(function(eventText) {
                var lines = eventText.split("\\n");
                var eventType = lines.find(function(line) { return line.indexOf("event: ") === 0; });
                var eventData = lines.find(function(line) { return line.indexOf("data: ") === 0; });
                if (!eventType || !eventData) return;
                var payload = JSON.parse(eventData.slice(6));
                if (eventType === "event: chunk") {
                  answer += payload.chunk;
                  output.textContent = answer;
                } else if (eventType === "event: error") {
                  output.textContent = payload.error || "Chat request failed.";
                }
              });
            }
            history.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
          } catch (error) {
            output.textContent = error instanceof Error ? error.message : "Chat request failed.";
          } finally {
            button.disabled = false;
          }
        }
        button.addEventListener("click", send);
        input.addEventListener("keydown", function(event) {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        });
      })();
    </script>
  `;
}

function renderPostmarkRefreshScript() {
  return `
    <script>
      (function() {
        var panel = document.querySelector('[data-panel-id="comms-postmark"]');
        if (!panel) return;

        async function refreshMessages(page) {
          var list = panel.querySelector("[data-postmark-message-list]");
          if (!list) return;

          try {
            var params = new URLSearchParams(window.location.search);
            var selectedWindow = params.get("window") || "3M";
            var selectedMetaAdsFilter = params.get("metaAdsFilter") || "";
            var metaAdsFilterQuery = selectedMetaAdsFilter ? "&metaAdsFilter=" + encodeURIComponent(selectedMetaAdsFilter) : "";
            var response = await fetch("/api/comms/postmark/messages?page=" + encodeURIComponent(String(page || 1)) + "&window=" + encodeURIComponent(selectedWindow) + metaAdsFilterQuery, {
              headers: { "accept": "application/json" }
            });
            if (!response.ok) throw new Error("Webmail refresh failed.");
            var payload = await response.json();
            list.innerHTML = String(payload.html || "");
          } catch (error) {
            list.setAttribute("data-refresh-error", "1");
          }
        }

        panel.addEventListener("click", function(event) {
          var target = event.target;
          var pageButton = target instanceof Element ? target.closest("[data-postmark-page]") : null;
          if (pageButton instanceof HTMLButtonElement) {
            refreshMessages(Number(pageButton.getAttribute("data-postmark-page") || "1"));
            return;
          }

          var header = target instanceof Element ? target.closest(".panel__header") : null;
          if (header && panel.contains(header)) {
            refreshMessages(1);
          }
        });

        panel.addEventListener("keydown", function(event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          var target = event.target;
          var header = target instanceof Element ? target.closest(".panel__header") : null;
          if (header && panel.contains(header)) {
            refreshMessages(1);
          }
        });

        var sortSelect = panel.querySelector("[data-centre-activity-sort]");
        if (sortSelect) {
          sortSelect.addEventListener("change", function() {
            var table = panel.querySelector(".comms-section:last-child .comms-table tbody");
            if (!table) return;
            var rows = Array.from(table.querySelectorAll("tr"));
            rows.sort(function(a, b) {
              if (sortSelect.value === "last-sent") {
                var dateA = a.querySelector("td:last-child").textContent.trim();
                var dateB = b.querySelector("td:last-child").textContent.trim();
                if (dateA === "-" && dateB === "-") return a.querySelector("td").textContent.localeCompare(b.querySelector("td").textContent);
                if (dateA === "-") return 1;
                if (dateB === "-") return -1;
                return new Date(dateB) - new Date(dateA);
              }
              return a.querySelector("td").textContent.localeCompare(b.querySelector("td").textContent);
            });
            rows.forEach(function(row) { table.appendChild(row); });
          });
        }

        if (panel.classList.contains("panel--accordion-active") || panel.classList.contains("panel--focus")) {
          refreshMessages(1);
        }
      })();
    </script>
  `;
}

export function renderCommsAppShell(options: CommsAppShellOptions = {}) {
  const focusPanelId = resolveCommsFocusPanelId(options.focusPanelId);
  const demo = options.demo === true;
  const selectedWindowKey = resolveWindowKey(options.selectedWindowKey);
  const metaAdsFilter = resolveCommsMetaAdsFilter(options.metaAdsFilter);
  const mailchimpPulledAt = formatTimestamp(options.mailchimpDashboardData?.latestPulledAt);
  const formstackPulledAt = formatTimestamp(options.formstackDashboardData?.latestPulledAt);
  const postmarkReceivedAt = formatTimestamp(options.postmarkDashboardData?.latestReceivedAt);
  const combinedPulledAt = formatTimestamp(latestTimestamp([
    options.postmarkDashboardData?.latestReceivedAt,
    options.formstackDashboardData?.latestPulledAt,
  ]));
  const panelContent = PANEL_DEFINITIONS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    meta: panel.id === "comms-postmark"
      ? `<span class="comms-panel-source">Source: Postmark webhook + stored export | Latest activity: ${escapeHtml(postmarkReceivedAt)}</span>`
      : panel.id === "comms-mailchimp"
      ? `<span class="comms-panel-source">Source: Mailchimp | Last pulled: ${escapeHtml(mailchimpPulledAt)}</span><a class="panel-action-button" href="/actions/refresh-mailchimp${demo ? "?demo=1" : ""}" aria-label="Download latest Panui data from Mailchimp" title="Download latest Panui data from Mailchimp"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
      : panel.id === "comms-formstack"
        ? `<span class="comms-panel-source">Source: Formstack | Last pulled: ${escapeHtml(formstackPulledAt)}</span><a class="panel-action-button" href="/actions/refresh-formstack${demo ? "?demo=1" : ""}" aria-label="Download latest Online Forms data from Formstack" title="Download latest Online Forms data from Formstack"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
        : panel.id === "comms-funnel"
          ? `<span class="comms-panel-source">Sources: Postmark + Formstack | Latest activity: ${escapeHtml(combinedPulledAt)}</span>`
          : undefined,
    actions: panel.id === "comms-postmark"
      ? renderWebmailWindowActions(selectedWindowKey, demo, metaAdsFilter, options.metaAdvertCentreCount)
      : undefined,
    children: renderPanelContent(panel.id, options),
  }));
  const layout = renderLayout({ panels: panelContent, focusPanelId });

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
    ${renderRefreshOutcome(options)}
    ${layout}
    <script>
      (function() {
        var demo = document.body.dataset.demo === "1";
        window.MH_DEMO = demo;
        window.mhDemoBody = function(obj) {
          if (!demo) return obj || {};
          return Object.assign({}, obj || {}, { demo: "1" });
        };
      })();
    </script>
    ${renderPostmarkRefreshScript()}
    ${renderCommsChatScript()}
  </body>
</html>`;
}

export { VALID_COMMS_PANEL_IDS };
