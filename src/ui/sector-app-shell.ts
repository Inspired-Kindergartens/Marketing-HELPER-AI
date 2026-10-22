import { renderLayout } from "./layout.js";
import type { SectorCentreView, SectorCrawlRunView } from "../storage/sector-store.js";
import type { SectorSyncProgress } from "../sector/sync.js";
import {
  formatSectorDate,
  renderSectorCentresPanel,
  renderSectorPromotionsPanel,
  renderSectorRunsPanel,
} from "./sector/sector-list-panel.js";
import { renderSectorCentrePanel } from "./sector/sector-centre-panel.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";

// Sector Insight: competitors and other ECE services with their promotions,
// meals and transport, an AI chat that answers from the exact matching rows,
// and the monthly update (src/sector/sync.ts) that keeps it current.

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type SectorAppShellOptions = {
  centres: SectorCentreView[];
  runs: SectorCrawlRunView[];
  lastCompletedAt: string | null;
  progress: SectorSyncProgress;
  // The centre open in the detail view, when ?centre= is set; undefined on the list.
  openCentre?: SectorCentreView | null;
};

function renderSyncStatus(options: SectorAppShellOptions): string {
  if (options.progress.running) {
    const counter = options.progress.total ? ` (${options.progress.done}/${options.progress.total})` : "";
    return `${escapeHtml(options.progress.phase)}${counter}…`;
  }
  return options.lastCompletedAt ? `Updated ${escapeHtml(formatSectorDate(options.lastCompletedAt))}` : "Not updated yet";
}

function renderCentresActions(options: SectorAppShellOptions): string {
  const running = options.progress.running;
  return `
    <button class="panel-action-button${running ? " panel-action-button--disabled" : ""}" type="button" data-sector-sync${running ? ' data-sector-sync-running="true"' : ""} title="Import the latest ECE directory and re-read competitor websites">
      <i class="bi bi-arrow-repeat ui-icon${running ? " panel-action-button__spinner" : ""}" aria-hidden="true"></i><span>${running ? "Updating" : "Update now"}</span>
    </button>
    <a class="panel-action-link" href="/api/sector/export.csv" title="Download the centre list as a spreadsheet"><i class="bi bi-filetype-csv ui-icon" aria-hidden="true"></i><span>Export</span></a>
  `;
}

function renderSectorAiChatPanel(openCentre: SectorCentreView | null | undefined): string {
  const greeting = openCentre
    ? `I can see ${escapeHtml(openCentre.name)}. Ask me about it, or about any other centres.`
    : "Ask me anything about competitors and other centres. For example: “Show me the list of centres that provide meals”, “Which BestStart centres are running a promotion?” or “How many home-based services are in Rotorua?”";
  return `
    <div class="chat-shell grid gap-8" data-ai-chat data-ai-chat-endpoint="/api/sector/ai/chat/stream"${openCentre ? ` data-sector-open-id="${openCentre.id}"` : ""}>
      <div class="chat-shell__messages">
        <div class="chat-message text-body chat-message--assistant">
          <span class="chat-message__role text-small text-ghost label-case">Beep Beep</span>
          <p class="chat-message__body">${greeting}</p>
        </div>
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label text-small text-ghost label-case" for="sector-chat-prompt">Prompt</label>
        <textarea id="sector-chat-prompt" class="chat-shell__prompt-input" placeholder="e.g. Which childcare centres in Pāpāmoa offer free hours?"></textarea>
        <button class="chat-shell__send inline-flex items-center justify-center gap-6" type="button" data-ai-chat-send><i class="bi bi-send ui-icon" aria-hidden="true"></i><span>Send</span></button>
      </div>
    </div>
  `;
}

