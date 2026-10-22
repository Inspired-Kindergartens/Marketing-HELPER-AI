import { renderLayout } from "./layout.js";
import { renderJdListPanel, type JdListPanelOptions } from "./jd/jd-list-panel.js";
import { renderJdEditorPanel, type JdEditorPanelOptions } from "./jd/jd-editor-panel.js";
import { renderJdBlurbPanel, type JdBlurbPanelOptions } from "./jd/jd-blurb-panel.js";
import { renderJdSettingsPanel, type JdSettingsPanelOptions } from "./jd/jd-settings-panel.js";
import {
  JD_APPROVAL_DEADLINE_TOKEN,
  JD_APPROVAL_EMAIL_SUBJECT,
  buildJdApprovalEmailText,
  buildJdGenerateEmailHref,
  formatJdLocationDisplay,
} from "./jd/jd-email.js";
import type { CentreContact } from "../storage/centre-contact-store.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";

const PANEL_DEFINITIONS = [
  { id: "jd-list", title: "Job Descriptions", className: "panel--jd-list panel--scroll" },
  { id: "jd-editor", title: "JD Editor", className: "panel--jd-editor panel--scroll" },
  { id: "jd-blurb", title: "Website Blurb", className: "panel--jd-blurb panel--scroll" },
  { id: "jd-settings", title: "Settings", className: "panel--jd-settings panel--scroll" },
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
  // Contact-list row for the selected JD's kindergarten; addressee of the
  // "For Approval" email.
  centreContact?: CentreContact | null;
};

