import { renderLayout } from "./layout.js";
import { renderPrintAction, SPINNER_CLASS } from "./action-buttons.js";
import { THEME_HEAD_SCRIPT } from "./theme.js";
import {
  ONE_PAGER_FIELD_MAX,
  ONE_PAGER_SERVICE_MODELS,
  ONE_PAGER_SERVICE_MODEL_LABEL,
  ONE_PAGER_SLOTS,
  ONE_PAGER_SLOT_LABEL,
  ONE_PAGER_SLOT_RATIO,
  ONE_PAGER_TEMPLATE_MAX,
  resolveOnePagerServiceModel,
  sharedTextKeys,
  type OnePagerTemplateText,
} from "../one-pager/template.js";
import { REAL_CHILDREN_QUESTION, REGENERATION_OPTIONS } from "../image-ai/photo-slot.js";
import { buildOnePagerEmail, teamPhotoListBadge } from "../one-pager/email.js";
import type { OnePagerCentre, OnePagerRecord } from "../storage/one-pager-store.js";

// Info Sheets: the one-page PDF for each kindergarten. The list, the selected
// kindergarten's text and photos, and the shared text are the
// accordion; the real PDF is the preview in the right-hand column. Every
// change swaps the panel bodies it touched in place (data-one-pager-fragment)
// and reloads the preview.

export type OnePagerPageData = {
  centres: OnePagerCentre[];
  onePagers: OnePagerRecord[];
  template: OnePagerTemplateText;
  selected: { centre: OnePagerCentre; onePager: OnePagerRecord } | null;
  // Kindergartens whose teaching team has changed: the open task (its id) to
  // get a new team photo, by centreKey.
  photoTasks?: Record<number, number>;
  // Kindergartens that have been emailed for a new team photo since the one
  // on their sheet was put there, by centreKey.
  photoEmails?: Record<number, boolean>;
  // Info sheets with no team photo (removed, or its file has gone), by centreKey.
  photoMissing?: Record<number, boolean>;
  // Who an email about the selected kindergarten's sheet goes to: the
  // service's email, and the first names to greet ("Paula and Colleen").
  emailContact?: { to: string; greeting: string };
  // Who looks after each kindergarten, by centreKey, for the list.
  people?: Record<number, OnePagerPeople>;
  // The selected kindergarten's notes, newest first: the same notes the
  // Marketing page keeps on it.
  notes?: OnePagerNote[];
};

export type OnePagerPeople = { seniorLeader: string; headTeacher: string; administrator: string };

// A note on a kindergarten: what it is filed under ("Info sheet", an advert
// review, ...), its words, and when it was written (ISO).
export type OnePagerNote = { id: number; heading: string; text: string; at: string };
export const ONE_PAGER_NOTE_MAX = 6000;
// The reason the In use box starts with each time it opens.
export const ONE_PAGER_IN_USE_REASON = "As directed by the kindergarten";

export type OnePagerFragmentKey = "list" | "text" | "photos" | "notes" | "shared";
export type OnePagerFragments = Partial<Record<OnePagerFragmentKey, string>>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// "15 Nov 2026, 2:05 pm", NZ time.
function formatDateTime(date: Date): string {
  const day = date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
  const time = date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Pacific/Auckland" });
  return `${day}, ${time}`;
}

// ---- Kindergartens ------------------------------------------------------------

export function renderOnePagerList(data: OnePagerPageData): string {
  const byCentre = new Map(data.onePagers.map((onePager) => [onePager.centreKey, onePager]));
  const selectedKey = data.selected?.centre.centreKey ?? null;
  const rows = data.centres
    .map((centre) => {
      const onePager = byCentre.get(centre.centreKey);
      const current = centre.centreKey === selectedKey;
      const people = data.people?.[centre.centreKey];
      // In use until the tick is taken off (a kindergarten with no sheet yet is in use).
      const inUse = onePager?.inUse ?? true;
      // Its team photo is due, it has been emailed for a new one, or both.
      // One that is not in use is not asked for a staff photo.
      // A sheet with no team photo is due one too, task or no task.
      const photoDue = inUse && Boolean(data.photoTasks?.[centre.centreKey] || data.photoMissing?.[centre.centreKey]);
      const photoBadge = inUse ? teamPhotoListBadge({ photoDue, emailSent: Boolean(data.photoEmails?.[centre.centreKey]) }) : "";
      // Each kindergarten is a standard button (no links): it opens that
      // kindergarten. The one being worked on is marked with an arrow. Its
      // In use tick box sits beside the button.
      return `
        <div class="one-pager-list__line">
        <button type="submit" class="one-pager-list__row" name="centre" value="${centre.centreKey}"${current ? ' aria-current="true"' : ""}>
          <span class="one-pager-list__name"><i class="bi ${current ? "bi-caret-right-fill" : "bi-file-earmark-richtext"}" aria-hidden="true"></i>${escapeHtml(centre.name)}${photoBadge ? `<span class="badge badge--warning" ${photoDue ? "data-one-pager-photo-due" : "data-one-pager-photo-emailed"}><i class="bi ${photoDue ? "bi-camera" : "bi-envelope"}" aria-hidden="true"></i> ${photoBadge}</span>` : ""}</span>
          <span class="one-pager-list__person" data-one-pager-senior-leader>${escapeHtml(people?.seniorLeader ?? "")}</span>
          <span class="one-pager-list__person flex flex-col" data-one-pager-team-leads><span>${escapeHtml(people?.headTeacher ?? "")}</span><span>${escapeHtml(people?.administrator ?? "")}</span></span>
          <span>${onePager ? `${onePager.images.length}/${ONE_PAGER_SLOTS.length}` : ""}</span>
          <span>${onePager ? escapeHtml(formatDateTime(onePager.updatedAt)) : ""}</span>
        </button>
        <label class="one-pager-list__in-use"><input type="checkbox"${inUse ? " checked" : ""} data-one-pager-in-use="${centre.centreKey}" data-centre-name="${escapeHtml(centre.name)}" aria-label="${escapeHtml(centre.name)} in use" /></label>
        </div>`;
    })
    .join("");
  return `
    <form class="one-pager-list flex flex-col gap-6" action="/one-pager" method="get">
      <div class="one-pager-list__line text-small text-ghost label-case"><div class="one-pager-list__head"><span>Kindergarten</span><span class="one-pager-list__person">Senior leader</span><span class="one-pager-list__person">Head Teacher / Administrator</span><span>Photos</span><span>Last edited</span></div><span class="one-pager-list__in-use">In use</span></div>
      ${rows || `<span class="text-empty">No open kindergartens.</span>`}
    </form>
  `;
}

// ---- Text -----------------------------------------------------------------------

const textInput = (name: keyof typeof ONE_PAGER_FIELD_MAX, label: string, value: string, type = "text") =>
  `<label class="field-label"><span>${label}</span><input class="form-control" type="${type}" name="${name}" maxlength="${ONE_PAGER_FIELD_MAX[name]}" value="${escapeHtml(value)}" autocomplete="off" /></label>`;

const textArea = (name: keyof typeof ONE_PAGER_FIELD_MAX, label: string, value: string, rows: number, extra = "") =>
  `<label class="field-label"><span>${label}</span><textarea class="form-control" name="${name}" rows="${rows}" maxlength="${ONE_PAGER_FIELD_MAX[name]}"${extra}>${escapeHtml(value)}</textarea></label>`;

// One of the three sections every kindergarten shares: empty means the shared
// text (shown as the placeholder) is used.
function sharedArea(name: "costOverride" | "teachersOverride" | "enrolOverride", sharedKey: keyof OnePagerTemplateText, label: string, value: string, shared: string, rows: number): string {
  return `
        <div class="flex flex-col gap-6">
          ${textArea(name, label, value, rows, ` placeholder="${escapeHtml(shared)}" data-one-pager-shared-placeholder="${sharedKey}"`)}
          <div class="flex"><button type="button" class="button-sm" data-one-pager-use-shared="${name}"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Use shared text</button></div>
        </div>`;
}