// Filters, Update now, the centre editor and promotions: one delegated script.
function renderSectorScript(): string {
  return `
    <script>
      (function() {
        async function post(url, payload) {
          var response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload || {}),
          });
          var result = await response.json().catch(function() { return {}; });
          if (!response.ok) throw new Error(result.error || "Request failed.");
          return result;
        }

        // --- Filters (client side over the rendered rows) ---
        var filters = document.querySelector("[data-sector-filters]");
        function normalise(value) {
          return String(value || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        }
        function applyFilters() {
          if (!filters) return;
          var value = function(name) { var field = filters.querySelector("[name='" + name + "']"); return field ? field.value : ""; };
          var words = normalise(value("q")).split(" ").filter(Boolean);
          var rows = document.querySelectorAll("[data-sector-row]");
          var shown = 0;
          rows.forEach(function(row) {
            var d = row.dataset;
            var visible =
              (!value("city") || d.city === value("city")) &&
              (!value("type") || d.type === value("type")) &&
              (!value("operator") || d.operator === value("operator")) &&
              (!value("meals") || (value("meals") === "unknown" ? d.meals === "" : d.meals === value("meals"))) &&
              (!value("transport") || (value("transport") === "unknown" ? d.transport === "" : d.transport === value("transport"))) &&
              (!value("promo") || d.promo === value("promo")) &&
              words.every(function(word) { return d.search.indexOf(word) !== -1; });
            row.hidden = !visible;
            if (visible) shown++;
          });
          var count = document.querySelector("[data-sector-count]");
          if (count) count.textContent = shown + " of " + rows.length + " centres shown";
          var empty = document.querySelector("[data-sector-empty]");
          if (empty) empty.hidden = shown > 0;
        }
        if (filters) {
          filters.addEventListener("input", applyFilters);
          filters.addEventListener("change", applyFilters);
        }

        // --- Update now: start it, then follow its progress until it finishes ---
        var syncButton = document.querySelector("[data-sector-sync]");
        var syncStatus = document.querySelector("[data-sector-sync-status]");
        function showRunning(text) {
          if (!syncButton) return;
          syncButton.classList.add("panel-action-button--disabled");
          var icon = syncButton.querySelector(".bi-arrow-repeat");
          if (icon) icon.classList.add("panel-action-button__spinner");
          var label = syncButton.querySelector("span");
          if (label) label.textContent = "Updating";
          if (syncStatus && text) syncStatus.textContent = text;
        }
        function poll() {
          fetch("/api/sector/sync/status")
            .then(function(response) { return response.json(); })
            .then(function(progress) {
              if (progress.running) {
                showRunning(progress.phase + (progress.total ? " (" + progress.done + "/" + progress.total + ")" : "") + "…");
                setTimeout(poll, 3000);
              } else {
                window.location.reload();
              }
            })
            .catch(function() { setTimeout(poll, 10000); });
        }
        if (syncButton) {
          syncButton.addEventListener("click", function() {
            if (syncButton.classList.contains("panel-action-button--disabled")) return;
            showRunning("Starting…");
            post("/api/sector/sync", {})
              .then(function() { setTimeout(poll, 1500); })
              .catch(function(error) { window.alert(error.message); window.location.reload(); });
          });
          if (syncButton.hasAttribute("data-sector-sync-running")) setTimeout(poll, 3000);
        }

        // --- Centre editor and its promotions ---
        var editor = document.querySelector("[data-sector-centre]");
        if (!editor) return;
        var centreId = editor.getAttribute("data-sector-centre-id");
        var status = editor.querySelector("[data-sector-centre-status]");
        function save() {
          var form = editor.querySelector("[data-sector-centre-edit]");
          var payload = {};
          new FormData(form).forEach(function(value, key) { payload[key] = value; });
          if (status) status.textContent = "Saving…";
          return post("/api/sector/centres/" + centreId, payload)
            .then(function() { if (status) status.textContent = "Saved"; })
            .catch(function(error) { if (status) status.textContent = error.message; });
        }
        document.querySelectorAll("[data-sector-centre-save]").forEach(function(button) {
          button.addEventListener("click", save);
        });
        function swapPromotions(result) {
          var current = editor.querySelector("[data-sector-promotions]");
          if (!current || !result.html) return;
          var holder = document.createElement("div");
          holder.innerHTML = result.html;
          current.replaceWith(holder.firstElementChild);
        }
        editor.addEventListener("click", function(event) {
          var target = event.target instanceof Element ? event.target : null;
          var end = target && target.closest("[data-sector-promotion-end]");
          var remove = target && target.closest("[data-sector-promotion-delete]");
          if (end) {
            post("/api/sector/promotions/" + end.getAttribute("data-sector-promotion-end") + "/end", {}).then(swapPromotions).catch(function(error) { window.alert(error.message); });
          } else if (remove && window.confirm("Delete this promotion? It will not be kept in the history.")) {
            post("/api/sector/promotions/" + remove.getAttribute("data-sector-promotion-delete") + "/delete", {}).then(swapPromotions).catch(function(error) { window.alert(error.message); });
          }
        });
        var addForm = editor.querySelector("[data-sector-promotion-add]");
        if (addForm) {
          addForm.addEventListener("submit", function(event) {
            event.preventDefault();
            var data = new FormData(addForm);
            post("/api/sector/centres/" + centreId + "/promotions", { text: data.get("text"), sourceUrl: data.get("sourceUrl") })
              .then(function(result) { swapPromotions(result); addForm.reset(); })
              .catch(function(error) { window.alert(error.message); });
          });
        }
      })();
    </script>
  `;
}

