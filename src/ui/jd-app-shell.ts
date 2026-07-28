import { renderLayout } from "./layout.js";
import { renderJdListPanel, type JdListPanelOptions } from "./jd/jd-list-panel.js";
import { renderJdEditorPanel, type JdEditorPanelOptions } from "./jd/jd-editor-panel.js";
import { renderJdBlurbPanel, type JdBlurbPanelOptions } from "./jd/jd-blurb-panel.js";
import { renderJdSettingsPanel, type JdSettingsPanelOptions } from "./jd/jd-settings-panel.js";

const PANEL_DEFINITIONS = [
  { id: "jd-list", title: "Job Descriptions", className: "panel--jd-list" },
  { id: "jd-editor", title: "JD Editor", className: "panel--jd-editor" },
  { id: "jd-blurb", title: "Website Blurb", className: "panel--jd-blurb" },
  { id: "jd-settings", title: "Settings", className: "panel--jd-settings" },
] as const;

const VALID_JD_PANEL_IDS = new Set<string>(PANEL_DEFINITIONS.map((panel) => panel.id));

export function resolveJdFocusPanelId(input?: string | null) {
  return input && VALID_JD_PANEL_IDS.has(input) ? input : null;
}

export type JdAppShellOptions = {
  focusPanelId?: string | null;
  list: JdListPanelOptions;
  editor: JdEditorPanelOptions;
  blurb: JdBlurbPanelOptions;
  settings: JdSettingsPanelOptions;
};

function renderPanelContent(panelId: string, options: JdAppShellOptions): string {
  if (panelId === "jd-editor") return renderJdEditorPanel(options.editor);
  if (panelId === "jd-blurb") return renderJdBlurbPanel(options.blurb);
  if (panelId === "jd-settings") return renderJdSettingsPanel(options.settings);
  return renderJdListPanel(options.list);
}