export function renderOnePagerText(data: OnePagerPageData): string {
  if (!data.selected) return "";
  const { onePager } = data.selected;
  const { template } = data;
  const model = resolveOnePagerServiceModel(onePager.serviceModel);
  // The cost and enrolment text a service shares depends on its model.
  const shared = sharedTextKeys(model);
  const modelOptions = ONE_PAGER_SERVICE_MODELS.map(
    (value) => `<option value="${value}"${value === model ? " selected" : ""}>${ONE_PAGER_SERVICE_MODEL_LABEL[value]}</option>`,
  ).join("");
  return `
    <form class="one-pager-form flex flex-col gap-12" data-one-pager-form="text">
      <label class="field-label"><span>Service type</span><select class="form-control" name="serviceModel">${modelOptions}</select></label>
      <div class="flex flex-col gap-6">
        ${textArea("aboutUs", "About us", onePager.aboutUs, 14)}
        <div class="flex"><button type="button" class="button-sm" data-one-pager-draft><i class="bi bi-stars" aria-hidden="true"></i>Draft with AI</button></div>
      </div>
      <h3 class="section-title">Contact us</h3>
      <div class="one-pager-form__contact grid gap-12">
        ${textInput("address", "Address", onePager.address)}
        ${textInput("phone", "Phone", onePager.phone)}
        ${textInput("email", "Email", onePager.email)}
      </div>
      <div class="flex"><button type="button" class="button-sm" data-one-pager-prefill><i class="bi bi-magic" aria-hidden="true"></i>Fill from what we know</button></div>
      ${textArea("hours", "Hours", onePager.hours, 4)}
      <h3 class="section-title">Questions</h3>
      ${sharedArea("costOverride", shared.cost, "How much does it cost?", onePager.costOverride, template[shared.cost], 6)}
      ${sharedArea("teachersOverride", "teachersText", "Are the teachers trained?", onePager.teachersOverride, template.teachersText, 3)}
      ${sharedArea("enrolOverride", shared.enrol, "How do I enrol my child?", onePager.enrolOverride, template[shared.enrol], 5)}
      <div class="one-pager-form__save flex justify-end"><button type="submit" class="button-md">Save</button></div>
    </form>
  `;
}

// ---- Photos ---------------------------------------------------------------------

export function renderOnePagerPhotos(data: OnePagerPageData): string {
  if (!data.selected) return "";
  const images = new Map(data.selected.onePager.images.map((image) => [image.slot, image]));
  const cards = ONE_PAGER_SLOTS.map((slot) => {
    const image = images.get(slot);
    const label = ONE_PAGER_SLOT_LABEL[slot];
    const ratio = ONE_PAGER_SLOT_RATIO[slot].toFixed(4);
    // The photo the slot held before its last replacement: Revert puts it back.
    const hasPrevious = data.selected!.onePager.previousImages.some((entry) => entry.slot === slot);
    const downloadName = `${data.selected!.centre.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()} ${label}.${image?.mimeType === "image/png" ? "png" : "jpg"}`;
    return `
      <div class="one-pager-photo card flex flex-col gap-8" data-one-pager-slot="${slot}">
        <h3 class="section-title">${label}</h3>
        <div class="one-pager-photo__frame${slot === "team" ? " one-pager-photo__frame--whole" : ""}" style="aspect-ratio: ${ratio}">
          ${image ? `<img class="one-pager-photo__image" src="/api/one-pager/images/${image.id}/file" alt="${label}" />` : `<span class="text-empty">No photo</span>`}
        </div>
        ${image ? `<label class="one-pager-photo__ai inline-flex items-center gap-6 text-small text-muted"><input type="checkbox"${image.aiGenerated ? " checked" : ""} data-one-pager-ai="${slot}" /><span>AI generated</span></label>` : ""}
        <div class="flex flex-wrap gap-8">
          <button type="button" class="button-sm" data-one-pager-upload="${slot}" data-ratio="${ratio}"><i class="bi bi-upload" aria-hidden="true"></i>${image ? "Replace" : "Upload"}</button>
          <button type="button" class="button-sm" data-one-pager-generate="${slot}" data-label="${label}" data-prompt="${escapeHtml(image?.aiGenerated ? image.aiPrompt : "")}"><i class="bi bi-stars" aria-hidden="true"></i>Generate with AI</button>
          ${image && slot !== "team" ? `<button type="button" class="button-sm" data-one-pager-regenerate="${slot}" data-label="${label}" data-ai="${image.aiGenerated ? "1" : ""}"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Regenerate with AI</button>` : ""}
          ${hasPrevious ? `<button type="button" class="button-sm" data-one-pager-revert="${slot}"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Revert</button>` : ""}
          ${image ? `<button type="button" class="button-sm" data-one-pager-download="/api/one-pager/images/${image.id}/file" data-filename="${escapeHtml(downloadName)}"><i class="bi bi-box-arrow-down" aria-hidden="true"></i>Download</button>` : ""}
          ${image ? `<button type="button" class="button-sm" data-one-pager-remove="${slot}" data-label="${label}"><i class="bi bi-trash" aria-hidden="true"></i>Remove</button>` : ""}
        </div>${
          // The words under the team photo are edited with the photo they sit
          // under. There is no Save button: they save themselves as they are typed.
          slot === "team"
            ? `
        <form class="one-pager-form flex flex-col gap-8" data-one-pager-form="caption">
          <label class="field-label field-label--sentence"><span>Photo caption</span><textarea class="form-control" name="teamCaption" rows="3" maxlength="${ONE_PAGER_FIELD_MAX.teamCaption}">${escapeHtml(data.selected!.onePager.teamCaption)}</textarea></label>
        </form>${
          // The team has changed and a task is open to get a new photo: it opens from here.
          data.selected!.onePager.inUse && data.photoTasks?.[data.selected!.centre.centreKey]
            ? `
        <form class="flex" action="/tasks" method="get"><button type="submit" class="button-sm" name="task" value="${data.photoTasks[data.selected!.centre.centreKey]}"><i class="bi bi-camera" aria-hidden="true"></i>Team photo due: open task</button></form>`
            : ""
        }`
            : ""
        }
      </div>`;
  }).join("");
  return `<div class="one-pager-photos grid gap-12">${cards}</div>`;
}

// ---- Notes ----------------------------------------------------------------------

export function renderOnePagerNotes(data: OnePagerPageData): string {
  if (!data.selected) return "";
  const notes = (data.notes ?? [])
    .map((note) => {
      const at = new Date(note.at);
      return `
        <li class="task-notes__item" data-one-pager-note>
          <div class="task-notes__meta flex items-center gap-8 text-small text-ghost"><span>${Number.isNaN(at.getTime()) ? "" : escapeHtml(formatDateTime(at))}</span><span>${escapeHtml(note.heading)}</span></div>
          <form class="task-notes__edit" data-one-pager-note-edit="${note.id}">
            <textarea class="form-control form-control--sm" name="text" rows="3" maxlength="${ONE_PAGER_NOTE_MAX}" aria-label="Edit note">${escapeHtml(note.text)}</textarea>
          </form>
        </li>`;
    })
    .join("");
  return `
    <div class="one-pager-notes flex flex-col gap-12">
      <form class="one-pager-form flex flex-col gap-8" data-one-pager-form="note">
        <label class="field-label"><span>Add note</span><textarea class="form-control" name="text" rows="3" maxlength="${ONE_PAGER_NOTE_MAX}" required></textarea></label>
        <div class="flex"><button type="submit" class="button-sm"><i class="bi bi-save" aria-hidden="true"></i>Save note</button></div>
      </form>
      ${notes ? `<ol class="task-notes__list flex flex-col gap-10">${notes}</ol>` : `<p class="task-notes__empty text-ghost text-small">No notes yet.</p>`}
    </div>
  `;
}

// ---- Shared text ----------------------------------------------------------------

