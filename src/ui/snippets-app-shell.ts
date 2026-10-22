import { renderLayout } from "./layout.js";
import {
  renderSnippetCreateDialog,
  renderSnippetListPanel,
  type SnippetListPanelOptions,
} from "./snippets/snippet-list-panel.js";
import { renderSnippetEditorPanel, type SnippetEditorPanelOptions } from "./snippets/snippet-editor-panel.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";

const PANEL_DEFINITIONS = [
  { id: "snippet-list", title: "Code Snippets", className: "panel--snippet-list panel--scroll" },
  { id: "snippet-editor", title: "Edit Snippet", className: "panel--snippet-editor panel--scroll" },
  { id: "chat", title: "AI Snippet Helper", className: "panel--chat" },
] as const;

export type SnippetsAppShellOptions = {
  list: SnippetListPanelOptions;
  editor: SnippetEditorPanelOptions;
};

function renderPanelActions(panelId: string, options: SnippetsAppShellOptions): string | undefined {
  // The editor replaces the whole view, so it carries Save and a way back,
  // matching the wiki and JD editors. Both share the footer's data attributes,
  // so the one delegated handler drives them identically.
  if (panelId === "snippet-editor" && options.editor.snippet) {
    return `
      <button class="panel-action-link" type="button" data-snippet-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      <a class="panel-action-link" href="/snippets" data-snippet-done-editing><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Done editing</span></a>
    `;
  }
  if (panelId === "chat") {
    return `
      <button class="panel-action-link" type="button" data-ai-chat-clear><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i><span>Clear</span></button>
    `;
  }
  return undefined;
}

// The same chat panel the other sections carry, pointed at the snippets
// endpoint. It reads the snippet open in the editor, so "fix this" works there.
function renderSnippetsAiChatPanel(openSnippetId: number | null): string {
  return `
    <div class="chat-shell grid gap-8" data-ai-chat data-ai-chat-endpoint="/api/snippets/ai/chat/stream"${openSnippetId != null ? ` data-snippet-open-id="${openSnippetId}"` : ""}>
      <div class="chat-shell__messages">
        <div class="chat-message text-body chat-message--assistant">
          <span class="chat-message__role text-small text-ghost label-case">Beep Beep</span>
          <p class="chat-message__body">${
            openSnippetId != null
              ? "I can see the snippet you're editing. Ask me to fix it, extend it, or explain it."
              : "Describe the snippet you need: a tracking tag, an embed, a block of email HTML. Any code I write can be saved straight to your snippets."
          }</p>
        </div>
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label text-small text-ghost label-case" for="snippets-chat-prompt">Prompt</label>
        <textarea id="snippets-chat-prompt" class="chat-shell__prompt-input" placeholder="e.g. A Meta Pixel lead event for the enrolment form's thank-you page."></textarea>
        <button class="chat-shell__send inline-flex items-center justify-center gap-6" type="button" data-ai-chat-send><i class="bi bi-send ui-icon" aria-hidden="true"></i><span>Send</span></button>
      </div>
    </div>
  `;
}