// One delegated client script for every mutation in the section, matching the
// Tasks/Comms convention: JSON POST that reloads on success.
function renderJdScript(): string {
  return `
    <script>
      (function() {
        function reload() { window.location.reload(); }

        async function post(url, payload) {
          try {
            var response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
            });
            if (!response.ok) throw new Error("Request failed");
            reload();
            return true;
          } catch (error) {
            window.alert("That action couldn't be saved. Please try again.");
            return false;
          }
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
            window.alert("That action couldn't be saved. Please try again.");
            return null;
          }
        }

        function formData(form, includeEmpty) {
          var data = {};
          new FormData(form).forEach(function(value, key) {
            var trimmed = typeof value === "string" ? value.trim() : value;
            if (includeEmpty || trimmed !== "") data[key] = trimmed;
          });
          return data;
        }

        function roleSectionMarkup(sectionIndex) {
          return [
            '<section class="jd-editor__role-section" data-section-index="' + sectionIndex + '">',
            '<div class="jd-editor__role-section-actions">',
            '<input type="text" class="jd-editor__role-heading" name="roleSections[' + sectionIndex + '][heading]" value="" placeholder="Section heading" />',
            '<button type="button" class="jd-editor__mini-button" data-jd-remove-role-section title="Remove section"><i class="bi bi-trash ui-icon" aria-hidden="true"></i></button>',
            '</div>',
            '<textarea name="roleSections[' + sectionIndex + '][intro]" placeholder="Intro sentence"></textarea>',
            '<ul class="jd-editor__role-bullets"></ul>',
            '<button type="button" class="jd-editor__inline-button" data-jd-add-role-bullet><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add bullet</span></button>',
            '</section>'
          ].join("");
        }

        function roleBulletMarkup(sectionIndex, bulletIndex) {
          return [
            '<li>',
            '<input type="text" class="jd-editor__bullet-text" name="roleSections[' + sectionIndex + '][bullets][' + bulletIndex + '][text]" value="" placeholder="Bullet text" />',
            '<button type="button" class="jd-editor__mini-button" data-jd-remove-role-bullet title="Remove bullet"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>',
            '</li>'
          ].join("");
        }

        function openDatePicker(button) {
          var combo = button.closest(".jd-editor__date-combo");
          var picker = combo ? combo.querySelector("[data-jd-date-picker]") : null;
          var text = combo ? combo.querySelector("[data-jd-date-text]") : null;
          if (!(picker instanceof HTMLInputElement) || !(text instanceof HTMLInputElement)) return;
          picker.value = text.value;
          if (typeof picker.showPicker === "function") {
            picker.showPicker();
          } else {
            picker.click();
          }
        }

        function syncDatePickerValue(picker) {
          var combo = picker.closest(".jd-editor__date-combo");
          var text = combo ? combo.querySelector("[data-jd-date-text]") : null;
          if (!(text instanceof HTMLInputElement)) return;
          text.value = picker.value;
          autosaveJdEdit(text);
        }

        document.addEventListener("click", function(event) {
          var el = event.target instanceof Element
            ? event.target.closest("[data-jd-action], [data-jd-open-date-picker], [data-jd-add-role-section], [data-jd-add-role-bullet], [data-jd-remove-role-section], [data-jd-remove-role-bullet]")
            : null;
          if (!el) return;
          var action = el.getAttribute("data-jd-action");
          var host = el.closest("[data-jd-id]");
          var jdId = el.getAttribute("data-jd-id") || (host && host.getAttribute("data-jd-id"));

          if (el.hasAttribute("data-jd-open-date-picker")) {
            event.preventDefault();
            openDatePicker(el);
            return;
          }

          if (action === "delete") {
            event.preventDefault();
            if (window.confirm("Delete this job description?")) post("/api/jd/" + jdId + "/delete", {});
            return;
          }
          if (action === "duplicate") {
            event.preventDefault();
            post("/api/jd/" + jdId + "/duplicate", {});
            return;
          }
          if (action === "pdf") {
            event.preventDefault();
            var editForm = el.closest("[data-jd-edit]");
            if (editForm) {
              postSilent("/api/jd/" + jdId, formData(editForm, true)).then(function (result) {
                if (result !== null) window.location.href = "/api/jd/" + jdId + "/pdf";
              });
              return;
            }
            window.location.href = "/api/jd/" + jdId + "/pdf";
            return;
          }

          if (el.hasAttribute("data-jd-add-role-section")) {
            event.preventDefault();
            var roles = el.closest(".jd-editor__roles");
            if (!roles) return;
            var sections = roles.querySelectorAll(".jd-editor__role-section");
            var nextSectionIndex = Array.prototype.reduce.call(sections, function(max, section) {
              return Math.max(max, Number(section.getAttribute("data-section-index") || -1));
            }, -1) + 1;
            el.insertAdjacentHTML("beforebegin", roleSectionMarkup(nextSectionIndex));
            return;
          }
          if (el.hasAttribute("data-jd-add-role-bullet")) {
            event.preventDefault();
            var section = el.closest(".jd-editor__role-section");
            if (!section) return;
            var sectionIndex = section.getAttribute("data-section-index") || "0";
            var list = section.querySelector(".jd-editor__role-bullets");
            if (!list) return;
            var nextBulletIndex = Array.prototype.reduce.call(list.querySelectorAll("li"), function(max, item) {
              var input = item.querySelector("[name*='[bullets]']");
              var match = input ? /\\[bullets\\]\\[(\\d+)\\]/.exec(input.getAttribute("name") || "") : null;
              return Math.max(max, match ? Number(match[1]) : -1);
            }, -1) + 1;
            list.insertAdjacentHTML("beforeend", roleBulletMarkup(sectionIndex, nextBulletIndex));
            return;
          }
          if (el.hasAttribute("data-jd-remove-role-section")) {
            event.preventDefault();
            var sectionToRemove = el.closest(".jd-editor__role-section");
            if (sectionToRemove) sectionToRemove.remove();
            return;
          }
          if (el.hasAttribute("data-jd-remove-role-bullet")) {
            event.preventDefault();
            var bulletToRemove = el.closest("li");
            if (bulletToRemove) bulletToRemove.remove();
            return;
          }
        });

        document.addEventListener("submit", function(event) {
          var form = event.target;
          if (!(form instanceof HTMLFormElement)) return;

          if (form.hasAttribute("data-jd-create")) {
            event.preventDefault();
            post("/api/jd", formData(form));
            return;
          }
          if (form.hasAttribute("data-jd-edit")) {
            event.preventDefault();
            var host = form.closest("[data-jd-id]");
            post("/api/jd/" + host.getAttribute("data-jd-id"), formData(form, true));
            return;
          }
          if (form.hasAttribute("data-jd-centre-profile")) {
            event.preventDefault();
            var centreKey = form.getAttribute("data-centre-key");
            post("/api/jd/settings/centre/" + centreKey, formData(form));
            return;
          }
          if (form.hasAttribute("data-jd-title-profile")) {
            event.preventDefault();
            post("/api/jd/settings/title", formData(form));
            return;
          }
          if (form.hasAttribute("data-jd-knowledge-doc")) {
            event.preventDefault();
            post("/api/jd/settings/knowledge-doc", formData(form));
            return;
          }
          if (form.hasAttribute("data-jd-ktca-import")) {
            event.preventDefault();
            var fd = new FormData(form);
            fetch("/api/jd/settings/ktca-import", { method: "POST", body: fd })
              .then(function (response) { return response.json(); })
              .then(function (payload) {
                var status = document.querySelector("[data-ktca-import-status]");
                if (status) status.textContent = payload.message || "Import processed.";
              })
              .catch(function () {
                window.alert("KTCA import failed. Please try again.");
              });
            return;
          }
        });

        // The JD editor autosaves as you go, matching the Tasks editor: text
        // and textarea fields save on blur (not per keystroke), selects save
        // on change. Silent — no reload, so focus/scroll isn't disturbed.
        // The explicit Save button still does a full save + reload.
        function autosaveJdEdit(field) {
          var form = field.closest("[data-jd-edit]");
          if (!form) return;
          var host = form.closest("[data-jd-id]");
          if (!host) return;
          postSilent("/api/jd/" + host.getAttribute("data-jd-id"), formData(form, true));
        }

        document.addEventListener("blur", function(event) {
          var field = event.target instanceof Element ? event.target.closest("[data-jd-edit] input, [data-jd-edit] textarea") : null;
          if (!field) return;
          autosaveJdEdit(field);
        }, true);

        document.addEventListener("change", function(event) {
          var field = event.target instanceof Element
            ? event.target.closest("[data-jd-edit] select, [data-jd-edit] [data-jd-date-picker]")
            : null;
          if (!field) return;
          if (field instanceof HTMLInputElement && field.hasAttribute("data-jd-date-picker")) {
            syncDatePickerValue(field);
            return;
          }
          autosaveJdEdit(field);
        });

        window.__jdPost = post;
        window.__jdPostSilent = postSilent;
      })();
    </script>
  `;
}

export function renderJdAppShell(options: JdAppShellOptions): string {
  const focusPanelId = resolveJdFocusPanelId(options.focusPanelId);

  const panelContent = PANEL_DEFINITIONS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    children: renderPanelContent(panel.id, options),
  }));
  const layout = renderLayout({ panels: panelContent, focusPanelId });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Job Descriptions</title>
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
      <a class="nav-rail__item nav-rail__item--current" href="/jd" aria-label="Job Descriptions" title="Job Descriptions" aria-current="page"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderJdScript()}
  </body>
</html>`;
}

export { VALID_JD_PANEL_IDS };