export function renderOnePagerShared(template: OnePagerTemplateText): string {
  const input = (name: keyof OnePagerTemplateText, label: string) =>
    `<label class="field-label"><span>${label}</span><input class="form-control" type="text" name="${name}" maxlength="${ONE_PAGER_TEMPLATE_MAX[name]}" value="${escapeHtml(template[name])}" required autocomplete="off" /></label>`;
  const area = (name: keyof OnePagerTemplateText, label: string, rows: number) =>
    `<label class="field-label"><span>${label}</span><textarea class="form-control" name="${name}" rows="${rows}" maxlength="${ONE_PAGER_TEMPLATE_MAX[name]}" required>${escapeHtml(template[name])}</textarea></label>`;
  return `
    <form class="one-pager-form flex flex-col gap-12" data-one-pager-form="shared">
      ${input("tagline", "Tagline")}
      ${input("website", "Website")}
      ${area("costText", "How much does it cost?", 6)}
      ${area("teachersText", "Are the teachers trained?", 3)}
      ${area("enrolText", "How do I enrol my child?", 5)}
      ${area("allDayCostText", "How much does it cost? (All Day)", 6)}
      ${area("allDayEnrolText", "How do I enrol my child? (All Day)", 5)}
      <div class="flex justify-end"><button type="submit" class="button-md">Save</button></div>
    </form>
  `;
}

export function renderOnePagerFragments(data: OnePagerPageData, keys: OnePagerFragmentKey[]): OnePagerFragments {
  const render: Record<OnePagerFragmentKey, () => string> = {
    list: () => renderOnePagerList(data),
    text: () => renderOnePagerText(data),
    photos: () => renderOnePagerPhotos(data),
    notes: () => renderOnePagerNotes(data),
    shared: () => renderOnePagerShared(data.template),
  };
  return Object.fromEntries(keys.map((key) => [key, render[key]()]));
}

const fragment = (key: OnePagerFragmentKey, html: string) => `<div class="one-pager-fragment" data-one-pager-fragment="${key}">${html}</div>`;

// ---- Page script ----------------------------------------------------------------