// Same streaming client as the other chats, plus "Save as snippet" under any
// reply that contains a fenced code block.
function renderSnippetsChatScript(): string {
  return `
    <script>
      (function() {
        var shell = document.querySelector("[data-ai-chat]");
        if (!shell) return;
        var input = shell.querySelector(".chat-shell__prompt-input");
        var button = shell.querySelector("[data-ai-chat-send]");
        var messages = shell.querySelector(".chat-shell__messages");
        var openId = shell.getAttribute("data-snippet-open-id");
        var history = [];
        var FENCE = String.fromCharCode(96, 96, 96);
        var greeting = messages.innerHTML;
        // Aborts the in-flight reply when the chat is cleared mid-answer.
        var controller = null;
        // Same pending treatment as the dashboard chat: a "Thinking..." row
        // that turns into the answer when the first chunk lands.
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
        // The first fenced block in a reply, with the language from its tag.
        function extractCode(answer) {
          var start = answer.indexOf(FENCE);
          if (start === -1) return null;
          var lineEnd = answer.indexOf("\\n", start);
          if (lineEnd === -1) return null;
          var end = answer.indexOf(FENCE, lineEnd);
          if (end === -1) return null;
          return {
            language: answer.slice(start + 3, lineEnd).trim(),
            code: answer.slice(lineEnd + 1, end).replace(/\\n$/, ""),
          };
        }
        function addSaveButton(output, answer) {
          var block = extractCode(answer);
          if (!block || !block.code.trim()) return;
          var save = document.createElement("button");
          save.type = "button";
          save.className = "wiki-list__add nowrap button-md";
          save.innerHTML = '<i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Save as snippet</span>';
          save.setAttribute("data-snippet-add", "");
          save.setAttribute("data-snippet-prefill-code", block.code);
          save.setAttribute("data-snippet-prefill-language", block.language);
          output.parentElement.appendChild(save);
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
          var request = new AbortController();
          controller = request;
          try {
            var response = await fetch(shell.dataset.aiChatEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: prompt, messages: history, snippetId: openId }),
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
                if (eventType === "event: chunk") {
                  answer += payload.chunk;
                  output.textContent = answer;
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
            history.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
            addSaveButton(output, answer);
          } catch (error) {
            // A clear mid-answer aborts the request; the rows are already gone.
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

// One delegated client script for every mutation, matching the wiki/JD
// convention: JSON POSTs, reload on success, autosave on blur in the editor.
function renderSnippetsScript(): string {
  return `
    <script>
      (function() {
        async function post(url, payload) {
          var response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload || {}),
          });
          if (!response.ok) throw new Error("Request failed");
          return response.json().catch(function() { return {}; });
        }

        function setStatus(text) {
          var status = document.querySelector("[data-snippet-status]");
          if (status) status.textContent = text;
        }

        function closeCreateDialog() {
          var dialog = document.querySelector("[data-snippet-create-dialog]");
          if (!dialog) return;
          var form = dialog.querySelector("[data-snippet-create]");
          if (form) {
            form.reset();
            form.querySelectorAll('input[type="hidden"]').forEach(function(field) { field.value = ""; });
          }
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }

        (function() {
          var dialog = document.querySelector("[data-snippet-create-dialog]");
          if (dialog) {
            // Clicking the backdrop closes it (Esc is handled natively).
            dialog.addEventListener("click", function(event) {
              if (event.target === dialog) closeCreateDialog();
            });
          }
          var categoriesDialog = document.querySelector("[data-snippet-categories-dialog]");
          if (categoriesDialog) {
            // Closing reloads, so renames and deletes show in the list.
            categoriesDialog.addEventListener("click", function(event) {
              if (event.target === categoriesDialog) window.location.reload();
            });
          }
        })();

        // --- Categories modal (same behaviour as the wiki's) ----------------
        function setCategoryStatus(text) {
          var status = document.querySelector("[data-snippet-category-status]");
          if (status) status.textContent = text || "";
        }

        // Category changes report errors inline rather than reloading, so a
        // rejected rename does not lose what was typed.
        function categoryRequest(url, payload, onSuccess) {
          setCategoryStatus("Saving...");
          fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload || {}),
          })
            .then(function(response) { return response.json().then(function(body) { return { ok: response.ok, body: body }; }); })
            .then(function(result) {
              if (!result.ok || (result.body && result.body.error)) {
                setCategoryStatus((result.body && result.body.error) || "That change could not be saved.");
                return;
              }
              setCategoryStatus("");
              if (onSuccess) onSuccess(result.body || {});
            })
            .catch(function() { setCategoryStatus("That change could not be saved."); });
        }

        document.addEventListener("blur", function(event) {
          var field = event.target instanceof Element ? event.target.closest("[data-snippet-category-name]") : null;
          if (!field) return;
          var row = field.closest("[data-snippet-category-id]");
          if (!row) return;
          var nextName = field.value.trim();
          var previousName = field.getAttribute("data-previous-name") || field.defaultValue;
          if (!nextName || nextName === previousName) return;
          categoryRequest("/api/snippets/categories/" + row.getAttribute("data-snippet-category-id"), { name: nextName }, function() {
            field.setAttribute("data-previous-name", nextName);
            setCategoryStatus("Renamed.");
          });
        }, true);

        // Code is plain text, so the async clipboard API is enough; the
        // textarea-selection route covers browsers that refuse it.
        function copyText(text) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function() { return true; }, fallbackCopy.bind(null, text));
          }
          return Promise.resolve(fallbackCopy(text));
        }

        function fallbackCopy(text) {
          var holder = document.createElement("textarea");
          holder.value = text;
          holder.className = "clipboard-buffer";
          document.body.appendChild(holder);
          holder.select();
          var copied = false;
          try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
          holder.remove();
          return copied;
        }

        // Confirms the copy on the button itself: the label when it has one,
        // otherwise the icon, so the list's icon buttons stay the same size.
        function flashCopied(button, ok) {
          var label = button.querySelector("span");
          var icon = button.querySelector("i");
          if (label) {
            var previous = label.textContent;
            label.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(function() { label.textContent = previous; }, 1800);
          } else if (icon) {
            icon.className = "bi " + (ok ? "bi-check2" : "bi-x-lg") + " ui-icon";
            setTimeout(function() { icon.className = "bi bi-clipboard ui-icon"; }, 1800);
          }
        }

        // --- Editor --------------------------------------------------------
        var root = document.querySelector("[data-snippet-editor]");
        var form = root ? root.querySelector("[data-snippet-edit]") : null;

        function collectPayload() {
          var data = {};
          if (!form) return data;
          new FormData(form).forEach(function(value, key) {
            // Code keeps its whitespace; every other field is trimmed.
            data[key] = key === "code" ? value : String(value).trim();
          });
          return data;
        }

        function saveSnippet(silent) {
          if (!root) return Promise.resolve(false);
          setStatus("Saving...");
          return post("/api/snippets/" + root.getAttribute("data-snippet-id"), collectPayload())
            .then(function() {
              setStatus("Saved " + new Date().toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }));
              if (!silent) window.location.reload();
              return true;
            })
            .catch(function() {
              setStatus("Save failed — check your connection and try again");
              return false;
            });
        }

        if (form) {
          // Tab indents inside the code box rather than leaving it, as in any
          // code editor. Shift+Tab still moves focus back out.
          var code = form.querySelector("[data-snippet-code]");
          if (code) {
            code.addEventListener("keydown", function(event) {
              if (event.key !== "Tab" || event.shiftKey) return;
              event.preventDefault();
              document.execCommand("insertText", false, "  ");
            });
          }

          // Fields autosave on blur, matching the wiki and JD editors.
          form.addEventListener("blur", function(event) {
            if (event.target instanceof Element && event.target.matches("input, textarea")) saveSnippet(true);
          }, true);
          form.addEventListener("change", function(event) {
            if (event.target instanceof Element && event.target.matches("select")) saveSnippet(true);
          });
          form.addEventListener("submit", function(event) {
            event.preventDefault();
            saveSnippet(false);
          });
        }

        document.addEventListener("click", function(event) {
          var el = event.target instanceof Element
            ? event.target.closest("[data-snippet-copy], [data-snippet-save], [data-snippet-done-editing], [data-snippet-add], [data-snippet-create-cancel], [data-snippet-action], [data-snippet-categories], [data-snippet-categories-close], [data-snippet-category-delete]")
            : null;
          if (!el) return;

          if (el.hasAttribute("data-snippet-copy")) {
            event.preventDefault();
            var holder = el.closest("[data-snippet-id]");
            var source = holder ? holder.querySelector("[data-snippet-code]") : null;
            if (!source) return;
            // A row click confirms on the row's clipboard icon, so the title
            // itself never changes under the pointer.
            var feedback = el.hasAttribute("data-snippet-row")
              ? holder.querySelector("[data-snippet-copy-icon]") || el
              : el;
            copyText(source.value).then(function(ok) { flashCopied(feedback, ok); });
            return;
          }

          if (el.hasAttribute("data-snippet-save")) {
            event.preventDefault();
            saveSnippet(false);
            return;
          }

          if (el.hasAttribute("data-snippet-done-editing")) {
            // Save before leaving so nothing typed since the last blur is lost.
            event.preventDefault();
            var target = el.getAttribute("href");
            saveSnippet(true).then(function() { window.location.href = target; });
            return;
          }

          if (el.hasAttribute("data-snippet-add")) {
            event.preventDefault();
            var dialog = document.querySelector("[data-snippet-create-dialog]");
            if (!dialog) return;
            // From the chat, the reply's code and language ride along hidden.
            var codeField = dialog.querySelector('input[name="code"]');
            var languageField = dialog.querySelector('input[name="language"]');
            if (codeField) codeField.value = el.getAttribute("data-snippet-prefill-code") || "";
            if (languageField) languageField.value = el.getAttribute("data-snippet-prefill-language") || "";
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "open");
            var titleInput = dialog.querySelector('input[name="title"]');
            if (titleInput) titleInput.focus();
            return;
          }

          if (el.hasAttribute("data-snippet-categories")) {
            event.preventDefault();
            var categoriesDialog = document.querySelector("[data-snippet-categories-dialog]");
            if (!categoriesDialog) return;
            if (typeof categoriesDialog.showModal === "function") categoriesDialog.showModal();
            else categoriesDialog.setAttribute("open", "open");
            return;
          }

          if (el.hasAttribute("data-snippet-categories-close")) {
            event.preventDefault();
            window.location.reload();
            return;
          }

          if (el.hasAttribute("data-snippet-category-delete")) {
            event.preventDefault();
            var delRow = el.closest("[data-snippet-category-id]");
            if (!delRow) return;
            var delName = delRow.querySelector("[data-snippet-category-name]");
            var label = delName ? delName.value : "this category";
            if (!window.confirm('Delete "' + label + '"? Its snippets move to General.')) return;
            categoryRequest("/api/snippets/categories/" + delRow.getAttribute("data-snippet-category-id") + "/delete", {}, function(payload) {
              delRow.remove();
              setCategoryStatus(
                payload.moved > 0
                  ? "Deleted. " + payload.moved + " snippet" + (payload.moved === 1 ? "" : "s") + " moved to General."
                  : "Deleted."
              );
            });
            return;
          }

          if (el.hasAttribute("data-snippet-create-cancel")) {
            event.preventDefault();
            closeCreateDialog();
            return;
          }

          var action = el.getAttribute("data-snippet-action");
          var id = el.getAttribute("data-snippet-id");
          if (action === "edit") {
            event.preventDefault();
            window.location.href = "/snippets?snippet=" + encodeURIComponent(id);
            return;
          }
          if (action === "delete") {
            event.preventDefault();
            if (!window.confirm("Delete this snippet? This cannot be undone.")) return;
            post("/api/snippets/" + id + "/delete", {})
              .then(function() { window.location.reload(); })
              .catch(function() { window.alert("That snippet couldn't be deleted. Please try again."); });
            return;
          }
          if (action === "duplicate") {
            event.preventDefault();
            post("/api/snippets/" + id + "/duplicate", {})
              .then(function() { window.location.reload(); })
              .catch(function() { window.alert("That snippet couldn't be duplicated. Please try again."); });
            return;
          }
        });

        document.addEventListener("submit", function(event) {
          var createForm = event.target;
          if (createForm instanceof HTMLFormElement && createForm.hasAttribute("data-snippet-category-create")) {
            event.preventDefault();
            var nameInput = createForm.querySelector('input[name="name"]');
            var newName = nameInput ? nameInput.value.trim() : "";
            if (!newName) return;
            categoryRequest("/api/snippets/categories", { name: newName }, function() { window.location.reload(); });
            return;
          }
          if (!(createForm instanceof HTMLFormElement) || !createForm.hasAttribute("data-snippet-create")) return;
          event.preventDefault();
          var payload = {};
          // Code keeps its whitespace; every other field is trimmed.
          new FormData(createForm).forEach(function(value, key) { payload[key] = key === "code" ? value : String(value).trim(); });
          post("/api/snippets", payload)
            .then(function(result) {
              if (result && result.id) {
                window.location.href = "/snippets?snippet=" + encodeURIComponent(String(result.id));
              } else {
                window.location.reload();
              }
            })
            .catch(function() { window.alert("That snippet couldn't be created. Please try again."); });
        });
      })();
    </script>
  `;
}

export function renderSnippetsAppShell(options: SnippetsAppShellOptions): string {
  // The left column shows the list, or the editor once a snippet is selected;
  // the chat sits in the right column in both, since it helps write the code.
  const openSnippet = options.editor.snippet;
  const leftPanelId = openSnippet != null ? "snippet-editor" : "snippet-list";

  const panels = PANEL_DEFINITIONS.filter((panel) => panel.id === leftPanelId || panel.id === "chat").map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: renderPanelActions(panel.id, options),
    children:
      panel.id === "chat"
        ? renderSnippetsAiChatPanel(openSnippet?.id ?? null)
        : panel.id === "snippet-editor"
          ? renderSnippetEditorPanel(options.editor)
          : renderSnippetListPanel(options.list),
  }));
  const layout = renderLayout({ panels });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Code Snippets</title>
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
      <a class="nav-rail__item inline-flex items-center justify-center text-muted nav-rail__item--current" href="/snippets" aria-label="Code Snippets" title="Code Snippets" aria-current="page"><i class="bi bi-code-slash" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/subscriptions" aria-label="Links" title="Links"><i class="bi bi-credit-card" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/sector" aria-label="Sector Insight" title="Sector Insight"><i class="bi bi-binoculars" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderSnippetCreateDialog(options.editor.categories)}
    ${renderSnippetsScript()}
    ${renderSnippetsChatScript()}
  </body>
</html>`;
}
