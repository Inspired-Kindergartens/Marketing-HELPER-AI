import { renderLayout } from "./layout.js";
import { renderWikiListPanel, type WikiListPanelOptions } from "./wiki/wiki-list-panel.js";
import { renderWikiEditorPanel, type WikiEditorPanelOptions } from "./wiki/wiki-editor-panel.js";
import { renderWikiArticlePanel, type WikiArticlePanelOptions } from "./wiki/wiki-article-panel.js";

const PANEL_DEFINITIONS = [
  { id: "wiki-list", title: "Things To Know", className: "panel--wiki-list" },
  { id: "wiki-article", title: "Article", className: "panel--wiki-article" },
  { id: "wiki-editor", title: "Edit Article", className: "panel--wiki-editor" },
] as const;

const VALID_WIKI_PANEL_IDS = new Set<string>(PANEL_DEFINITIONS.map((panel) => panel.id));

export function resolveWikiFocusPanelId(input?: string | null) {
  return input && VALID_WIKI_PANEL_IDS.has(input) ? input : null;
}

export type WikiAppShellOptions = {
  focusPanelId?: string | null;
  list: WikiListPanelOptions;
  article: WikiArticlePanelOptions;
  editor: WikiEditorPanelOptions;
};

function renderPanelContent(panelId: string, options: WikiAppShellOptions): string {
  if (panelId === "wiki-article") return renderWikiArticlePanel(options.article);
  if (panelId === "wiki-editor") return renderWikiEditorPanel(options.editor);
  return renderWikiListPanel(options.list);
}

function renderPanelActions(panelId: string, options: WikiAppShellOptions): string | undefined {
  // The reader and the editor each replace the whole view, so both carry a way
  // back — matching the JD editor's convention. The editor returns to the
  // article it was editing, not to the list.
  if (panelId === "wiki-article" && options.article.article) {
    return `
      <a class="panel-action-link" href="/wiki"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to Things To Know</span></a>
    `;
  }

  if (panelId === "wiki-editor" && options.editor.article) {
    const article = options.editor.article;
    // Marked so the client can save, refresh the summary, and only then leave.
    return `
      <a class="panel-action-link" href="/wiki?panel=wiki-article&article=${article.id}" data-wiki-done-editing data-wiki-id="${article.id}"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Done editing</span></a>
    `;
  }

  return undefined;
}