function renderOnePagerScript(centreKey: number | null): string {
  return `
    <script>
      (function() {
        var KEY = ${centreKey == null ? "null" : centreKey};
        var BASE = "/api/one-pager/" + KEY;
        function fail(error) { window.alert(error.message || "Request failed."); }
        async function read(response) {
          var result = await response.json().catch(function() { return {}; });
          if (!response.ok || result.ok === false) throw new Error(result.error || "Request failed.");
          return result;
        }
        function post(url, payload) {
          return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload || {}) }).then(read);
        }
        // The words under the team photo, when they have been changed and not yet saved.
        function captionBox() { return document.querySelector('[data-one-pager-form="caption"] textarea'); }
        function saveCaptionIfChanged() {
          var box = captionBox();
          if (box && box.value !== box.defaultValue && typeof box.form.requestSubmit === "function") box.form.requestSubmit();
        }
        function swap(result) {
          if (!result || !result.fragments) return;
          // A caption being typed is on the Team photo card, which a redraw
          // of the photos replaces: it is put back and saved, never lost.
          var caption = captionBox();
          var typed = caption && caption.value !== caption.defaultValue ? caption.value : null;
          Object.keys(result.fragments).forEach(function(key) {
            var holder = document.querySelector('[data-one-pager-fragment="' + key + '"]');
            if (holder) holder.innerHTML = result.fragments[key];
          });
          markRegenerating();
          caption = captionBox();
          if (caption && typed !== null && result.fragments.photos !== undefined) {
            caption.value = typed;
            saveCaptionIfChanged();
          }
        }
        // The caption saves itself: a moment after the typing stops, and at
        // once when the box is left. A save that lands while more is being
        // typed leaves the box changed, so the next pause saves the rest.
        var captionTimer = null;
        document.addEventListener("input", function(event) {
          if (!(event.target instanceof Element) || event.target !== captionBox()) return;
          clearTimeout(captionTimer);
          captionTimer = setTimeout(saveCaptionIfChanged, 800);
        });
        document.addEventListener("change", function(event) {
          if (!(event.target instanceof Element) || event.target !== captionBox()) return;
          clearTimeout(captionTimer);
          saveCaptionIfChanged();
        });
        // The slots whose new picture is still being made. Each keeps its old
        // photo, dimmed under a turning icon, with its buttons off until its
        // own picture arrives. The marks are put back after every swap, as a
        // swap redraws all the photo cards.
        var regenerating = {};
        function markRegenerating() {
          document.querySelectorAll("[data-one-pager-slot]").forEach(function(card) {
            var on = regenerating[card.getAttribute("data-one-pager-slot")] === true;
            card.classList.toggle("is-regenerating", on);
            card.querySelectorAll("button, [data-one-pager-ai]").forEach(function(control) {
              if (!control.closest("form")) control.disabled = on;
            });
            var frame = card.querySelector(".one-pager-photo__frame");
            var icon = frame && frame.querySelector(".one-pager-photo__working");
            if (on && frame && !icon) {
              icon = document.createElement("i");
              icon.className = "one-pager-photo__working bi bi-arrow-repeat ${SPINNER_CLASS}";
              icon.setAttribute("aria-label", "Regenerating");
              frame.append(icon);
            } else if (!on && icon) {
              icon.remove();
            }
          });
        }
        function busy(button, on) {
          if (!button) return;
          button.disabled = on;
          var icon = button.querySelector(".bi");
          if (icon) icon.classList.toggle("${SPINNER_CLASS}", on);
        }

        // The preview is the PDF itself. The server says in a header when a
        // column is too long to fit on the page.
        var frame = document.querySelector("[data-one-pager-preview]");
        var fitNote = document.querySelector("[data-one-pager-fit]");
        var previewUrl = null;
        var previewRun = 0;
        function refreshPreview() {
          if (KEY === null || !frame) return;
          var run = ++previewRun;
          fetch(BASE + "/pdf?inline=1&badges=1").then(function(response) {
            if (!response.ok) throw new Error("The preview could not be made.");
            var message = decodeURIComponent(response.headers.get("x-one-pager-fit") || "");
            return response.blob().then(function(blob) {
              if (run !== previewRun) return;
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              previewUrl = URL.createObjectURL(blob);
              frame.src = previewUrl + "#toolbar=0&navpanes=0&view=Fit";
              if (fitNote) { fitNote.textContent = message; fitNote.hidden = !message; }
            });
          }).catch(function(error) {
            if (fitNote) { fitNote.textContent = error.message; fitNote.hidden = false; }
          });
        }
        refreshPreview();

        // A note is changed where it stands, as on the Tasks page: it saves
        // when its box is left with different words in it. An emptied box
        // gets its saved words back. Only the list is redrawn (its Staff photo
        // email badge is read from the notes), so the Notes panel keeps
        // whatever else is being typed in it.
        document.addEventListener("blur", function(event) {
          var field = event.target instanceof Element ? event.target.closest("[data-one-pager-note-edit] textarea") : null;
          if (!field || field.value === field.defaultValue) return;
          if (!field.value.trim()) { field.value = field.defaultValue; return; }
          var sent = field.value;
          post(BASE + "/notes/" + field.form.getAttribute("data-one-pager-note-edit"), { text: sent }).then(function(result) {
            // What was sent is now what is saved.
            field.defaultValue = result.text;
            if (field.value === sent) field.value = result.text;
            swap(result);
            refreshPreview();
          }).catch(fail);
        }, true);
        document.addEventListener("submit", function(event) {
          if (event.target instanceof Element && event.target.closest("[data-one-pager-note-edit]")) event.preventDefault();
        });

        document.addEventListener("submit", function(event) {
          var form = event.target instanceof Element ? event.target.closest("[data-one-pager-form]") : null;
          if (!form) return;
          event.preventDefault();
          var kind = form.getAttribute("data-one-pager-form");
          var payload = {};
          new FormData(form).forEach(function(value, key) { payload[key] = value; });
          var button = form.querySelector("[type=submit]");
          if (button) button.disabled = true;
          post(kind === "shared" ? "/api/one-pager/template" : kind === "note" ? BASE + "/notes" : BASE, payload).then(function(result) {
            if (kind === "note") {
              // A note is not on the sheet: the Notes panel is redrawn, the preview is left alone.
              swap(result);
              return;
            }
            if (kind === "caption") {
              // Only the caption was saved: the Text panel keeps whatever is being typed in it.
              if (button) button.disabled = false;
              // What was sent is now what is saved.
              var savedBox = captionBox();
              if (savedBox && savedBox.value === payload.teamCaption) savedBox.defaultValue = savedBox.value;
              if (result.fragments) swap({ fragments: { list: result.fragments.list } });
            } else {
              swap(result);
            }
            if (kind === "shared" && result.template) {
              // The shared text shows as the placeholder of each kindergarten's own box.
              document.querySelectorAll("[data-one-pager-shared-placeholder]").forEach(function(box) {
                box.setAttribute("placeholder", result.template[box.getAttribute("data-one-pager-shared-placeholder")] || "");
              });
            }
            refreshPreview();
          }).catch(function(error) { if (button) button.disabled = false; fail(error); });
        });

        // ---- Photos: choose a file, crop it, upload ----
        // The whole photo is shown with a crop box on it: drag the box to move
        // it, drag a corner to resize it. While the tick box is on (as it is
        // when the dialog opens) the box keeps the shape the PDF gives that
        // photo; with it off the box is any shape. The same for all four photos.
        // Where the mouse button went down. A click on a dialog's backdrop
        // closes it only if it started there too: selecting text (or dragging
        // the crop box) and letting go outside the modal does not close it.
        var pressedOn = null;
        document.addEventListener("pointerdown", function(event) { pressedOn = event.target; }, true);
        var fileInput = document.querySelector("[data-one-pager-file]");
        var cropDialog = document.querySelector("[data-one-pager-crop]");
        var cropCanvas = cropDialog ? cropDialog.querySelector("canvas") : null;
        var cropFixed = cropDialog ? cropDialog.querySelector("[data-one-pager-crop-fixed]") : null;
        // The box (x, y, w, h) is in the photo's own pixels; scale is canvas
        // pixels to one of them; ratio is the box's fixed shape, 0 for any;
        // slotRatio is the shape the PDF gives the photo.
        var crop = null; // { slot, image, slotRatio, ratio, scale, x, y, w, h }
        var CROP_MAX_WIDTH = 1200;
        var CROP_MAX_HEIGHT = 800;
        var CROP_HANDLE = 20;
        var CROP_MIN = 48;
        var OUTPUT_WIDTH = 2400;

        // The slot's width / height, as its upload button gives it.
        function cropRatio(value) { return Number(value) || 0; }
        function drawCrop() {
          var context = cropCanvas.getContext("2d");
          var scale = crop.scale;
          var x = crop.x * scale, y = crop.y * scale, width = crop.w * scale, height = crop.h * scale;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
          context.drawImage(crop.image, 0, 0, cropCanvas.width, cropCanvas.height);
          // What is cut away is dimmed; what is kept is drawn again at full strength.
          context.fillStyle = "rgba(0, 0, 0, 0.62)";
          context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
          context.drawImage(crop.image, crop.x, crop.y, crop.w, crop.h, x, y, width, height);
          var green = getComputedStyle(document.documentElement).getPropertyValue("--color-active").trim() || "#7fbe6f";
          context.strokeStyle = green;
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, width - 2, height - 2);
          context.fillStyle = green;
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function(corner) {
            context.fillRect(x + corner[0] * (width - CROP_HANDLE), y + corner[1] * (height - CROP_HANDLE), CROP_HANDLE, CROP_HANDLE);
          });
        }
        // Where the pointer is, in the photo's own pixels, and how far from a
        // corner still counts as on it.
        function cropPoint(event) {
          var box = cropCanvas.getBoundingClientRect();
          var factor = cropCanvas.width / box.width / crop.scale;
          return { x: (event.clientX - box.left) * factor, y: (event.clientY - box.top) * factor, reach: 16 * factor };
        }
        // The corner under the pointer, as the corner opposite it (which stays
        // put while this one is dragged); null when it is on none.
        function cropCorner(point) {
          var found = null;
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function(corner) {
            if (Math.abs(point.x - (crop.x + corner[0] * crop.w)) <= point.reach && Math.abs(point.y - (crop.y + corner[1] * crop.h)) <= point.reach) {
              found = { ax: crop.x + (1 - corner[0]) * crop.w, ay: crop.y + (1 - corner[1]) * crop.h, cursor: corner[0] === corner[1] ? "nwse-resize" : "nesw-resize" };
            }
          });
          return found;
        }
        function insideCrop(point) {
          return point.x >= crop.x && point.x <= crop.x + crop.w && point.y >= crop.y && point.y <= crop.y + crop.h;
        }
        function resizeCrop(anchor, point) {
          var image = crop.image;
          var least = CROP_MIN / crop.scale;
          var px = Math.min(image.width, Math.max(0, point.x));
          var py = Math.min(image.height, Math.max(0, point.y));
          var right = px >= anchor.ax;
          var down = py >= anchor.ay;
          // A corner pushed past the fixed one, with no room that side, stays on its own side.
          if ((right ? image.width - anchor.ax : anchor.ax) < least) right = !right;
          if ((down ? image.height - anchor.ay : anchor.ay) < least) down = !down;
          var roomW = right ? image.width - anchor.ax : anchor.ax;
          var roomH = down ? image.height - anchor.ay : anchor.ay;
          var width = Math.abs(px - anchor.ax);
          var height = Math.abs(py - anchor.ay);
          if (crop.ratio) {
            width = Math.min(Math.max(width, height * crop.ratio, least), roomW, roomH * crop.ratio);
            height = width / crop.ratio;
          } else {
            width = Math.min(Math.max(width, least), roomW);
            height = Math.min(Math.max(height, least), roomH);
          }
          crop.x = right ? anchor.ax : anchor.ax - width;
          crop.y = down ? anchor.ay : anchor.ay - height;
          crop.w = width;
          crop.h = height;
        }
        function closeCrop() {
          crop = null;
          if (typeof cropDialog.close === "function") cropDialog.close();
          else cropDialog.removeAttribute("open");
        }
        function openCrop(slot, ratio, file) {
          var url = URL.createObjectURL(file);
          var image = new Image();
          image.onload = function() {
            URL.revokeObjectURL(url);
            var scale = Math.min(CROP_MAX_WIDTH / image.width, CROP_MAX_HEIGHT / image.height);
            cropCanvas.width = Math.max(1, Math.round(image.width * scale));
            cropCanvas.height = Math.max(1, Math.round(image.height * scale));
            // Starts in the PDF's shape, as the most of the photo that shape allows, centred.
            cropFixed.checked = true;
            var width = ratio ? Math.min(image.width, image.height * ratio) : image.width;
            var height = ratio ? width / ratio : image.height;
            crop = { slot: slot, image: image, slotRatio: ratio, ratio: ratio, scale: cropCanvas.width / image.width, x: (image.width - width) / 2, y: (image.height - height) / 2, w: width, h: height };
            drawCrop();
            if (typeof cropDialog.showModal === "function") cropDialog.showModal();
            else cropDialog.setAttribute("open", "open");
          };
          image.onerror = function() {
            URL.revokeObjectURL(url);
            fail(new Error("That file could not be opened as a photo. Use a JPG or PNG."));
          };
          image.src = url;
        }

        if (cropDialog) {
          // While a corner is dragged: { ax, ay }, the corner that stays put.
          // While the box is dragged: { dx, dy }, where in the box it was taken hold of.
          var drag = null;
          cropCanvas.addEventListener("pointerdown", function(event) {
            if (!crop) return;
            var point = cropPoint(event);
            drag = cropCorner(point) || (insideCrop(point) ? { dx: point.x - crop.x, dy: point.y - crop.y } : null);
            if (drag) cropCanvas.setPointerCapture(event.pointerId);
          });
          cropCanvas.addEventListener("pointermove", function(event) {
            if (!crop) return;
            var point = cropPoint(event);
            if (!drag) {
              var corner = cropCorner(point);
              cropCanvas.style.cursor = corner ? corner.cursor : insideCrop(point) ? "move" : "default";
              return;
            }
            if (drag.ax === undefined) {
              crop.x = Math.min(crop.image.width - crop.w, Math.max(0, point.x - drag.dx));
              crop.y = Math.min(crop.image.height - crop.h, Math.max(0, point.y - drag.dy));
            } else {
              resizeCrop(drag, point);
            }
            drawCrop();
          });
          ["pointerup", "pointercancel"].forEach(function(name) {
            cropCanvas.addEventListener(name, function() { drag = null; });
          });
          cropFixed.addEventListener("change", function() {
            if (!crop) return;
            crop.ratio = cropFixed.checked ? crop.slotRatio : 0;
            if (crop.ratio) {
              // Ticked: the box is trimmed to the PDF's shape about its own middle.
              var width = Math.min(crop.w, crop.h * crop.ratio);
              var height = width / crop.ratio;
              crop.x += (crop.w - width) / 2;
              crop.y += (crop.h - height) / 2;
              crop.w = width;
              crop.h = height;
            }
            drawCrop();
          });
          cropDialog.addEventListener("click", function(event) {
            if ((event.target === cropDialog && pressedOn === cropDialog) || (event.target instanceof Element && event.target.closest("[data-one-pager-crop-cancel]"))) closeCrop();
          });
          cropDialog.querySelector("form").addEventListener("submit", function(event) {
            event.preventDefault();
            if (!crop) return;
            var button = cropDialog.querySelector("[type=submit]");
            // The pixels the photo really has in the box, never enlarged: the
            // server works out from them whether it will print sharply.
            var output = document.createElement("canvas");
            output.width = Math.max(1, Math.round(Math.min(OUTPUT_WIDTH, crop.w)));
            output.height = Math.max(1, Math.round(output.width * crop.h / crop.w));
            var context = output.getContext("2d");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, output.width, output.height);
            context.drawImage(crop.image, crop.x, crop.y, crop.w, crop.h, 0, 0, output.width, output.height);
            var slot = crop.slot;
            button.disabled = true;
            output.toBlob(function(blob) {
              var body = new FormData();
              body.append("file", blob, slot + ".jpg");
              fetch(BASE + "/images/" + slot, { method: "POST", body: body }).then(read).then(function(result) {
                button.disabled = false;
                closeCrop();
                swap(result);
                refreshPreview();
                // Too few pixels left to print sharply: the AI can upscale
                // it, once the real children question is answered.
                if (result.upscale) openRedraw(slot, "upscale");
              }).catch(function(error) { button.disabled = false; fail(error); });
            }, "image/jpeg", 0.92);
          });
        }

        // ---- Photos: an AI generated picture from a typed description ----
        var generateDialog = document.querySelector("[data-one-pager-generate-dialog]");
        function closeGenerate() {
          if (typeof generateDialog.close === "function") generateDialog.close();
          else generateDialog.removeAttribute("open");
        }
        if (generateDialog) {
          generateDialog.querySelector("form").addEventListener("submit", function(event) {
            event.preventDefault();
            var form = event.target;
            var submit = form.querySelector("[type=submit]");
            busy(submit, true);
            post(BASE + "/images/" + form.querySelector("[name=slot]").value + "/generate", { prompt: form.querySelector("[name=prompt]").value }).then(function(result) {
              busy(submit, false);
              generateDialog.removeAttribute("data-draft");
              closeGenerate();
              swap(result);
              refreshPreview();
            }).catch(function(error) { busy(submit, false); fail(error); });
          });
        }

        // ---- Email the kindergarten (the Marketing page's email flow) ----
        // Choose the email, it opens in the mail app, then "Did you send it?"
        // and a yes keeps what was sent as a note on the kindergarten.
        function mountDialog(dialog) {
          var blocker = document.createElement("div");
          blocker.className = "modal-page-blocker grid";
          blocker.append(dialog);
          document.body.append(blocker);
          return blocker;
        }
        // A question with one button an answer; resolves the chosen value (null on Escape).
        function ask(message, choices, grid) {
          return new Promise(function(resolve) {
            var dialog = document.createElement("div");
            dialog.className = "email-confirm-dialog text-body grid gap-16" + (grid ? " email-confirm-dialog--choice" : "");
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            var text = document.createElement("p");
            text.textContent = message;
            var actions = document.createElement("div");
            actions.className = "email-confirm-dialog__actions flex justify-end gap-8" + (grid ? " email-confirm-dialog__actions--grid" : "");
            var blocker;
            function finish(value) { blocker.remove(); resolve(value); }
            choices.forEach(function(choice) {
              var choiceButton = document.createElement("button");
              choiceButton.type = "button";
              choiceButton.textContent = choice.label;
              choiceButton.setAttribute("data-one-pager-email-choice", String(choice.value));
              choiceButton.addEventListener("click", function() { finish(choice.value); });
              actions.append(choiceButton);
            });
            dialog.append(text, actions);
            dialog.addEventListener("keydown", function(event) { if (event.key === "Escape") finish(null); });
            blocker = mountDialog(dialog);
            actions.querySelector("button").focus();
          });
        }
        // Subject and body boxes, filled in and editable; resolves { subject, body } or null.
        function askEmailText(centreName, email) {
          return new Promise(function(resolve) {
            var dialog = document.createElement("div");
            dialog.className = "email-confirm-dialog text-body grid gap-16 email-confirm-dialog--form one-pager-email-dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            var title = document.createElement("p");
            title.textContent = "Emailing " + centreName + ".";
            var subjectLabel = document.createElement("label");
            subjectLabel.textContent = "Subject";
            var subject = document.createElement("input");
            subject.type = "text";
            subject.value = email.subject;
            var bodyLabel = document.createElement("label");
            bodyLabel.textContent = "Body";
            var body = document.createElement("textarea");
            body.rows = 14;
            body.value = email.body;
            var actions = document.createElement("div");
            actions.className = "email-confirm-dialog__actions flex justify-end gap-8";
            var cancel = document.createElement("button");
            cancel.type = "button";
            cancel.textContent = "Cancel";
            var go = document.createElement("button");
            go.type = "button";
            go.textContent = "Continue";
            go.setAttribute("data-one-pager-email-continue", "");
            actions.append(cancel, go);
            dialog.append(title, subjectLabel, subject, bodyLabel, body, actions);
            var blocker = mountDialog(dialog);
            function finish(value) { blocker.remove(); resolve(value); }
            cancel.addEventListener("click", function() { finish(null); });
            go.addEventListener("click", function() { finish({ subject: subject.value.trim(), body: body.value }); });
            dialog.addEventListener("keydown", function(event) { if (event.key === "Escape") finish(null); });
            subject.focus();
          });
        }
        async function emailKindergarten(button) {
          var centreName = button.getAttribute("data-centre-name");
          // The service email as it stands in the Text panel, saved or not.
          var emailField = document.querySelector('[data-one-pager-form="text"] [name="email"]');
          var to = (emailField && emailField.value.trim()) || button.getAttribute("data-email-to") || "";
          if (!to) { fail(new Error("There is no email address for " + centreName + ". Add one under Text, Contact us.")); return; }
          var kind = await ask("Choose email type for " + centreName + ".", [
            { label: "Approve changes", value: "approve" },
            { label: "Staff photo", value: "staff-photo" },
            { label: "New", value: "new" },
            { label: "Cancel", value: null },
          ], true);
          if (!kind) return;
          var templates = JSON.parse(button.getAttribute("data-templates") || "{}");
          var start = kind === "new" ? { subject: "", body: "Kia ora " + button.getAttribute("data-greeting") + ",\\n\\n" } : templates[kind];
          var email = await askEmailText(centreName, start);
          if (!email) return;
          // The PDF to attach is downloaded first: a mail link cannot carry a file.
          if (kind === "approve") {
            var download = document.createElement("a");
            download.href = BASE + "/pdf";
            download.download = "";
            document.body.append(download);
            download.click();
            download.remove();
          }
          window.location.href = "mailto:" + to.replace(/[\\r\\n]/g, "") + "?subject=" + encodeURIComponent(email.subject) + "&body=" + encodeURIComponent(email.body);
          var sent = await ask("Did you send the email to " + centreName + "?", [{ label: "No", value: false }, { label: "Yes", value: true }], false);
          if (!sent) return;
          // The Notes panel shows the new note, keeping a note that is being typed.
          post(BASE + "/email-note", { kind: kind, subject: email.subject, body: email.body }).then(function(result) {
            var draft = document.querySelector('[data-one-pager-form="note"] textarea');
            var typed = draft ? draft.value : "";
            swap(result);
            draft = document.querySelector('[data-one-pager-form="note"] textarea');
            if (draft) draft.value = typed;
            // A Staff photo email shows as "Email sent" over the team photo.
            refreshPreview();
          }).catch(fail);
        }

        // ---- Photos: a new picture made from the one in the slot ----
        var regenerateDialog = document.querySelector("[data-one-pager-regenerate-dialog]");
        function closeRegenerate() {
          if (typeof regenerateDialog.close === "function") regenerateDialog.close();
          else regenerateDialog.removeAttribute("open");
        }
        function showRegenerateStep(step) {
          regenerateDialog.querySelectorAll("[data-one-pager-regenerate-step]").forEach(function(part) {
            part.hidden = part.getAttribute("data-one-pager-regenerate-step") !== step;
          });
          if (step === "request") regenerateDialog.querySelector("[name=request]").focus();
        }
        // Sends the slot's picture to be drawn again: action is "regenerate" (a
        // new picture) or "upscale" (the same picture at full size).
        function sendRedraw(slot, action, payload) {
          if (regenerating[slot]) return;
          // The box closes at once, so another photo can be sent while this
          // one is being made.
          regenerating[slot] = true;
          if (regenerateDialog) regenerateDialog.removeAttribute("data-draft");
          closeRegenerate();
          markRegenerating();
          post(BASE + "/images/" + slot + "/" + action, payload).then(function(result) {
            delete regenerating[slot];
            swap(result);
            refreshPreview();
          }).catch(function(error) {
            delete regenerating[slot];
            markRegenerating();
            fail(error);
          });
        }
        // Either way the picture is uploaded, so the question comes first. A
        // picture flagged AI generated skips it.
        function openRedraw(slot, action) {
          var button = document.querySelector('[data-one-pager-regenerate="' + slot + '"]');
          if (!button || !regenerateDialog) return;
          var ai = button.getAttribute("data-ai") === "1";
          var label = button.getAttribute("data-label").toLowerCase();
          var form = regenerateDialog.querySelector("form");
          // Dismissed (a click outside, Esc) and opened again for the same
          // photo: the request typed is still there. Cancel and sending it
          // clear it. The real children question is always asked again.
          var draft = slot + ":" + action;
          var kept = regenerateDialog.getAttribute("data-draft") === draft
            ? { request: form.querySelector("[name=request]").value, option: form.querySelector("[name=option]").value }
            : null;
          form.reset();
          if (kept) {
            form.querySelector("[name=request]").value = kept.request;
            form.querySelector("[name=option]").value = kept.option;
          }
          regenerateDialog.setAttribute("data-draft", draft);
          form.querySelector("[name=slot]").value = slot;
          form.querySelector("[name=action]").value = action;
          form.querySelector("[name=containsRealChildren]").value = "";
          if (action === "upscale" && ai) { sendRedraw(slot, action, {}); return; }
          regenerateDialog.querySelector("[data-one-pager-regenerate-title]").textContent = action === "upscale" ? "Upscale " + label + " with AI" : "Regenerate " + label;
          showRegenerateStep(ai ? "request" : "question");
          if (typeof regenerateDialog.showModal === "function") regenerateDialog.showModal();
          else regenerateDialog.setAttribute("open", "open");
        }
        if (regenerateDialog) {
          regenerateDialog.querySelector("form").addEventListener("submit", function(event) {
            event.preventDefault();
            var form = event.target;
            sendRedraw(form.querySelector("[name=slot]").value, "regenerate", {
              containsRealChildren: form.querySelector("[name=containsRealChildren]").value,
              request: form.querySelector("[name=request]").value,
              option: form.querySelector("[name=option]").value,
            });
          });
        }

        if (fileInput) {
          fileInput.addEventListener("change", function() {
            var file = fileInput.files && fileInput.files[0];
            var slot = fileInput.getAttribute("data-slot");
            fileInput.value = "";
            if (file && slot) openCrop(slot, cropRatio(fileInput.getAttribute("data-ratio")), file);
          });
        }

        // ---- Photos: the AI generated tick. The app sets it on a picture it
        // generated; the user can tick or untick it on any photo. ----
        document.addEventListener("change", function(event) {
          var box = event.target instanceof Element ? event.target.closest("[data-one-pager-ai]") : null;
          if (!box || KEY === null) return;
          var ticked = box.checked;
          box.disabled = true;
          post(BASE + "/images/" + box.getAttribute("data-one-pager-ai") + "/ai-generated", { aiGenerated: ticked }).then(swap).catch(function(error) {
            box.disabled = false;
            box.checked = !ticked;
            fail(error);
          });
        });

        // ---- Kindergartens: the In use tick. Ticking or unticking it asks
        // why first; the reason is kept as a note on the kindergarten. Until
        // it is saved the tick is not: Cancel, Esc or a click outside puts
        // the box back as it was. ----
        var inUseDialog = document.querySelector("[data-one-pager-in-use-dialog]");
        var inUsePending = null; // { box, ticked }
        function closeInUse() {
          if (typeof inUseDialog.close === "function") inUseDialog.close();
          else { inUseDialog.removeAttribute("open"); undoInUse(); }
        }
        function undoInUse() {
          if (!inUsePending) return;
          inUsePending.box.checked = !inUsePending.ticked;
          inUsePending = null;
        }
        document.addEventListener("change", function(event) {
          var box = event.target instanceof Element ? event.target.closest("[data-one-pager-in-use]") : null;
          if (!box || !inUseDialog) return;
          inUsePending = { box: box, ticked: box.checked };
          var form = inUseDialog.querySelector("form");
          form.reset();
          inUseDialog.querySelector("[data-one-pager-in-use-title]").textContent = box.getAttribute("data-centre-name") + (box.checked ? ": in use" : ": not in use");
          if (typeof inUseDialog.showModal === "function") inUseDialog.showModal();
          else inUseDialog.setAttribute("open", "open");
          var reason = form.querySelector("[name=reason]");
          reason.focus();
          reason.select();
        });
        if (inUseDialog) {
          inUseDialog.addEventListener("close", undoInUse);
          inUseDialog.addEventListener("click", function(event) {
            if ((event.target === inUseDialog && pressedOn === inUseDialog) || (event.target instanceof Element && event.target.closest("[data-one-pager-in-use-cancel]"))) closeInUse();
          });
          inUseDialog.querySelector("form").addEventListener("submit", function(event) {
            event.preventDefault();
            if (!inUsePending) return;
            var submit = event.target.querySelector("[type=submit]");
            var centre = inUsePending.box.getAttribute("data-one-pager-in-use");
            submit.disabled = true;
            post("/api/one-pager/" + centre + "/in-use", { inUse: inUsePending.ticked, reason: event.target.querySelector("[name=reason]").value, selected: KEY }).then(function(result) {
              submit.disabled = false;
              inUsePending = null;
              closeInUse();
              // The Notes panel shows the new note, keeping a note that is being typed.
              var draft = document.querySelector('[data-one-pager-form="note"] textarea');
              var typed = draft ? draft.value : "";
              swap(result);
              draft = document.querySelector('[data-one-pager-form="note"] textarea');
              if (draft) draft.value = typed;
              // The open kindergarten's preview drops (or regains) Staff photo needed.
              if (String(KEY) === centre) refreshPreview();
            }).catch(function(error) { submit.disabled = false; fail(error); });
          });
        }

        // ---- Photos: drop a file on a slot's card, the same as choosing it with Replace ----
        var dropCard = null;
        function markDropCard(card) {
          if (card === dropCard) return;
          if (dropCard) dropCard.classList.remove("one-pager-photo--drop");
          dropCard = card;
          if (dropCard) dropCard.classList.add("one-pager-photo--drop");
        }
        function draggedFiles(event) {
          return !!event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], "Files") !== -1;
        }
        function photoCardUnder(event) {
          // Nothing is dropped behind an open dialog.
          if (crop || document.querySelector("dialog[open], .modal-page-blocker")) return null;
          return event.target instanceof Element ? event.target.closest("[data-one-pager-slot]") : null;
        }
        document.addEventListener("dragover", function(event) {
          if (!draggedFiles(event)) return;
          // A file dropped anywhere else on the page must not open in place of the app.
          event.preventDefault();
          var card = photoCardUnder(event);
          event.dataTransfer.dropEffect = card ? "copy" : "none";
          markDropCard(card);
        });
        document.addEventListener("dragleave", function(event) {
          // Left the window.
          if (!event.relatedTarget) markDropCard(null);
        });
        document.addEventListener("drop", function(event) {
          if (!draggedFiles(event)) return;
          event.preventDefault();
          var card = photoCardUnder(event);
          markDropCard(null);
          if (!card) return;
          var file = event.dataTransfer.files && event.dataTransfer.files[0];
          var upload = card.querySelector("[data-one-pager-upload]");
          if (!file || !upload) return;
          if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) === -1) {
            fail(new Error("That file could not be opened as a photo. Use a JPG or PNG."));
            return;
          }
          openCrop(card.getAttribute("data-one-pager-slot"), cropRatio(upload.getAttribute("data-ratio")), file);
        });

        document.addEventListener("click", function(event) {
          var target = event.target instanceof Element ? event.target : null;
          if (!target || KEY === null) return;
          var button;

          if ((button = target.closest("[data-one-pager-upload]"))) {
            fileInput.setAttribute("data-slot", button.getAttribute("data-one-pager-upload"));
            fileInput.setAttribute("data-ratio", button.getAttribute("data-ratio"));
            fileInput.click();
          } else if ((button = target.closest("[data-one-pager-generate]"))) {
            // Only the description typed here goes to OpenAI; the picture that
            // comes back is stored flagged as AI generated.
            var form = generateDialog.querySelector("form");
            var generateSlot = button.getAttribute("data-one-pager-generate");
            // Dismissed (a click outside, Esc) and opened again for the same
            // photo: the description typed is still there. Cancel and a
            // generated picture clear it.
            if (generateDialog.getAttribute("data-draft") !== generateSlot) {
              form.reset();
              form.querySelector("[name=prompt]").value = button.getAttribute("data-prompt") || "";
            }
            generateDialog.setAttribute("data-draft", generateSlot);
            form.querySelector("[name=slot]").value = generateSlot;
            generateDialog.querySelector("[data-one-pager-generate-title]").textContent = "Generate " + button.getAttribute("data-label").toLowerCase() + " with AI";
            if (typeof generateDialog.showModal === "function") generateDialog.showModal();
            else generateDialog.setAttribute("open", "open");
            form.querySelector("[name=prompt]").focus();
          } else if (target.closest("[data-one-pager-generate-cancel]")) {
            generateDialog.removeAttribute("data-draft");
            closeGenerate();
          } else if (target === generateDialog) {
            if (pressedOn === generateDialog) closeGenerate();
          } else if ((button = target.closest("[data-one-pager-regenerate]"))) {
            openRedraw(button.getAttribute("data-one-pager-regenerate"), "regenerate");
          } else if ((button = target.closest("[data-one-pager-real-children]"))) {
            var redrawForm = regenerateDialog.querySelector("form");
            if (button.getAttribute("data-one-pager-real-children") === "yes") {
              regenerateDialog.removeAttribute("data-draft");
              closeRegenerate();
              window.alert("This image was not sent. An image with real children in it is never uploaded.");
            } else if (redrawForm.querySelector("[name=action]").value === "upscale") {
              // Upscaling asks for nothing more: it is the same picture, larger.
              sendRedraw(redrawForm.querySelector("[name=slot]").value, "upscale", { containsRealChildren: "no" });
            } else {
              regenerateDialog.querySelector("[name=containsRealChildren]").value = "no";
              showRegenerateStep("request");
            }
          } else if (target.closest("[data-one-pager-regenerate-cancel]")) {
            regenerateDialog.removeAttribute("data-draft");
            closeRegenerate();
          } else if (target === regenerateDialog) {
            if (pressedOn === regenerateDialog) closeRegenerate();
          } else if ((button = target.closest("[data-one-pager-revert]"))) {
            // Swaps the photo with the one it replaced; pressing it again swaps them back.
            var revertButton = button;
            busy(revertButton, true);
            post(BASE + "/images/" + revertButton.getAttribute("data-one-pager-revert") + "/revert").then(function(result) { swap(result); refreshPreview(); }).catch(function(error) { busy(revertButton, false); fail(error); });
          } else if ((button = target.closest("[data-one-pager-download]"))) {
            var photoLink = document.createElement("a");
            photoLink.href = button.getAttribute("data-one-pager-download");
            photoLink.download = button.getAttribute("data-filename") || "";
            document.body.append(photoLink);
            photoLink.click();
            photoLink.remove();
          } else if ((button = target.closest("[data-one-pager-remove]"))) {
            if (!window.confirm("Remove " + button.getAttribute("data-label") + "?")) return;
            post(BASE + "/images/" + button.getAttribute("data-one-pager-remove") + "/delete").then(function(result) { swap(result); refreshPreview(); }).catch(fail);
          } else if ((button = target.closest("[data-one-pager-use-shared]"))) {
            var box = document.querySelector('[data-one-pager-form="text"] [name="' + button.getAttribute("data-one-pager-use-shared") + '"]');
            if (box) box.value = "";
          } else if ((button = target.closest("[data-one-pager-prefill]"))) {
            var prefillButton = button;
            busy(prefillButton, true);
            post(BASE + "/prefill").then(function(result) {
              busy(prefillButton, false);
              Object.keys(result.contact || {}).forEach(function(name) {
                var field = document.querySelector('[data-one-pager-form="text"] [name="' + name + '"]');
                if (field && result.contact[name]) field.value = result.contact[name];
              });
            }).catch(function(error) { busy(prefillButton, false); fail(error); });
          } else if ((button = target.closest("[data-one-pager-draft]"))) {
            var about = document.querySelector('[data-one-pager-form="text"] [name="aboutUs"]');
            // What is in the box is what the draft is written from, with anything held about the kindergarten.
            if (!about || (about.value.trim() && !window.confirm("Rewrite the About us text as a new draft?"))) return;
            var draftButton = button;
            busy(draftButton, true);
            post(BASE + "/draft-about", { notes: about.value }).then(function(result) {
              busy(draftButton, false);
              about.value = result.text || "";
              about.focus();
            }).catch(function(error) { busy(draftButton, false); fail(error); });
          } else if ((button = target.closest("[data-one-pager-email]"))) {
            emailKindergarten(button);
          }
        });
      })();
    </script>
  `;
}

