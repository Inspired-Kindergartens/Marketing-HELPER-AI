import type { JobDescriptionView, JdBlurbVersion } from "../../storage/jd-store.js";
import { NZ_TIME_ZONE } from "./jd-date.js";
import { buildJdWebsitePageTitle } from "./jd-email.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NZ", { timeZone: NZ_TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export type JdBlurbPanelOptions = {
  jobDescription: JobDescriptionView | null;
  boilerplateHtml: string;
  versions: JdBlurbVersion[];
};

export function renderJdBlurbPanel(options: JdBlurbPanelOptions): string {
  const jd = options.jobDescription;

  if (!jd) {
    return `<div class="jd-blurb jd-blurb--empty"><p>Select a job description from the list to write its website blurb.</p></div>`;
  }

  const versionsList = options.versions
    .map(
      (version) => `
        <li class="jd-blurb__version">
          <button type="button" class="jd-blurb__version-restore" data-blurb-restore="${version.id}">
            <span class="jd-blurb__version-date">${escapeHtml(formatTimestamp(version.savedAt))}</span>
            <span class="jd-blurb__version-preview">${escapeHtml(version.contentHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 80))}</span>
          </button>
        </li>
      `,
    )
    .join("");

  return `
    <div class="jd-blurb" data-jd-blurb data-jd-id="${jd.id}">
      <div class="jd-blurb__toolbar" data-blurb-toolbar>
        <button type="button" data-blurb-cmd="formatBlock" data-blurb-value="H1" title="Heading 1"><i class="bi bi-type-h1 ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="formatBlock" data-blurb-value="H2" title="Heading 2"><i class="bi bi-type-h2 ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="formatBlock" data-blurb-value="H3" title="Heading 3"><i class="bi bi-type-h3 ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="formatBlock" data-blurb-value="P" title="Paragraph"><i class="bi bi-paragraph ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="bold" title="Bold"><i class="bi bi-type-bold ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="italic" title="Italic"><i class="bi bi-type-italic ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="insertUnorderedList" title="Bullet list"><i class="bi bi-list-ul ui-icon" aria-hidden="true"></i></button>
        <button type="button" data-blurb-cmd="createLink" title="Hyperlink"><i class="bi bi-link-45deg ui-icon" aria-hidden="true"></i></button>
        <button type="button" class="jd-blurb__generate" data-blurb-generate><i class="bi bi-stars ui-icon" aria-hidden="true"></i><span>Generate with AI</span></button>
        <button type="button" class="jd-blurb__copy" data-blurb-copy><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy to clipboard</span></button>
        <button type="button" class="jd-blurb__copy" data-blurb-copy-title data-page-title="${escapeHtml(buildJdWebsitePageTitle(jd))}"><i class="bi bi-clipboard ui-icon" aria-hidden="true"></i><span>Copy Website Page Title</span></button>
      </div>

      <div class="jd-blurb__editor" data-blurb-editor contenteditable="true">${jd.blurbHtml ?? "<p>No blurb yet — a first draft may still be generating in the background (usually under a minute), or click Generate with AI.</p>"}</div>

      <div class="jd-blurb__boilerplate" data-blurb-boilerplate aria-label="Locked boilerplate (appended automatically)">
        ${options.boilerplateHtml}
      </div>

      <button type="button" class="jd-blurb__save" data-blurb-save><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>

      <div class="jd-blurb__versions">
        <h3>Version history</h3>
        <ul>${versionsList || `<li class="jd-blurb__version-empty">No saved versions yet.</li>`}</ul>
      </div>
    </div>

    <script>
      (function() {
        var root = document.querySelector('[data-jd-blurb][data-jd-id="${jd.id}"]');
        if (!root) return;
        var editor = root.querySelector("[data-blurb-editor]");
        var boilerplate = root.querySelector("[data-blurb-boilerplate]");
        if (!editor || !boilerplate) return;
        var jdId = root.getAttribute("data-jd-id");

        function resizeEditor() {
          editor.style.height = "auto";
          editor.style.height = editor.scrollHeight + "px";
        }

        function normalizeContainerMarkup(container) {
          container.querySelectorAll("div").forEach(function(div) {
            var paragraph = document.createElement("p");
            while (div.firstChild) paragraph.appendChild(div.firstChild);
            div.replaceWith(paragraph);
          });

          Array.prototype.slice.call(container.childNodes).forEach(function(node) {
            if (node.nodeType !== Node.TEXT_NODE) return;
            var normalized = (node.textContent || "").replace(/\\r\\n?/g, "\\n");
            if (!normalized.trim()) {
              node.remove();
              return;
            }

            var fragment = document.createDocumentFragment();
            normalized.split(/\\n{2,}/).forEach(function(paragraphText) {
              var cleanText = paragraphText.replace(/\\n+/g, " ").trim();
              if (!cleanText) return;
              var paragraph = document.createElement("p");
              paragraph.textContent = cleanText;
              fragment.appendChild(paragraph);
            });
            node.replaceWith(fragment);
          });
        }

        function normalizeEditorMarkup() {
          normalizeContainerMarkup(editor);
        }

        function cleanEditorClone() {
          var clone = editor.cloneNode(true);
          normalizeContainerMarkup(clone);
          clone.querySelectorAll("p").forEach(function(paragraph) {
            if (!paragraph.textContent.trim()) paragraph.remove();
          });
          return clone;
        }

        function insertPlainText(text) {
          var normalized = text.replace(/\\r\\n?/g, "\\n").trim();
          if (!normalized) return;
          var selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            document.execCommand("insertText", false, normalized);
            return;
          }

          var range = selection.getRangeAt(0);
          range.deleteContents();

          if (normalized.indexOf("\\n") === -1) {
            range.insertNode(document.createTextNode(normalized));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
          }

          var fragment = document.createDocumentFragment();
          normalized.split(/\\n{2,}/).forEach(function(paragraphText) {
            var cleanText = paragraphText.replace(/\\n+/g, " ").trim();
            if (!cleanText) return;
            var paragraph = document.createElement("p");
            paragraph.textContent = cleanText;
            fragment.appendChild(paragraph);
          });
          range.insertNode(fragment);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        document.execCommand("defaultParagraphSeparator", false, "p");
        normalizeEditorMarkup();
        resizeEditor();
        editor.addEventListener("input", function() {
          normalizeEditorMarkup();
          resizeEditor();
        });
        editor.addEventListener("paste", function(event) {
          event.preventDefault();
          var text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
          insertPlainText(text);
          normalizeEditorMarkup();
          resizeEditor();
        });

        // If there's no blurb yet, a background auto-generation may still be
        // running (kicked off when the JD was created). Poll for it to land
        // and reload once, instead of leaving the user to guess and refresh
        // manually.
        ${jd.blurbHtml == null ? `
        (function pollForBlurb() {
          var attempts = 0;
          var maxAttempts = 45; // ~2.25 minutes at 3s intervals, headroom over the server-side AI timeout
          var interval = setInterval(function() {
            attempts++;
            if (attempts > maxAttempts) { clearInterval(interval); return; }
            fetch("/api/jd/" + jdId + "/blurb/status")
              .then(function(res) { return res.ok ? res.json() : null; })
              .then(function(payload) {
                if (payload && payload.hasBlurb) {
                  clearInterval(interval);
                  window.location.reload();
                }
              })
              .catch(function() { /* keep polling */ });
          }, 3000);
        })();
        ` : ""}

        root.querySelectorAll("[data-blurb-cmd]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            editor.focus();
            var cmd = btn.getAttribute("data-blurb-cmd");
            var value = btn.getAttribute("data-blurb-value") || undefined;
            if (cmd === "createLink") {
              var url = window.prompt("Link URL");
              if (!url) return;
              document.execCommand("createLink", false, url);
              return;
            }
            document.execCommand(cmd, false, value);
          });
        });

        var generateBtn = root.querySelector("[data-blurb-generate]");
        if (generateBtn) {
          var generateLabel = generateBtn.querySelector("span");
          var generateIcon = generateBtn.querySelector("i");
          var generateDefaultLabel = generateLabel ? generateLabel.textContent : "";
          var generateDefaultIconClass = generateIcon ? generateIcon.className : "";

          generateBtn.addEventListener("click", function() {
            generateBtn.disabled = true;
            if (generateLabel) generateLabel.textContent = "Generating… (usually under a minute)";
            if (generateIcon) generateIcon.className = "bi bi-arrow-repeat ui-icon panel-action-button__spinner";

            fetch("/api/jd/" + jdId + "/blurb/generate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
              .then(function(res) {
                return res.json().catch(function () { return {}; }).then(function (payload) {
                  if (!res.ok) throw new Error(payload.error || "Generate failed");
                  return payload;
                });
              })
              .then(function(payload) {
                if (payload.html) {
                  editor.innerHTML = payload.html;
                  resizeEditor();
                }
                window.location.reload();
              })
              .catch(function(error) {
                window.alert(error && error.message ? error.message : "Blurb generation failed. Please try again.");
                generateBtn.disabled = false;
                if (generateLabel) generateLabel.textContent = generateDefaultLabel;
                if (generateIcon) generateIcon.className = generateDefaultIconClass;
              });
          });
        }

        var saveBtn = root.querySelector("[data-blurb-save]");
        if (saveBtn) {
          saveBtn.addEventListener("click", function() {
            normalizeEditorMarkup();
            fetch("/api/jd/" + jdId + "/blurb", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ html: cleanEditorClone().innerHTML }),
            })
              .then(function(res) { if (!res.ok) throw new Error("Save failed"); window.location.reload(); })
              .catch(function() { window.alert("Blurb save failed. Please try again."); });
          });
        }

        root.querySelectorAll("[data-blurb-restore]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            var blurbId = btn.getAttribute("data-blurb-restore");
            fetch("/api/jd/" + jdId + "/blurb/" + blurbId + "/restore", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
              .then(function(res) { if (!res.ok) throw new Error("Restore failed"); window.location.reload(); })
              .catch(function() { window.alert("Restore failed. Please try again."); });
          });
        });

        var copyTitleBtn = root.querySelector("[data-blurb-copy-title]");
        if (copyTitleBtn) {
          copyTitleBtn.addEventListener("click", function() {
            navigator.clipboard.writeText(copyTitleBtn.getAttribute("data-page-title") || "");
          });
        }

        var copyBtn = root.querySelector("[data-blurb-copy]");
        if (copyBtn) {
          copyBtn.addEventListener("click", function() {
            normalizeEditorMarkup();
            var cleanEditor = cleanEditorClone();
            var html = cleanEditor.innerHTML + boilerplate.innerHTML;
            var text = cleanEditor.innerText + "\\n\\n" + boilerplate.innerText;
            if (window.ClipboardItem) {
              var item = new window.ClipboardItem({
                "text/html": new Blob([html], { type: "text/html" }),
                "text/plain": new Blob([text], { type: "text/plain" }),
              });
              navigator.clipboard.write([item]).catch(function() {
                navigator.clipboard.writeText(text);
              });
            } else {
              navigator.clipboard.writeText(text);
            }
          });
        }
      })();
    </script>
  `;
}