// One delegated client script for every mutation in the section, matching the
// JD/Tasks/Comms convention: JSON POST that reloads on success.
function renderWikiScript(): string {
  return `
    <script>
      (function() {
        function reload() { window.location.reload(); }

        // The destination is where to land afterwards. Reloading is right from
        // the list, but an action that removes the open article from view has
        // to go somewhere that still exists.
        async function post(url, payload, destination) {
          try {
            var response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
            });
            if (!response.ok) throw new Error("Request failed");
            if (destination) window.location.href = destination;
            else reload();
            return true;
          } catch (error) {
            window.alert("That action couldn't be saved. Please try again.");
            return false;
          }
        }

        // True when the click came from the article reader rather than a list
        // row, so the handler knows the current view is about to disappear.
        function inArticleReader(el) {
          return !!(el.closest && el.closest("[data-wiki-article]"));
        }

        async function postSilent(url, payload) {
          try {
            var response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
            });
            if (!response.ok) throw new Error("Request failed");
            return await response.json().catch(function () { return {}; });
          } catch (error) {
            return null;
          }
        }

        function formData(form, includeEmpty) {
          var data = {};
          new FormData(form).forEach(function(value, key) {
            var trimmed = typeof value === "string" ? value.trim() : value;
            if (includeEmpty || trimmed !== "") data[key] = trimmed;
          });
          // An unchecked checkbox is absent from FormData, so send it explicitly
          // or unpinning would never save.
          form.querySelectorAll('input[type="checkbox"]').forEach(function(box) {
            data[box.name] = box.checked;
          });
          return data;
        }

        function setStatus(text) {
          var status = document.querySelector("[data-wiki-status]");
          if (status) status.textContent = text;
        }

        function openDialog(selector) {
          var dialog = document.querySelector(selector);
          if (!dialog) return;
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "open");
        }

        function setCategoryStatus(text) {
          var status = document.querySelector("[data-wiki-category-status]");
          if (status) status.textContent = text || "";
        }

        // Category mutations report their own errors inline in the modal rather
        // than reloading, so a rejected rename does not lose what was typed.
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

        // Word, Google Docs and Outlook read the text/html flavour, but a bare
        // fragment gives them no document context and they fall back to plain
        // text. Wrapping it in a real HTML document, and inlining the emphasis
        // as style attributes, is what makes the formatting survive the paste.
        // Word, Google Docs and Outlook keep inline styles and largely ignore
        // stylesheets, so every element that carries meaning gets its formatting
        // written onto it directly. Headings and paragraphs need explicit sizes
        // too, or they paste as undifferentiated body text.
        var CLIPBOARD_STYLES = {
          H1: "font-size:22pt; font-weight:700; margin:12pt 0 6pt",
          H2: "font-size:16pt; font-weight:700; margin:12pt 0 6pt",
          H3: "font-size:13pt; font-weight:700; margin:10pt 0 5pt",
          P: "margin:0 0 8pt",
          LI: "margin:0 0 4pt",
          STRONG: "font-weight:700",
          B: "font-weight:700",
          EM: "font-style:italic",
          I: "font-style:italic",
          U: "text-decoration:underline",
          S: "text-decoration:line-through",
          A: "color:#0563c1; text-decoration:underline",
        };

        function buildClipboardFragment(source) {
          var clone = source.cloneNode(true);

          // A <ul> may only contain <li>. contenteditable nests one list
          // directly inside another, which Word renders flat; move it into the
          // preceding <li> so the indent survives.
          clone.querySelectorAll("ul > ul, ul > ol, ol > ul, ol > ol").forEach(function(list) {
            var previous = list.previousElementSibling;
            if (previous && previous.tagName === "LI") previous.appendChild(list);
          });

          clone.querySelectorAll("*").forEach(function(node) {
            var style = CLIPBOARD_STYLES[node.tagName];
            if (style) node.setAttribute("style", style);
          });

          clone.querySelectorAll("ul, ol").forEach(function(list) {
            var nested = list.parentElement && list.parentElement.tagName === "LI";
            list.setAttribute(
              "style",
              "margin:" + (nested ? "4pt 0 0" : "0 0 8pt") + "; padding-left:28px"
            );
          });

          // Loose text nodes (the editor does not always wrap the first line)
          // become paragraphs, so they are not glued to what follows.
          Array.prototype.slice.call(clone.childNodes).forEach(function(node) {
            if (node.nodeType !== 3) return;
            if (!node.textContent.trim()) { node.remove(); return; }
            var paragraph = document.createElement("p");
            paragraph.setAttribute("style", CLIPBOARD_STYLES.P);
            paragraph.textContent = node.textContent.trim();
            node.replaceWith(paragraph);
          });

          clone.querySelectorAll("p").forEach(function(paragraph) {
            if (!paragraph.textContent.trim() && !paragraph.querySelector("img, br")) paragraph.remove();
          });

          return clone;
        }

        function buildClipboardHtml(source) {
          return (
            '<html><head><meta charset="utf-8"></head><body style="font-family:Calibri,Arial,sans-serif; font-size:11pt; color:#000">' +
            buildClipboardFragment(source).innerHTML +
            "</body></html>"
          );
        }

        function copyRichText(button, source) {
          var label = button.querySelector("span");

          function done(text) {
            if (label) label.textContent = text;
            setTimeout(function() { if (label) label.textContent = "Copy to clipboard"; }, 1800);
          }

          // Copying a real on-page selection is what reliably carries formatting
          // across browsers. The holder has to be visible and laid out - an
          // off-screen element with no size copies nothing - so it is placed
          // behind the page at full opacity-zero rather than hidden.
          function selectionCopy() {
            var holder = document.createElement("div");
            holder.setAttribute(
              "style",
              "position:fixed; left:0; top:0; width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none; white-space:normal"
            );
            holder.appendChild(buildClipboardFragment(source));
            document.body.appendChild(holder);

            var range = document.createRange();
            range.selectNodeContents(holder);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            var copied = false;
            try {
              copied = document.execCommand("copy");
            } catch (error) {
              copied = false;
            }
            selection.removeAllRanges();
            holder.remove();
            return copied;
          }

          if (selectionCopy()) {
            done("Copied");
            return;
          }

          // Only if the selection route failed: the async API still carries the
          // html flavour, it is just less widely honoured by paste targets.
          if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
            navigator.clipboard
              .write([
                new ClipboardItem({
                  "text/html": new Blob([buildClipboardHtml(source)], { type: "text/html" }),
                  "text/plain": new Blob([source.innerText], { type: "text/plain" }),
                }),
              ])
              .then(function() { done("Copied"); })
              .catch(function() { done("Copy failed"); });
            return;
          }

          done("Copy failed");
        }

        function closeCreateDialog() {
          var dialog = document.querySelector("[data-wiki-create-dialog]");
          if (!dialog) return;
          var form = dialog.querySelector("[data-wiki-create]");
          if (form) form.reset();
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }

        // Clicking the backdrop closes the dialog, matching normal modal
        // behaviour (Esc is handled natively by <dialog>).
        (function() {
          var dialog = document.querySelector("[data-wiki-create-dialog]");
          if (dialog) {
            dialog.addEventListener("click", function(event) {
              if (event.target === dialog) closeCreateDialog();
            });
          }

          var categoriesDialog = document.querySelector("[data-wiki-categories-dialog]");
          if (categoriesDialog) {
            categoriesDialog.addEventListener("click", function(event) {
              // Closing reloads, so renames and deletes are reflected in the list.
              if (event.target === categoriesDialog) window.location.reload();
            });
          }
        })();

        // --- Article body editor -------------------------------------------
        var root = document.querySelector("[data-wiki-editor]");
        var content = root ? root.querySelector("[data-wiki-content]") : null;

        function normalizeContainerMarkup(container) {
          container.querySelectorAll("div").forEach(function(div) {
            var paragraph = document.createElement("p");
            while (div.firstChild) paragraph.appendChild(div.firstChild);
            div.replaceWith(paragraph);
          });
        }

        // Whether the user changed the category select this session. Sending a
        // category locks it against the AI forever, so it is only sent when the
        // user actually picked one. A "change" event fires on user choice only,
        // never on the programmatic write Regenerate does.
        var categoryTouched = false;
        var categorySelect = root ? root.querySelector('[data-wiki-edit] select[name="category"]') : null;
        if (categorySelect) {
          categorySelect.addEventListener("change", function() { categoryTouched = true; });
        }

        function collectPayload() {
          if (!root) return null;
          var form = root.querySelector("[data-wiki-edit]");
          var payload = form ? formData(form, true) : {};
          if (!categoryTouched) delete payload.category;
          if (content) {
            var clone = content.cloneNode(true);
            normalizeContainerMarkup(clone);
            payload.contentHtml = clone.innerHTML;
          }
          return payload;
        }

        function saveArticle(silent) {
          if (!root) return;
          var id = root.getAttribute("data-wiki-id");
          var payload = collectPayload();
          if (!payload) return;
          setStatus("Saving...");
          postSilent("/api/wiki/" + id, payload).then(function(result) {
            if (result === null) {
              setStatus("Save failed — check your connection and try again");
              return;
            }
            setStatus("Saved " + new Date().toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }));
            if (!silent) reload();
          });
        }

        // Whether the body changed this session. A summary is only worth
        // regenerating when the content it describes has actually moved on.
        var contentChanged = false;

        if (content) {
          document.execCommand("defaultParagraphSeparator", false, "p");
          content.addEventListener("input", function() { contentChanged = true; });
          content.addEventListener("paste", function(event) {
            // Paste as plain text so pasted markup can't smuggle in styles the
            // sanitiser would strip anyway.
            event.preventDefault();
            var text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
            document.execCommand("insertText", false, text);
          });
          content.addEventListener("blur", function() { saveArticle(true); });

          // Tab nests a bullet under the one above it, the way every other
          // editor behaves. Without this Tab moves focus out of the editor and
          // there is no way to make a sub-bullet at all.
          content.addEventListener("keydown", function(event) {
            if (event.key !== "Tab") return;
            var selection = window.getSelection();
            var node = selection && selection.anchorNode;
            var element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
            // Outside a list, leave Tab alone so it still moves focus onward.
            if (!element || !element.closest("li")) return;
            event.preventDefault();
            document.execCommand(event.shiftKey ? "outdent" : "indent");
          });
        }

        document.addEventListener("click", function(event) {
          var el = event.target instanceof Element
            ? event.target.closest("[data-wiki-action], [data-wiki-cmd], [data-wiki-save], [data-wiki-copy], [data-wiki-add], [data-wiki-create-cancel], [data-wiki-regenerate], [data-wiki-categories], [data-wiki-categories-close], [data-wiki-category-delete], [data-wiki-done-editing]")
            : null;
          if (!el) return;

          var cmd = el.getAttribute("data-wiki-cmd");
          if (cmd) {
            event.preventDefault();
            if (content) content.focus();
            if (cmd === "createLink") {
              var url = window.prompt("Link URL");
              if (url) document.execCommand("createLink", false, url);
            } else {
              document.execCommand(cmd, false, el.getAttribute("data-wiki-value") || undefined);
            }
            return;
          }

          if (el.hasAttribute("data-wiki-done-editing")) {
            event.preventDefault();
            var target = el.getAttribute("href");
            var doneId = el.getAttribute("data-wiki-id");
            var payload = collectPayload() || {};

            // Navigate straight away. One request carries the edits and asks
            // for the summary; the server saves first, then summarises in the
            // background. keepalive lets it complete after this page is gone.
            fetch("/api/wiki/" + doneId + "/finish-editing", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ contentChanged: contentChanged, article: payload }),
              keepalive: true,
            }).catch(function() {});

            window.location.href = target;
            return;
          }

          if (el.hasAttribute("data-wiki-categories")) {
            event.preventDefault();
            openDialog("[data-wiki-categories-dialog]");
            return;
          }

          if (el.hasAttribute("data-wiki-categories-close")) {
            event.preventDefault();
            // Renames and deletes change the list grouping, so reload to show it.
            window.location.reload();
            return;
          }

          if (el.hasAttribute("data-wiki-category-delete")) {
            event.preventDefault();
            var delRow = el.closest("[data-wiki-category-id]");
            if (!delRow) return;
            var delName = delRow.querySelector("[data-wiki-category-name]");
            var label = delName ? delName.value : "this category";
            if (!window.confirm('Delete "' + label + '"? Its articles move to General.')) return;
            categoryRequest("/api/wiki/categories/" + delRow.getAttribute("data-wiki-category-id") + "/delete", {}, function(payload) {
              delRow.remove();
              setCategoryStatus(
                payload.moved > 0
                  ? "Deleted. " + payload.moved + " article" + (payload.moved === 1 ? "" : "s") + " moved to General."
                  : "Deleted."
              );
            });
            return;
          }

          if (el.hasAttribute("data-wiki-add")) {
            event.preventDefault();
            var dialog = document.querySelector("[data-wiki-create-dialog]");
            if (dialog) {
              if (typeof dialog.showModal === "function") dialog.showModal();
              else dialog.setAttribute("open", "open");
              var titleInput = dialog.querySelector('input[name="title"]');
              if (titleInput) titleInput.focus();
            }
            return;
          }

          if (el.hasAttribute("data-wiki-create-cancel")) {
            event.preventDefault();
            closeCreateDialog();
            return;
          }

          if (el.hasAttribute("data-wiki-regenerate")) {
            event.preventDefault();
            if (!root) return;
            var regenId = root.getAttribute("data-wiki-id");
            var regenLabel = el.querySelector("span");
            var previousLabel = regenLabel ? regenLabel.textContent : "";
            el.disabled = true;
            if (regenLabel) regenLabel.textContent = "Rewriting...";
            // Save first, so the model classifies what is on screen now.
            saveArticle(true);
            fetch("/api/wiki/" + regenId + "/generate-tags", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            })
              .then(function(response) { return response.json(); })
              .then(function(payload) {
                if (payload && payload.ok) {
                  var tagsField = document.querySelector("[data-wiki-tags-field]");
                  if (tagsField) tagsField.value = (payload.tags || []).join(", ");
                  var categoryField = document.querySelector('[data-wiki-edit] select[name="category"]');
                  if (categoryField && payload.category) categoryField.value = payload.category;
                  var summaryField = document.querySelector('[data-wiki-edit] input[name="summary"]');
                  if (summaryField && payload.summary) summaryField.value = payload.summary;
                  setStatus("Summary, category and tags updated");
                } else {
                  setStatus((payload && payload.error) || "Could not regenerate");
                }
              })
              .catch(function() { setStatus("Could not regenerate"); })
              .finally(function() {
                el.disabled = false;
                if (regenLabel) regenLabel.textContent = previousLabel;
              });
            return;
          }

          if (el.hasAttribute("data-wiki-save")) {
            event.preventDefault();
            saveArticle(false);
            return;
          }

          if (el.hasAttribute("data-wiki-copy")) {
            event.preventDefault();
            // Copy works from the reader as well as the editor.
            var source = content || document.querySelector("[data-wiki-article-body]");
            if (!source) return;
            copyRichText(el, source);
            return;
          }

          var action = el.getAttribute("data-wiki-action");
          var articleId = el.getAttribute("data-wiki-id");
          if (action === "delete") {
            event.preventDefault();
            if (window.confirm("Delete this article? This cannot be undone. Archive it instead to keep it.")) {
              post("/api/wiki/" + articleId + "/delete", {}, inArticleReader(el) ? "/wiki" : null);
            }
            return;
          }
          if (action === "archive") {
            event.preventDefault();
            // Reversible, so it does not need a confirmation the way delete does.
            post("/api/wiki/" + articleId + "/archive", { isArchived: true }, inArticleReader(el) ? "/wiki" : null);
            return;
          }
          if (action === "restore") {
            event.preventDefault();
            post(
              "/api/wiki/" + articleId + "/archive",
              { isArchived: false },
              inArticleReader(el) ? "/wiki?panel=wiki-article&article=" + encodeURIComponent(articleId) : null
            );
            return;
          }
          if (action === "duplicate") {
            event.preventDefault();
            post("/api/wiki/" + articleId + "/duplicate", {});
            return;
          }
          if (action === "pin") {
            event.preventDefault();
            post("/api/wiki/" + articleId + "/pin", { isPinned: el.getAttribute("aria-pressed") !== "true" });
            return;
          }
        });

        document.addEventListener("submit", function(event) {
          var form = event.target;
          if (!(form instanceof HTMLFormElement)) return;

          if (form.hasAttribute("data-wiki-create")) {
            event.preventDefault();
            fetch("/api/wiki", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(formData(form)),
            })
              .then(function(response) { return response.json(); })
              .then(function(result) {
                if (result && result.id) {
                  window.location.href = "/wiki?panel=wiki-editor&article=" + encodeURIComponent(String(result.id));
                } else {
                  reload();
                }
              })
              .catch(function() {
                window.alert("That article couldn't be created. Please try again.");
              });
            return;
          }

          if (form.hasAttribute("data-wiki-edit")) {
            event.preventDefault();
            saveArticle(false);
            return;
          }

          if (form.hasAttribute("data-wiki-category-create")) {
            event.preventDefault();
            var nameInput = form.querySelector('input[name="name"]');
            var newName = nameInput ? nameInput.value.trim() : "";
            if (!newName) return;
            categoryRequest("/api/wiki/categories", { name: newName }, function() {
              window.location.reload();
            });
            return;
          }
        });

        // Field edits autosave on blur/change, matching the JD editor, so the
        // explicit Save button is a confirmation rather than the only path.
        document.addEventListener("blur", function(event) {
          if (!(event.target instanceof Element)) return;

          // Category renames save on blur, like every other field in the app.
          var categoryField = event.target.closest("[data-wiki-category-name]");
          if (categoryField) {
            var categoryRow = categoryField.closest("[data-wiki-category-id]");
            if (!categoryRow) return;
            var nextName = categoryField.value.trim();
            var previousName = categoryField.getAttribute("data-previous-name") || categoryField.defaultValue;
            if (!nextName || nextName === previousName) return;
            categoryRequest(
              "/api/wiki/categories/" + categoryRow.getAttribute("data-wiki-category-id"),
              { name: nextName },
              function() {
                categoryField.setAttribute("data-previous-name", nextName);
                setCategoryStatus("Renamed.");
              }
            );
            return;
          }

          var field = event.target.closest("[data-wiki-edit] input");
          if (!field || field.type === "checkbox") return;
          saveArticle(true);
        }, true);

        document.addEventListener("change", function(event) {
          var field = event.target instanceof Element
            ? event.target.closest('[data-wiki-edit] input[type="checkbox"], [data-wiki-edit] select')
            : null;
          if (!field) return;
          saveArticle(true);
        });

        // --- Local AI readiness --------------------------------------------
        // The page never blocks on Ollama; it renders and reports progress
        // here while the server warms the runtime in the background.
        (function() {
          var banner = document.querySelector("[data-wiki-ai-status]");
          if (!banner) return;
          var regenerate = document.querySelector("[data-wiki-regenerate]");

          function apply(ready) {
            // Renders hidden, so a ready runtime never flashes a warning; it
            // only appears once a poll confirms the runtime is still warming.
            banner.hidden = ready;
            if (regenerate) regenerate.disabled = !ready;
          }

          function poll(attempt) {
            fetch("/api/ai/status", { cache: "no-store" })
              .then(function(res) { return res.json(); })
              .then(function(status) {
                if (status && status.ready) {
                  apply(true);
                  return;
                }
                apply(false);
                if (attempt < 30) setTimeout(function() { poll(attempt + 1); }, 2000);
                else banner.textContent = "Local AI is not responding. Tag generation is unavailable.";
              })
              .catch(function() {
                if (attempt < 30) setTimeout(function() { poll(attempt + 1); }, 2000);
              });
          }

          poll(0);
        })();

        // --- Background tagging ---------------------------------------------
        // A newly written article is classified in the background, so any row
        // still showing "Tagging..." polls until its tags land.
        (function() {
          var pending = document.querySelectorAll("[data-wiki-tagging]");
          if (pending.length === 0) return;
          var attempts = 0;
          // Tagging retries with a backoff when the model is busy, so keep
          // watching for a few minutes rather than giving up after one pass.
          var maxAttempts = 60;
          var timer = setInterval(function() {
            attempts++;
            if (attempts > maxAttempts) { clearInterval(timer); return; }
            fetch(window.location.href, { cache: "no-store" })
              .then(function(res) { return res.text(); })
              .then(function(html) {
                // If the server no longer reports a pending row, the tags have
                // landed; reload once to show them.
                if (html.indexOf("data-wiki-tagging") === -1) {
                  clearInterval(timer);
                  window.location.reload();
                }
              })
              .catch(function() {});
          }, 4000);
        })();
      })();
    </script>
  `;
}