// The nav rail every page shares; `current` is this page's href.
export function renderOnePagerNavRail(): string {
  const items: Array<[string, string, string, string]> = [
    ["/", "Back to landing", "Landing", "bi-house-door"],
    ["/app", "Online Marketing dashboard", "Online Marketing", "bi-bar-chart-line"],
    ["/tasks", "Tasks", "Tasks", "bi-check2-square"],
    ["/one-pager", "Info Sheets", "Info Sheets", "bi-file-earmark-richtext"],
    ["/comms", "Online Communications dashboard", "Online Communications", "bi-envelope-paper"],
    ["/jd", "Job Descriptions", "Job Descriptions", "bi-file-earmark-person"],
    ["/budget", "Budget", "Budget", "bi-piggy-bank"],
    ["/wiki", "Things To Know", "Things To Know", "bi-journal-bookmark"],
  ];
  return `
    <aside class="nav-rail flex flex-col items-center gap-6" aria-label="Primary navigation">
      ${items
        .map(([href, label, title, icon]) => {
          const current = href === "/one-pager";
          return `<a class="nav-rail__item inline-flex items-center justify-center text-muted${current ? " nav-rail__item--current" : ""}" href="${href}" aria-label="${label}" title="${title}"${current ? ' aria-current="page"' : ""}><i class="bi ${icon}" aria-hidden="true"></i></a>`;
        })
        .join("\n      ")}
    </aside>`;
}

