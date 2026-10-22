import { renderLayout } from "./layout.js";
import {
  renderSubscriptionCreateDialog,
  renderSubscriptionListPanel,
  type SubscriptionListPanelOptions,
} from "./subscriptions/subscription-list-panel.js";
import {
  renderSubscriptionEditorPanel,
  type SubscriptionEditorPanelOptions,
} from "./subscriptions/subscription-editor-panel.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";

// Same list, modal and editor as Code Snippets, without an AI chat. With no
// right-hand column, the one panel uses the layout's full-width focus mode.
const PANEL_DEFINITIONS = [
  { id: "subscription-list", title: "Links", className: "panel--subscription-list panel--scroll" },
  { id: "subscription-editor", title: "Edit Link", className: "panel--subscription-editor panel--scroll" },
] as const;

export type SubscriptionsAppShellOptions = {
  list: SubscriptionListPanelOptions;
  editor: SubscriptionEditorPanelOptions;
};

function renderPanelActions(panelId: string, options: SubscriptionsAppShellOptions): string | undefined {
  // The editor replaces the list, so it carries Save and a way back, matching
  // the snippets editor.
  if (panelId === "subscription-editor" && options.editor.subscription) {
    return `
      <button class="panel-action-link" type="button" data-subscription-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
      <a class="panel-action-link" href="/subscriptions" data-subscription-done-editing><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Done editing</span></a>
    `;
  }
  return undefined;
}