export function renderWikiAppShell(options: WikiAppShellOptions): string {
  const focusPanelId = resolveWikiFocusPanelId(options.focusPanelId);

  // The reader and editor both need a selected article. Without one they render
  // nothing but a placeholder, so on the bare /wiki list view they are left out
  // entirely rather than sitting there as sections that can never fill in.
  const visiblePanels = PANEL_DEFINITIONS.filter((panel) => {
    if (panel.id === "wiki-article") return options.article.article != null;
    if (panel.id === "wiki-editor") return options.editor.article != null;
    return true;
  });

  const panelContent = visiblePanels.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: renderPanelActions(panel.id, options),
    children: renderPanelContent(panel.id, options),
  }));
  const layout = renderLayout({ panels: panelContent, focusPanelId });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Things To Know</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="app-shell-body">
    <aside class="nav-rail" aria-label="Primary navigation">
      <a class="nav-rail__item" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/tasks" aria-label="Tasks" title="Tasks"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/jd" aria-label="Job Descriptions" title="Job Descriptions"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
      <a class="nav-rail__item nav-rail__item--current" href="/wiki" aria-label="Things To Know" title="Things To Know" aria-current="page"><i class="bi bi-journal-bookmark" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderWikiScript()}
  </body>
</html>`;
}

export { VALID_WIKI_PANEL_IDS };