export function renderOnePagerAppShell(data: OnePagerPageData, openPanelId: string | null = null): string {
  const fragments = renderOnePagerFragments(data, ["list", "text", "photos", "notes", "shared"]);
  const selected = data.selected;
  const name = selected?.centre.name ?? "";
  const key = selected?.centre.centreKey ?? null;

  // Email the kindergarten about its sheet (opens the mail app, as on the
  // Marketing page). The two ready-made emails are written here so the
  // script only has to open them.
  const greeting = data.emailContact?.greeting ?? "there";
  const emailTemplates = selected
    ? { approve: buildOnePagerEmail("approve", { centreName: name, greeting }), "staff-photo": buildOnePagerEmail("staff-photo", { centreName: name, greeting }) }
    : null;
  const emailAction = selected
    ? `<button class="panel-action-link" type="button" data-one-pager-email data-centre-name="${escapeHtml(name)}" data-greeting="${escapeHtml(greeting)}" data-email-to="${escapeHtml(data.emailContact?.to ?? selected.onePager.email)}" data-templates="${escapeHtml(JSON.stringify(emailTemplates))}"><i class="bi bi-envelope ui-icon" aria-hidden="true"></i><span>Email kindergarten</span></button>`
    : "";
  const previewActions = selected ? `${emailAction}${renderPrintAction({ label: `Download the ${name} info sheet as a PDF to print`, href: `/api/one-pager/${key}/pdf` })}` : "";
  const preview = selected
    ? `<div class="one-pager-preview__fit badge badge--warning" data-one-pager-fit hidden></div>
       <iframe class="one-pager-preview__frame" data-one-pager-preview title="${escapeHtml(name)} info sheet preview"></iframe>`
    : `<span class="text-empty">Choose a kindergarten.</span>`;

  // Only the list and the shared text make sense before a kindergarten is chosen.
  const panels = [
    { id: "one-pager-list", title: "Kindergartens", className: "panel--one-pager-list", children: fragment("list", fragments.list ?? "") },
    ...(selected
      ? [
          { id: "one-pager-text", title: "Text", className: "panel--one-pager-text", children: fragment("text", fragments.text ?? "") },
          { id: "one-pager-photos", title: "Photos", className: "panel--one-pager-photos", children: fragment("photos", fragments.photos ?? "") },
          { id: "one-pager-notes", title: "Notes", className: "panel--one-pager-notes", children: fragment("notes", fragments.notes ?? "") },
        ]
      : []),
    { id: "one-pager-shared", title: "Shared Text", className: "panel--one-pager-shared", children: fragment("shared", fragments.shared ?? "") },
    { id: "one-pager-preview", title: selected ? name : "Preview", className: "panel--one-pager-preview", sidePanel: true, actions: previewActions, children: preview },
  ];
  const layout = renderLayout({ panels, openPanelId: openPanelId ?? (selected ? "one-pager-text" : "one-pager-list") });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper - Info Sheets</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="app-shell-body">
    ${renderOnePagerNavRail()}
    ${layout}
    <input type="file" accept="image/jpeg,image/png,image/webp" data-one-pager-file hidden />
    <dialog class="wiki-modal one-pager-crop text-body" data-one-pager-crop aria-label="Crop the photo">
      <form class="wiki-modal__form flex flex-col gap-12">
        <h2 class="wiki-modal__title text-strong">Crop the photo</h2>
        <canvas class="one-pager-crop__canvas"></canvas>
        <label class="one-pager-crop__fixed inline-flex items-center gap-6 text-small text-muted"><input type="checkbox" checked data-one-pager-crop-fixed /><span>Fix crop to the PDF's photo shape</span></label>
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-one-pager-crop-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md">Use photo</button>
        </div>
      </form>
    </dialog>
    <dialog class="wiki-modal wiki-modal--wide text-body" data-one-pager-generate-dialog aria-label="Generate with AI">
      <form class="wiki-modal__form flex flex-col gap-12">
        <input type="hidden" name="slot" value="" />
        <h2 class="wiki-modal__title text-strong" data-one-pager-generate-title>Generate with AI</h2>
        <label class="field-label"><span>Describe the picture</span><textarea class="form-control" name="prompt" rows="8" maxlength="4000" required></textarea></label>
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-one-pager-generate-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md"><i class="bi bi-stars" aria-hidden="true"></i>Generate</button>
        </div>
      </form>
    </dialog>
    <dialog class="wiki-modal wiki-modal--wide text-body" data-one-pager-in-use-dialog aria-label="In use">
      <form class="wiki-modal__form flex flex-col gap-12">
        <h2 class="wiki-modal__title text-strong" data-one-pager-in-use-title>In use</h2>
        <label class="field-label"><span>Reason</span><textarea class="form-control" name="reason" rows="4" maxlength="${ONE_PAGER_NOTE_MAX}" required>${escapeHtml(ONE_PAGER_IN_USE_REASON)}</textarea></label>
        <div class="wiki-modal__actions flex justify-end gap-8">
          <button type="button" class="wiki-modal__cancel button-md" data-one-pager-in-use-cancel><span>Cancel</span></button>
          <button type="submit" class="wiki-modal__submit button-md">Save</button>
        </div>
      </form>
    </dialog>
    <dialog class="wiki-modal wiki-modal--wide text-body" data-one-pager-regenerate-dialog aria-label="Regenerate">
      <form class="wiki-modal__form flex flex-col gap-12">
        <input type="hidden" name="slot" value="" />
        <input type="hidden" name="containsRealChildren" value="" />
        <input type="hidden" name="action" value="regenerate" />
        <h2 class="wiki-modal__title text-strong" data-one-pager-regenerate-title>Regenerate</h2>
        <div class="one-pager-regenerate__step flex flex-col gap-12" data-one-pager-regenerate-step="question">
          <strong class="text-strong">${escapeHtml(REAL_CHILDREN_QUESTION)}</strong>
          <div class="wiki-modal__actions flex justify-end gap-8">
            <button type="button" class="wiki-modal__cancel button-md" data-one-pager-regenerate-cancel><span>Cancel</span></button>
            <button type="button" class="button-md" data-one-pager-real-children="yes">Yes</button>
            <button type="button" class="button-md" data-one-pager-real-children="no">No</button>
          </div>
        </div>
        <div class="one-pager-regenerate__step flex flex-col gap-12" data-one-pager-regenerate-step="request" hidden>
          <label class="field-label"><span>What would you like to see?</span><textarea class="form-control" name="request" rows="5" maxlength="4000"></textarea></label>
          <label class="field-label"><span>If left empty</span><select class="form-control" name="option">${REGENERATION_OPTIONS.map((option) => `<option value="${option.key}">${escapeHtml(option.label)}</option>`).join("")}</select></label>
          <div class="wiki-modal__actions flex justify-end gap-8">
            <button type="button" class="wiki-modal__cancel button-md" data-one-pager-regenerate-cancel><span>Cancel</span></button>
            <button type="submit" class="wiki-modal__submit button-md"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Regenerate</button>
          </div>
        </div>
      </form>
    </dialog>
    ${renderOnePagerScript(key)}
  </body>
</html>`;
}