// One delegated client script for every mutation, matching the snippets and wiki
// convention: JSON POSTs, reload on success, autosave on blur in the editor.
function renderSubscriptionsScript(): string {
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

        // Opening or copying a link marks it used, so its category is the one
        // expanded next time. keepalive lets it finish as the new tab opens.
        function markUsed(id) {
          if (!id) return;
          fetch("/api/subscriptions/" + encodeURIComponent(id) + "/used", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            keepalive: true,
          }).catch(function() {});
        }

        function setStatus(text) {
          var status = document.querySelector("[data-subscription-status]");
          if (status) status.textContent = text;
        }

        function closeCreateDialog() {
          var dialog = document.querySelector("[data-subscription-create-dialog]");
          if (!dialog) return;
          var form = dialog.querySelector("[data-subscription-create]");
          if (form) form.reset();
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }

        (function() {
          var dialog = document.querySelector("[data-subscription-create-dialog]");
          if (dialog) {
            // Clicking the backdrop closes it (Esc is handled natively).
            dialog.addEventListener("click", function(event) {
              if (event.target === dialog) closeCreateDialog();
            });
          }
          var categoriesDialog = document.querySelector("[data-subscription-categories-dialog]");
          if (categoriesDialog) {
            // Closing reloads, so renames and deletes show in the list.
            categoriesDialog.addEventListener("click", function(event) {
              if (event.target === categoriesDialog) window.location.reload();
            });
          }
        })();

        // --- Categories modal (same behaviour as the snippets one) -----------
        function setCategoryStatus(text) {
          var status = document.querySelector("[data-subscription-category-status]");
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
          var field = event.target instanceof Element ? event.target.closest("[data-subscription-category-name]") : null;
          if (!field) return;
          var row = field.closest("[data-subscription-category-id]");
          if (!row) return;
          var nextName = field.value.trim();
          var previousName = field.getAttribute("data-previous-name") || field.defaultValue;
          if (!nextName || nextName === previousName) return;
          categoryRequest("/api/subscriptions/categories/" + row.getAttribute("data-subscription-category-id"), { name: nextName }, function() {
            field.setAttribute("data-previous-name", nextName);
            setCategoryStatus("Renamed.");
          });
        }, true);

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
        var root = document.querySelector("[data-subscription-editor]");
        var form = root ? root.querySelector("[data-subscription-edit]") : null;

        // In the editor the link field is the source of truth, so Open and
        // Copy use what is typed even before it has been saved.
        function currentUrl(holder) {
          if (holder === root && form) {
            var field = form.querySelector('input[name="url"]');
            var typed = field ? field.value.trim() : "";
            if (!typed) return "";
            return /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : "https://" + typed;
          }
          return holder ? holder.getAttribute("data-subscription-url") || "" : "";
        }

        function collectPayload() {
          var data = {};
          if (!form) return data;
          new FormData(form).forEach(function(value, key) { data[key] = String(value).trim(); });
          return data;
        }

        function saveSubscription(silent) {
          if (!root) return Promise.resolve(false);
          setStatus("Saving...");
          return post("/api/subscriptions/" + root.getAttribute("data-subscription-id"), collectPayload())
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
          // Fields autosave on blur, matching the snippets, wiki and JD editors.
          form.addEventListener("blur", function(event) {
            if (event.target instanceof Element && event.target.matches("input, textarea")) saveSubscription(true);
          }, true);
          form.addEventListener("change", function(event) {
            if (event.target instanceof Element && event.target.matches("select")) saveSubscription(true);
          });
          form.addEventListener("input", function(event) {
            if (!(event.target instanceof Element) || !event.target.matches('input[name="url"]')) return;
            var hasUrl = !!event.target.value.trim();
            root.querySelectorAll("[data-subscription-open], [data-subscription-copy]").forEach(function(control) { control.disabled = !hasUrl; });
          });
          form.addEventListener("submit", function(event) {
            event.preventDefault();
            saveSubscription(false);
          });
        }

        // A row with a link opens it in a new tab (left or middle click).
        function rowOpened(event) {
          var row = event.target instanceof Element ? event.target.closest('a[data-subscription-row][target="_blank"]') : null;
          if (!row) return;
          var holder = row.closest("[data-subscription-id]");
          if (holder) markUsed(holder.getAttribute("data-subscription-id"));
        }
        document.addEventListener("click", rowOpened);
        document.addEventListener("auxclick", function(event) { if (event.button === 1) rowOpened(event); });

        document.addEventListener("click", function(event) {
          var el = event.target instanceof Element
            ? event.target.closest("[data-subscription-copy], [data-subscription-open], [data-subscription-save], [data-subscription-done-editing], [data-subscription-add], [data-subscription-create-cancel], [data-subscription-action], [data-subscription-categories], [data-subscription-categories-close], [data-subscription-category-delete]")
            : null;
          if (!el) return;

          if (el.hasAttribute("data-subscription-copy")) {
            event.preventDefault();
            var holder = el.closest("[data-subscription-url]");
            var url = currentUrl(holder);
            if (!url) return;
            copyText(url).then(function(ok) { flashCopied(el, ok); });
            if (holder !== root) markUsed(holder.getAttribute("data-subscription-id"));
            return;
          }

          if (el.hasAttribute("data-subscription-open")) {
            event.preventDefault();
            var openUrl = currentUrl(root);
            if (openUrl) window.open(openUrl, "_blank", "noopener");
            return;
          }

          if (el.hasAttribute("data-subscription-save")) {
            event.preventDefault();
            saveSubscription(false);
            return;
          }

          if (el.hasAttribute("data-subscription-done-editing")) {
            // Save before leaving so nothing typed since the last blur is lost.
            event.preventDefault();
            var target = el.getAttribute("href");
            saveSubscription(true).then(function() { window.location.href = target; });
            return;
          }

          if (el.hasAttribute("data-subscription-add")) {
            event.preventDefault();
            var dialog = document.querySelector("[data-subscription-create-dialog]");
            if (!dialog) return;
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "open");
            var titleInput = dialog.querySelector('input[name="title"]');
            if (titleInput) titleInput.focus();
            return;
          }

          if (el.hasAttribute("data-subscription-categories")) {
            event.preventDefault();
            var categoriesDialog = document.querySelector("[data-subscription-categories-dialog]");
            if (!categoriesDialog) return;
            if (typeof categoriesDialog.showModal === "function") categoriesDialog.showModal();
            else categoriesDialog.setAttribute("open", "open");
            return;
          }

          if (el.hasAttribute("data-subscription-categories-close")) {
            event.preventDefault();
            window.location.reload();
            return;
          }

          if (el.hasAttribute("data-subscription-category-delete")) {
            event.preventDefault();
            var delRow = el.closest("[data-subscription-category-id]");
            if (!delRow) return;
            var delName = delRow.querySelector("[data-subscription-category-name]");
            var label = delName ? delName.value : "this category";
            if (!window.confirm('Delete "' + label + '"? Its links move to General.')) return;
            categoryRequest("/api/subscriptions/categories/" + delRow.getAttribute("data-subscription-category-id") + "/delete", {}, function(payload) {
              delRow.remove();
              setCategoryStatus(
                payload.moved > 0
                  ? "Deleted. " + payload.moved + " link" + (payload.moved === 1 ? "" : "s") + " moved to General."
                  : "Deleted."
              );
            });
            return;
          }

          if (el.hasAttribute("data-subscription-create-cancel")) {
            event.preventDefault();
            closeCreateDialog();
            return;
          }

          var action = el.getAttribute("data-subscription-action");
          var id = el.getAttribute("data-subscription-id");
          if (action === "edit") {
            event.preventDefault();
            window.location.href = "/subscriptions?subscription=" + encodeURIComponent(id);
            return;
          }
          if (action === "delete") {
            event.preventDefault();
            if (!window.confirm("Delete this link? This cannot be undone.")) return;
            post("/api/subscriptions/" + id + "/delete", {})
              .then(function() {
                // Removed in place rather than reloading, so the open
                // category stays open.
                var deletedRow = el.closest("[data-subscription-id].wiki-list__row");
                var group = deletedRow ? deletedRow.closest("[data-subscription-group]") : null;
                if (deletedRow) deletedRow.remove();
                if (group && !group.querySelector(".wiki-list__row")) group.remove();
                if (!document.querySelector(".wiki-list__row")) window.location.reload();
              })
              .catch(function() { window.alert("That link couldn't be deleted. Please try again."); });
            return;
          }
          if (action === "duplicate") {
            event.preventDefault();
            post("/api/subscriptions/" + id + "/duplicate", {})
              .then(function() { window.location.reload(); })
              .catch(function() { window.alert("That link couldn't be duplicated. Please try again."); });
            return;
          }
        });

        document.addEventListener("submit", function(event) {
          var createForm = event.target;
          if (createForm instanceof HTMLFormElement && createForm.hasAttribute("data-subscription-category-create")) {
            event.preventDefault();
            var nameInput = createForm.querySelector('input[name="name"]');
            var newName = nameInput ? nameInput.value.trim() : "";
            if (!newName) return;
            categoryRequest("/api/subscriptions/categories", { name: newName }, function() { window.location.reload(); });
            return;
          }
          if (!(createForm instanceof HTMLFormElement) || !createForm.hasAttribute("data-subscription-create")) return;
          event.preventDefault();
          var payload = {};
          new FormData(createForm).forEach(function(value, key) { payload[key] = String(value).trim(); });
          // Back to the list, where the new link is ready to click.
          post("/api/subscriptions", payload)
            .then(function() { window.location.href = "/subscriptions"; })
            .catch(function() { window.alert("That link couldn't be created. Please try again."); });
        });
      })();
    </script>
  `;
}

export function renderSubscriptionsAppShell(options: SubscriptionsAppShellOptions): string {
  // The list, or the editor once a subscription is selected.
  const panelId = options.editor.subscription != null ? "subscription-editor" : "subscription-list";
  const panels = PANEL_DEFINITIONS.filter((panel) => panel.id === panelId).map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: renderPanelActions(panel.id, options),
    children:
      panel.id === "subscription-editor"
        ? renderSubscriptionEditorPanel(options.editor)
        : renderSubscriptionListPanel(options.list),
  }));
  const layout = renderLayout({ panels, focusPanelId: panelId });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Links</title>
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
      <a class="nav-rail__item inline-flex items-center justify-center text-muted nav-rail__item--current" href="/subscriptions" aria-label="Links" title="Links" aria-current="page"><i class="bi bi-credit-card" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/sector" aria-label="Sector Insight" title="Sector Insight"><i class="bi bi-binoculars" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderSubscriptionCreateDialog(options.editor.categories)}
    ${renderSubscriptionsScript()}
  </body>
</html>`;
}