function renderPanelContent(panelId: string, options: JdAppShellOptions): string {
  if (panelId === "jd-editor") return renderJdEditorPanel(options.editor);
  if (panelId === "jd-blurb") return renderJdBlurbPanel(options.blurb);
  if (panelId === "jd-settings") return renderJdSettingsPanel(options.settings);
  return renderJdListPanel(options.list);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPanelActions(panelId: string, options: JdAppShellOptions): string | undefined {
  // The list and settings panels sit side by side on /jd, so neither needs a
  // link to the other. Only the editor and blurb - which replace the whole
  // view - carry a way back, and that goes to /jd itself.
  if (panelId === "jd-editor" && options.editor.jobDescription) {
    const jd = options.editor.jobDescription;
    const emailHref = buildJdGenerateEmailHref(jd);
    const contact = options.centreContact;

    return `
      <a class="panel-action-link" href="/jd"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to Job Descriptions</span></a>
      <a class="panel-action-link" href="/jd?panel=jd-blurb&jd=${jd.id}"><i class="bi bi-file-earmark-richtext ui-icon" aria-hidden="true"></i><span>Website blurb for this JD</span></a>
      <a
        class="panel-action-link"
        href="${escapeHtml(emailHref)}"
        data-jd-generate-email
        data-jd-id="${jd.id}"
        ${jd.blurbHtml == null && jd.centreKey != null ? `data-blurb-generate-url="/api/jd/${jd.id}/blurb/generate"` : ""}
        data-approval-to="${escapeHtml(contact?.email ?? "")}"
        data-approval-subject="${escapeHtml(JD_APPROVAL_EMAIL_SUBJECT)}"
        data-approval-body="${escapeHtml(buildJdApprovalEmailText(contact?.headTeacher ?? "", contact?.keySeniorTeacher ?? "", jd.blurbHtml ?? ""))}"
      ><i class="bi bi-envelope-plus ui-icon" aria-hidden="true"></i><span>Generate Email</span></a>
      <button type="button" class="panel-action-button" data-jd-action="pdf" data-jd-id="${jd.id}"><i class="bi bi-file-earmark-pdf ui-icon" aria-hidden="true"></i><span>Download PDF</span></button>
      <button type="submit" class="panel-action-button" form="jd-edit-${jd.id}"><i class="bi bi-save ui-icon" aria-hidden="true"></i><span>Save</span></button>
    `;
  }

  // Browsers block file:// links from an http page, so this asks the server to
  // open the folder (set under Settings > Folder shortcuts) in Explorer.
  const jobPositionsButton = `<button type="button" class="panel-action-button" data-jd-open-folder title="${escapeHtml(options.settings.globalSettings.jobPositionsFolder)}"><i class="bi bi-folder2-open ui-icon" aria-hidden="true"></i><span>Job Positions</span></button>`;

  if (panelId === "jd-list") {
    return `
      ${jobPositionsButton}
    `;
  }

  if (panelId === "jd-blurb" && options.blurb.jobDescription) {
    const jd = options.blurb.jobDescription;

    return `
      <a class="panel-action-link" href="/jd?panel=jd-editor&jd=${jd.id}"><i class="bi bi-arrow-left ui-icon" aria-hidden="true"></i><span>Back to ${escapeHtml(jd.jobTitle)} - ${escapeHtml(formatJdLocationDisplay(jd.locationDisplay))}</span></a>
      ${jobPositionsButton}
    `;
  }

  return undefined;
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

        function setCreateBusy(form, busy) {
          var busyStatus = form.querySelector("[data-jd-create-busy]");
          var submit = form.querySelector("[data-jd-create-submit]");
          var fields = form.querySelectorAll("select, button, input");
          fields.forEach(function(field) {
            field.disabled = busy;
          });
          form.setAttribute("aria-busy", busy ? "true" : "false");
          if (busyStatus) busyStatus.hidden = !busy;
          if (submit) {
            submit.innerHTML = busy
              ? '<span class="jd-list__create-spinner" aria-hidden="true"></span><span>Generating...</span>'
              : '<i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>New Job Description</span>';
          }
        }

        async function postCreate(url, payload, form) {
          setCreateBusy(form, true);
          try {
            var response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
            });
            if (!response.ok) throw new Error("Request failed");
            var result = await response.json().catch(function () { return {}; });
            if (result && result.id) {
              window.location.href = "/jd?panel=jd-editor&jd=" + encodeURIComponent(String(result.id));
            } else {
              reload();
            }
            return true;
          } catch (error) {
            setCreateBusy(form, false);
            window.alert("That job description couldn't be created. Please try again.");
            return false;
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
            '<section class="jd-editor__role-section flex flex-col gap-8" data-section-index="' + sectionIndex + '">',
            '<div class="jd-editor__role-section-actions flex gap-6 items-center">',
            '<input type="text" class="jd-editor__role-heading form-control" name="roleSections[' + sectionIndex + '][heading]" value="" placeholder="Section heading" />',
            '<button type="button" class="jd-editor__mini-button" data-jd-remove-role-section title="Remove section"><i class="bi bi-trash ui-icon" aria-hidden="true"></i></button>',
            '</div>',
            '<textarea class="form-control" name="roleSections[' + sectionIndex + '][intro]" placeholder="Intro sentence"></textarea>',
            '<ul class="jd-editor__role-bullets flex flex-col gap-6"></ul>',
            '<button type="button" class="jd-editor__inline-button" data-jd-add-role-bullet><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add bullet</span></button>',
            '</section>'
          ].join("");
        }

        function roleBulletMarkup(sectionIndex, bulletIndex) {
          return [
            '<li>',
            '<input type="text" class="jd-editor__bullet-text form-control" name="roleSections[' + sectionIndex + '][bullets][' + bulletIndex + '][text]" value="" placeholder="Bullet text" />',
            '<button type="button" class="jd-editor__mini-button" data-jd-remove-role-bullet title="Remove bullet"><i class="bi bi-x-lg ui-icon" aria-hidden="true"></i></button>',
            '</li>'
          ].join("");
        }

        function openDatePicker(button) {
          var combo = button.closest(".jd-editor__date-combo");
          var picker = combo ? combo.querySelector("[data-jd-date-picker]") : null;
          var text = combo ? combo.querySelector("[data-jd-date-text]") : null;
          if (!(picker instanceof HTMLInputElement) || !(text instanceof HTMLInputElement)) return;
          picker.value = picker.hasAttribute("data-jd-keep-time") ? text.value.slice(0, 10) : text.value;
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
          // A date-only picker closes as soon as a day is clicked (a datetime
          // picker stays open for the time), so keep the existing time - the
          // 4pm closing default - and swap in just the date.
          if (picker.hasAttribute("data-jd-keep-time")) {
            var time = /T(\\d{2}:\\d{2})$/.exec(text.value);
            text.value = picker.value ? picker.value + "T" + (time ? time[1] : "16:00") : "";
          } else {
            text.value = picker.value;
          }
          // The create form has nothing to autosave; it submits as a whole.
          if (text.closest("[data-jd-edit]")) autosaveJdEdit(text);
        }

        // "Wednesday 21 October", one week from now in NZ time.
        function approvalDeadline() {
          var parts = {};
          new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long" })
            .formatToParts(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
            .forEach(function(part) { parts[part.type] = part.value; });
          return parts.weekday + " " + parts.day + " " + parts.month;
        }

        function openEmailChoice(link) {
          var blocker = document.createElement("div");
          var dialog = document.createElement("div");
          var message = document.createElement("p");
          var actions = document.createElement("div");
          var approvalButton = document.createElement("button");
          var officeButton = document.createElement("button");

          blocker.className = "modal-page-blocker grid";
          dialog.className = "email-confirm-dialog text-body grid gap-16 email-confirm-dialog--choice";
          dialog.setAttribute("role", "dialog");
          dialog.setAttribute("aria-modal", "true");
          dialog.setAttribute("aria-label", "Choose which email to send");
          message.textContent = "Choose which email to send";
          actions.className = "email-confirm-dialog__actions flex justify-end gap-8 email-confirm-dialog__actions--grid";
          approvalButton.type = "button";
          approvalButton.textContent = "For Approval";
          officeButton.type = "button";
          officeButton.textContent = "To Office Admin";
          actions.append(approvalButton, officeButton);
          dialog.append(message, actions);
          blocker.append(dialog);
          document.body.append(blocker);

          function close() { blocker.remove(); }
          function send(href) { close(); window.location.href = href; }

          approvalButton.addEventListener("click", function() {
            var body = (link.getAttribute("data-approval-body") || "").replace("${JD_APPROVAL_DEADLINE_TOKEN}", approvalDeadline());
            send("mailto:" + (link.getAttribute("data-approval-to") || "")
              + "?subject=" + encodeURIComponent(link.getAttribute("data-approval-subject") || "")
              + "&body=" + encodeURIComponent(body));
          });
          officeButton.addEventListener("click", function() { send(link.href); });
          blocker.addEventListener("click", function(event) { if (event.target === blocker) close(); });
          dialog.addEventListener("keydown", function(event) { if (event.key === "Escape") close(); });
          approvalButton.focus();
        }

        // No blurb yet: generate one first, then reload so the approval email
        // carries it, and reopen the choice modal on the fresh page.
        function generateBlurbThenEmail(link) {
          if (link.getAttribute("aria-busy") === "true") return;
          var icon = link.querySelector("i");
          var label = link.querySelector("span");
          var originalLabel = label ? label.textContent : "";
          link.setAttribute("aria-busy", "true");
          link.classList.add("panel-action-button--disabled");
          if (icon) icon.className = "bi bi-arrow-repeat ui-icon panel-action-button__spinner";
          if (label) label.textContent = "Generating blurb…";

          fetch(link.getAttribute("data-blurb-generate-url"), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
            .then(function(response) {
              if (!response.ok) throw new Error("Blurb generation failed");
              window.location.href = "/jd?panel=jd-editor&jd=" + link.getAttribute("data-jd-id") + "&email=choose";
            })
            .catch(function() {
              link.removeAttribute("aria-busy");
              link.classList.remove("panel-action-button--disabled");
              if (icon) icon.className = "bi bi-envelope-plus ui-icon";
              if (label) label.textContent = originalLabel;
              window.alert("The website blurb couldn't be generated. Please try again.");
            });
        }

        document.addEventListener("click", function(event) {
          var emailLink = event.target instanceof Element ? event.target.closest("[data-jd-generate-email]") : null;
          if (emailLink) {
            event.preventDefault();
            if (emailLink.hasAttribute("data-blurb-generate-url")) generateBlurbThenEmail(emailLink);
            else openEmailChoice(emailLink);
          }
        });

        (function() {
          var params = new URLSearchParams(window.location.search);
          if (params.get("email") !== "choose") return;
          params.delete("email");
          window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
          var emailLink = document.querySelector("[data-jd-generate-email]");
          if (emailLink) openEmailChoice(emailLink);
        })();

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
            // The top-bar copy sits outside the form, so fall back to looking it up.
            var editForm = el.closest("[data-jd-edit]") || document.getElementById("jd-edit-" + jdId);
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

        // Settings forms save without reloading so the open accordion section
        // stays open; a status line under the Save button confirms it.
        async function saveSettingsInPlace(form, url) {
          var status = form.querySelector("[data-jd-settings-status]");
          if (!status) {
            status = document.createElement("p");
            status.className = "jd-settings__ktca-status text-ghost text-small";
            status.setAttribute("data-jd-settings-status", "");
            form.appendChild(status);
          }
          status.textContent = "Saving...";
          var result = await postSilent(url, formData(form));
          status.textContent = result ? "Saved." : "";
          if (result && form.hasAttribute("data-jd-folder-settings")) {
            // The server swaps a blank entry for the default path; show it
            // and keep the list button's tooltip in step.
            var settings = await fetch("/api/jd/settings/global").then(function(r) { return r.json(); }).catch(function() { return null; });
            if (settings && settings.jobPositionsFolder) {
              form.querySelector("[name=jobPositionsFolder]").value = settings.jobPositionsFolder;
              var folderButton = document.querySelector("[data-jd-open-folder]");
              if (folderButton) folderButton.title = settings.jobPositionsFolder;
            }
          }
        }

        document.addEventListener("click", function(event) {
          var folderButton = event.target instanceof Element ? event.target.closest("[data-jd-open-folder]") : null;
          if (!folderButton) return;
          event.preventDefault();
          fetch("/api/jd/open-folder", { method: "POST" })
            .then(function(response) { return response.json(); })
            .then(function(payload) { if (payload && payload.error) window.alert(payload.error); })
            .catch(function() { window.alert("Couldn't open the Job Positions folder. Please try again."); });
        });

        document.addEventListener("submit", function(event) {
          var form = event.target;
          if (!(form instanceof HTMLFormElement)) return;

          if (form.hasAttribute("data-jd-create")) {
            event.preventDefault();
            postCreate("/api/jd", formData(form), form);
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
            saveSettingsInPlace(form, "/api/jd/settings/centre/" + centreKey);
            return;
          }
          if (form.hasAttribute("data-jd-title-profile")) {
            event.preventDefault();
            saveSettingsInPlace(form, "/api/jd/settings/title");
            return;
          }
          if (form.hasAttribute("data-jd-global-settings") || form.hasAttribute("data-jd-folder-settings")) {
            event.preventDefault();
            saveSettingsInPlace(form, "/api/jd/settings/global");
            return;
          }
          if (form.hasAttribute("data-jd-title-create")) {
            event.preventDefault();
            var createStatus = document.querySelector("[data-jd-title-create-status]");
            fetch("/api/jd/settings/title/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(formData(form)),
            })
              .then(function (response) { return response.json(); })
              .then(function (payload) {
                if (payload && payload.error) {
                  if (createStatus) createStatus.textContent = payload.error;
                  return;
                }
                window.location.reload();
              })
              .catch(function () {
                if (createStatus) createStatus.textContent = "Could not add the job type. Please try again.";
              });
            return;
          }
          if (form.hasAttribute("data-jd-knowledge-doc")) {
            event.preventDefault();
            saveSettingsInPlace(form, "/api/jd/settings/knowledge-doc");
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
            ? event.target.closest("[data-jd-edit] select, [data-jd-edit] [data-jd-date-picker], [data-jd-create] [data-jd-date-picker]")
            : null;
          if (!field) return;
          if (field instanceof HTMLInputElement && field.hasAttribute("data-jd-date-picker")) {
            syncDatePickerValue(field);
            return;
          }
          if (field instanceof HTMLSelectElement && field.name === "positionType") syncIntroPositionType(field);
          autosaveJdEdit(field);
        });

        // Swap "Full Time" <-> "Part Time" in the intro paragraph so it matches
        // the selected Position Type, keeping the existing separator and casing.
        function syncIntroPositionType(select) {
          var form = select.closest("[data-jd-edit]");
          var intro = form ? form.querySelector('textarea[name="introParagraph"]') : null;
          if (!intro) return;
          var target = select.value === "Part-time" ? "part" : "full";
          intro.value = intro.value.replace(/\\b(full|part)([ -]?)(time)\\b/gi, function(_match, word, sep, time) {
            var replacement = word === word.toUpperCase() ? target.toUpperCase()
              : word.charAt(0) === word.charAt(0).toUpperCase() ? target.charAt(0).toUpperCase() + target.slice(1)
              : target;
            return replacement + sep + time;
          });
        }

        window.__jdPost = post;
        window.__jdPostSilent = postSilent;
      })();
    </script>
  `;
}

export function renderJdAppShell(options: JdAppShellOptions): string {
  const focusPanelId = resolveJdFocusPanelId(options.focusPanelId);

  // JD Editor and Website Blurb both need a selected job description. Without
  // one they render nothing but a "select a job description" placeholder, so
  // on the bare /jd list view they are left out of the accordion entirely
  // rather than sitting there as sections that can never be filled in.
  const hasSelectedJd = options.editor.jobDescription != null || options.blurb.jobDescription != null;
  const visiblePanels = PANEL_DEFINITIONS.filter(
    (panel) => hasSelectedJd || (panel.id !== "jd-editor" && panel.id !== "jd-blurb"),
  );

  const panelContent = visiblePanels.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: renderPanelActions(panel.id, options),
    children: renderPanelContent(panel.id, options),
    // Settings is a reference/maintenance panel, so it sits in the right-hand
    // column beside the main list rather than in the left accordion.
    sidePanel: panel.id === "jd-settings",
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
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="app-shell-body">
    <aside class="nav-rail flex flex-col items-center gap-6" aria-label="Primary navigation">
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/tasks" aria-label="Tasks" title="Tasks"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted nav-rail__item--current" href="/jd" aria-label="Job Descriptions" title="Job Descriptions" aria-current="page"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
      <a class="nav-rail__item inline-flex items-center justify-center text-muted" href="/wiki" aria-label="Things To Know" title="Things To Know"><i class="bi bi-journal-bookmark" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderJdScript()}
  </body>
</html>`;
}

export { VALID_JD_PANEL_IDS };