// The same streaming chat as the other pages, plus the "results" event: the
// exact matching centres, listed under the reply with links to each.
function renderSectorChatScript(): string {
  return `
    <script>
      (function() {
        var shell = document.querySelector("[data-ai-chat]");
        if (!shell) return;
        var input = shell.querySelector(".chat-shell__prompt-input");
        var button = shell.querySelector("[data-ai-chat-send]");
        var messages = shell.querySelector(".chat-shell__messages");
        var openId = shell.getAttribute("data-sector-open-id");
        var history = [];
        var greeting = messages.innerHTML;
        var controller = null;
        function append(role, text, state) {
          var row = document.createElement("div");
          row.className = "chat-message text-body chat-message--" + role;
          if (state) row.dataset.messageState = state;
          var title = document.createElement("span");
          title.className = "chat-message__role text-small text-ghost label-case";
          title.textContent = role === "assistant" ? "Beep Beep" : "You";
          var body = document.createElement("p");
          body.className = "chat-message__body";
          body.textContent = text;
          row.append(title, body);
          messages.appendChild(row);
          messages.scrollTop = messages.scrollHeight;
          return body;
        }
        function renderResults(output, results) {
          var box = document.createElement("div");
          box.className = "chat-message__meta-notes";
          var heading = document.createElement("strong");
          heading.textContent = results.total + " centre" + (results.total === 1 ? "" : "s") + " — " + results.description;
          box.appendChild(heading);
          if (results.rows.length) {
            var list = document.createElement("ol");
            results.rows.forEach(function(row) {
              var item = document.createElement("li");
              var link = document.createElement("a");
              link.href = "/sector?centre=" + row.id;
              link.textContent = row.name;
              item.appendChild(link);
              if (row.town) item.append(" — " + row.town);
              if (row.detail) {
                var detail = document.createElement("span");
                detail.textContent = row.detail;
                item.appendChild(detail);
              }
              list.appendChild(item);
            });
            box.appendChild(list);
          }
          if (results.total > results.rows.length) {
            var more = document.createElement("p");
            more.textContent = "…and " + (results.total - results.rows.length) + " more. Use the filters on the list to see them all.";
            box.appendChild(more);
          }
          output.parentElement.appendChild(box);
        }
        async function send() {
          var prompt = input.value.trim();
          if (!prompt || button.disabled) return;
          append("user", prompt);
          input.value = "";
          input.disabled = true;
          button.disabled = true;
          var output = append("assistant", "Thinking...", "pending");
          var answer = "";
          var results = null;
          var request = new AbortController();
          controller = request;
          try {
            var response = await fetch(shell.dataset.aiChatEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: prompt, messages: history, centreId: openId }),
              signal: request.signal,
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
                if (eventType === "event: results") {
                  results = payload;
                } else if (eventType === "event: chunk") {
                  answer += payload.chunk;
                  // The chat shows plain text; drop markdown bold the model adds anyway.
                  output.textContent = answer.replace(/\\*\\*/g, "");
                  output.parentElement.removeAttribute("data-message-state");
                  messages.scrollTop = messages.scrollHeight;
                } else if (eventType === "event: error") {
                  output.textContent = payload.error || "Chat request failed.";
                }
              });
            }
            if (!answer) {
              output.textContent = "No answer returned.";
              output.parentElement.removeAttribute("data-message-state");
            }
            if (results) renderResults(output, results);
            messages.scrollTop = messages.scrollHeight;
            history.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
          } catch (error) {
            if (request.signal.aborted) return;
            output.textContent = error instanceof Error ? error.message : "Chat request failed.";
            output.parentElement.removeAttribute("data-message-state");
          } finally {
            if (controller === request) {
              controller = null;
              input.disabled = false;
              button.disabled = false;
            }
          }
        }
        function clearChat() {
          if (controller) controller.abort();
          controller = null;
          history = [];
          messages.innerHTML = greeting;
          input.value = "";
          input.disabled = false;
          button.disabled = false;
          input.focus();
        }
        var clear = document.querySelector("[data-ai-chat-clear]");
        if (clear) clear.addEventListener("click", clearChat);
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

const CHAT_ACTIONS = `
  <button class="panel-action-link" type="button" data-ai-chat-clear><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i><span>Clear</span></button>
`;

export function renderSectorAppShell(options: SectorAppShellOptions): string {
  const chat = {
    id: "chat",
    title: "AI Sector Insight",
    className: "panel--chat",
    actions: CHAT_ACTIONS,
    children: renderSectorAiChatPanel(options.openCentre),
  };
  const panels =
    options.openCentre !== undefined
      ? [
          {
            id: "sector-centre",
            title: options.openCentre?.name ?? "Centre",
            className: "panel--sector-centre",
            actions: `<a class="panel-action-link" href="/sector"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to list</span></a>`,
            children: renderSectorCentrePanel(options.openCentre),
          },
          chat,
        ]
      : [
          {
            id: "sector-centres",
            title: "Centres",
            className: "panel--sector-centres",
            meta: `<span data-sector-sync-status>${renderSyncStatus(options)}</span>`,
            actions: renderCentresActions(options),
            children: renderSectorCentresPanel({ centres: options.centres }),
          },
          {
            id: "sector-promotions",
            title: "Promotions",
            className: "panel--sector-promotions",
            children: renderSectorPromotionsPanel(options.centres),
          },
          {
            id: "sector-runs",
            title: "Update History",
            className: "panel--sector-runs",
            children: renderSectorRunsPanel(options.runs),
          },
          chat,
        ];
  const layout = renderLayout({ panels });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Sector Insight</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="app-shell-body">
    <aside class="nav-rail flex flex-col items-center gap-6" aria-label="Primary navigation">
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/tasks" aria-label="Tasks" title="Tasks"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/jd" aria-label="Job Descriptions" title="Job Descriptions"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/wiki" aria-label="Things To Know" title="Things To Know"><i class="bi bi-journal-bookmark" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/snippets" aria-label="Code Snippets" title="Code Snippets"><i class="bi bi-code-slash" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/subscriptions" aria-label="Links" title="Links"><i class="bi bi-credit-card" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted nav-rail__item--current" href="/sector" aria-label="Sector Insight" title="Sector Insight" aria-current="page"><i class="bi bi-binoculars" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderSectorScript()}
    ${renderSectorChatScript()}
  </body>
</html>`;
}
