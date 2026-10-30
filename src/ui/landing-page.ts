import type { TaskReminderFeed, TaskReminderView } from "../storage/task-store.js";
import type { LandingIntelligenceFeed, LandingIntelligenceItem } from "../landing-intelligence.js";
import { THEME_HEAD_SCRIPT, renderThemePicker } from "./theme.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// "Overdue by 3 days" / "Due today" / "Due in 2 days" from a signed
// days-until-due count.
function dueLabelFromDays(days: number): string {
  if (days < 0) {
    const n = Math.abs(days);
    return `Overdue by ${n} day${n === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function renderReminderChecklist(reminder: TaskReminderView): string {
  const items = reminder.nextChecklist ?? [];
  if (items.length === 0) return "";
  return `
      <ul class="landing-reminder__checklist flex flex-col gap-6" aria-label="Next checklist items">
        ${items
          .map(
            (item) => `
          <li class="landing-reminder__check grid${item.daysUntilDue != null && item.daysUntilDue < 0 ? " landing-reminder__check--overdue" : ""}">
            <i class="bi bi-square" aria-hidden="true"></i>
            <span class="landing-reminder__check-label">${escapeHtml(item.label)}</span>
            ${item.daysUntilDue != null ? `<span class="landing-reminder__check-due text-muted">${escapeHtml(dueLabelFromDays(item.daysUntilDue))}</span>` : ""}
          </li>`,
          )
          .join("")}
      </ul>
  `;
}

function renderReminderItem(reminder: TaskReminderView, overdue: boolean): string {
  const meta = [reminder.projectName, reminder.assigneeName]
    .filter((value): value is string => Boolean(value))
    .map((value) => escapeHtml(value))
    .join(" · ");
  return `
    <a class="landing-reminder flex flex-col gap-4 text-body${overdue ? " landing-reminder--overdue" : ""}" href="/tasks?task=${reminder.id}">
      <span class="landing-reminder__due label-case text-muted">${escapeHtml(dueLabelFromDays(reminder.daysUntilDue))}</span>
      <span class="landing-reminder__title font-strong text-strong">${escapeHtml(reminder.title)}</span>
      ${meta ? `<span class="landing-reminder__meta text-muted">${meta}</span>` : ""}
      ${renderReminderChecklist(reminder)}
    </a>
  `;
}

function renderKtcaReminderItem(reminder: KtcaReminder): string {
  const label = reminder.expired
    ? `Expired ${Math.abs(reminder.daysUntilExpiry)} day${Math.abs(reminder.daysUntilExpiry) === 1 ? "" : "s"} ago`
    : `Expires in ${reminder.daysUntilExpiry} day${reminder.daysUntilExpiry === 1 ? "" : "s"}`;
  return `
    <a class="landing-reminder flex flex-col gap-4 text-body landing-reminder--overdue" href="/jd?panel=jd-settings">
      <span class="landing-reminder__due label-case text-muted">${escapeHtml(label)}</span>
      <span class="landing-reminder__title font-strong text-strong">KTCA agreement needs updating</span>
      <span class="landing-reminder__meta text-muted">Import the new Kindergarten Teachers Collective Agreement</span>
    </a>
  `;
}

export type KtcaReminder = {
  expired: boolean;
  daysUntilExpiry: number;
};

// Amber once no Postmark webhook event has arrived for 3 days, red at 7.
// Webhooks are the only Postmark data source (no server token), and Postmark
// does not backfill, so a silent gap is unrecoverable — it gets top billing.
export const POSTMARK_ALERT_AMBER_DAYS = 3;
export const POSTMARK_ALERT_RED_DAYS = 7;

export type PostmarkAlert = {
  level: "amber" | "red";
  // Whole days since the last event arrived; null when none ever has.
  daysSinceLastEvent: number | null;
};

function renderPostmarkAlert(alert: PostmarkAlert | null | undefined): string {
  if (!alert) return "";
  const detail =
    alert.daysSinceLastEvent == null
      ? "No Postmark webhook events have ever been received."
      : `No Postmark webhook events received for ${alert.daysSinceLastEvent} day${alert.daysSinceLastEvent === 1 ? "" : "s"}.`;
  const heading =
    alert.level === "red" ? "Postmark webhooks have stopped" : "Postmark webhooks look quiet";
  return `
    <section class="landing-alert landing-alert--${alert.level}" role="alert" aria-label="Postmark webhook alert">
      <a class="landing-alert__link flex items-start gap-12" href="/comms?panel=postmark">
        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
        <span class="landing-alert__body flex flex-col">
          <span class="landing-alert__heading font-strong">${escapeHtml(heading)}</span>
          <span class="landing-alert__detail">${escapeHtml(detail)} Check the Cloudflare tunnel and the Postmark webhook settings.</span>
        </span>
      </a>
    </section>
  `;
}

function renderReminders(reminders: TaskReminderFeed | undefined, ktcaReminder?: KtcaReminder | null): string {
  const taskItems = reminders
    ? [
        ...reminders.overdue.map((reminder) => renderReminderItem(reminder, true)),
        ...reminders.dueSoon.map((reminder) => renderReminderItem(reminder, false)),
      ]
    : [];
  const items = [...(ktcaReminder ? [renderKtcaReminderItem(ktcaReminder)] : []), ...taskItems].join("");
  const total = (reminders?.total ?? 0) + (ktcaReminder ? 1 : 0);
  if (total === 0) return "";
  const overdueCount = (reminders?.overdue.length ?? 0) + (ktcaReminder ? 1 : 0);
  const heading = overdueCount > 0 ? `${overdueCount} overdue · ${total} need attention` : `${total} due soon`;
  return `
    <aside class="landing__reminders flex flex-col gap-10" aria-label="Task reminders">
      <h2 class="landing-reminders__heading font-strong label-case text-muted">${escapeHtml(heading)}</h2>
      <div class="landing-reminders__list flex flex-col gap-10">${items}</div>
    </aside>
  `;
}

function formatFeedTime(value: string | null) {
  if (!value) return "Waiting for first refresh";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Waiting for first refresh";

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderFeedItem(item: LandingIntelligenceItem) {
  const icon =
    item.kind === "weather"
      ? "bi-cloud-rain"
      : item.kind === "ai-model"
        ? "bi-cpu"
        : item.kind === "system"
          ? "bi-info-circle"
          : "bi-newspaper";
  const body = `
    <span class="landing-feed-item__icon inline-flex justify-center"><i class="bi ${icon}" aria-hidden="true"></i></span>
    <span class="landing-feed-item__content min-w-0 flex items-center gap-8 nowrap">
      <span class="landing-feed-item__title min-w-0 nowrap font-strong">${escapeHtml(item.title)}</span>
      <span class="landing-feed-item__meta min-w-0 nowrap text-body">${escapeHtml(item.source)}${item.publishedAt ? ` · ${escapeHtml(formatFeedTime(item.publishedAt))}` : ""}</span>
    </span>
  `;

  if (item.href) {
    return `
      <a class="landing-feed-item min-w-0 flex items-center gap-8 text-body nowrap${item.urgent ? " landing-feed-item--urgent" : ""}" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer" data-feed-href="${escapeHtml(item.href)}">
        ${body}
      </a>
    `;
  }

  return `
    <div class="landing-feed-item min-w-0 flex items-center gap-8 text-body nowrap${item.urgent ? " landing-feed-item--urgent" : ""}">
      ${body}
    </div>
  `;
}

function renderSearchTextControls(searchTexts: string[]) {
  const items = searchTexts.length
    ? searchTexts
        .map(
          (text) => `
            <li class="landing-feed-search__item inline-flex items-center min-w-0 text-body text-small">
              <span>${escapeHtml(text)}</span>
              <button type="button" data-remove-landing-search-text="${escapeHtml(text)}" aria-label="Remove ${escapeHtml(text)}">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </li>
          `,
        )
        .join("")
    : `<li class="landing-feed-search__empty text-muted text-small">No extra search text saved</li>`;

  return `
    <div class="landing-feed-search grid gap-8" data-landing-search-panel hidden>
      <form class="landing-feed-search__form grid gap-6" data-landing-search-form>
        <input type="text" name="text" maxlength="180" autocomplete="off" placeholder="Add search text" aria-label="Search text" required />
        <button type="submit" aria-label="Add search text"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>
      </form>
      <ul class="landing-feed-search__list flex flex-wrap gap-6" data-landing-search-list>${items}</ul>
      <p class="landing-feed-search__status text-muted text-small" data-landing-search-status aria-live="polite"></p>
    </div>
  `;
}

export function renderLandingIntelligenceFeed(feed: LandingIntelligenceFeed | undefined) {
  const fallback: LandingIntelligenceItem = {
    id: "feed-loading",
    kind: "system",
    title: "Gathering local intelligence",
    brief: "News, weather, and AI model checks will appear here after the first refresh.",
    href: null,
    source: "Marketing Helper AI",
    publishedAt: null,
    urgent: false,
  };
  const items = feed?.items.length ? feed.items : [fallback];
  const statusLabel =
    feed?.status === "refreshing"
      ? "Refreshing"
      : feed?.status === "error"
        ? "Source issue"
        : "Live RSS";
  const searchTexts = feed?.searchTexts ?? [];

  return `
    <section class="landing-feed grid gap-8 text-body" aria-label="Local intelligence feed" data-landing-feed>
      <header class="landing-feed__header flex justify-between items-start gap-16">
        <div>
          <p class="landing-feed__meta">Updated ${escapeHtml(formatFeedTime(feed?.generatedAt ?? null))} · ${escapeHtml(statusLabel)}</p>
        </div>
        <div class="landing-feed__actions flex flex-wrap justify-end gap-6">
          <button type="button" class="landing-feed__copy text-small nowrap" data-toggle-landing-search aria-expanded="false" aria-label="Open RSS search text">
            <i class="bi bi-search" aria-hidden="true"></i>
            <span>Search text</span>
          </button>
          <button type="button" class="landing-feed__copy text-small nowrap" data-copy-landing-feed aria-label="Copy RSS feed to clipboard">
            <i class="bi bi-clipboard" aria-hidden="true"></i>
            <span>Copy to clipboard</span>
          </button>
        </div>
      </header>
      ${renderSearchTextControls(searchTexts)}
      ${feed?.error ? `<p class="landing-feed__error">${escapeHtml(feed.error)}</p>` : ""}
      <div class="landing-feed__viewport" tabindex="0" aria-label="Scrolling local intelligence stories">
        <div class="landing-feed__list grid landing-feed__list--scroll">
          ${[...items, ...items].map(renderFeedItem).join("")}
        </div>
      </div>
    </section>
  `;
}

export type LandingPageOptions = {
  reminders?: TaskReminderFeed;
  intelligenceFeed?: LandingIntelligenceFeed;
  ktcaReminder?: KtcaReminder | null;
  postmarkAlert?: PostmarkAlert | null;
};

export function renderLandingPage(options: LandingPageOptions = {}) {
  const tiles = [
    { label: "Marketing", description: "Infocare, Meta Ads & Google Analytics", href: "/app", primary: true },
    { label: "Tasks", description: "Tasks, projects & reminders", href: "/tasks", primary: true },
    { label: "General Chat", description: "General help with saved conversations", href: "/chat", primary: true },
    { label: "Communications", description: "Postmark, Mailchimp & Formstack", href: "/comms", primary: false },
    { label: "Job Descriptions", description: "AI blurbs & PDF job descriptions", href: "/jd", primary: false },
    { label: "Things To Know", description: "Marketing wiki wired into AI chat", href: "/wiki", primary: false },
  ];

  const secondaryTiles = [
    { label: "Read Me", href: "/readme", external: false },
    { label: "Open Upscalar", href: "upscalar://open", external: false },
    { label: "SharePoint", href: "https://ikindergartens.sharepoint.com/", external: true },
    { label: "Website", href: "https://inspiredkindergartens.nz/admin/", external: true },
    { label: "Code Snippets", href: "/snippets", external: false },
    { label: "Links", href: "/subscriptions", external: false },
    { label: "Sector Insight", href: "/sector", external: false },
  ];

  const placeholderTiles: string[] = [];

  const remindersHtml = renderReminders(options.reminders, options.ktcaReminder);

  const secondaryTileRow = secondaryTiles
    .map(
      (tile) => `
        <a class="landing-tile flex items-center justify-center text-muted label-case landing-tile--link" href="${escapeHtml(tile.href)}"${tile.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
          <span>${escapeHtml(tile.label)}</span>
        </a>
      `,
    )
    .join("");

  const buttonRow = tiles
    .map(
      (tile) => `
        <a class="landing-button flex flex-col gap-6 text-body${tile.primary ? " landing-button--primary" : ""}" href="${escapeHtml(tile.href)}">
          <span class="landing-button__label font-strong text-strong">${escapeHtml(tile.label)}</span>
          <span class="landing-button__description text-muted">${escapeHtml(tile.description)}</span>
        </a>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="landing-body">
    <div class="landing-layout${remindersHtml ? " landing-layout--with-sidebar" : ""}">
    <main class="landing">
      ${renderPostmarkAlert(options.postmarkAlert)}
      <header class="landing__header flex justify-center">
        <h1 class="landing__title font-strong label-case text-strong">Marketing Helper AI</h1>
      </header>
      <video class="landing__hero" autoplay muted playsinline preload="auto" aria-hidden="true">
        <source src="/assets/beepbeep-intro.mp4" type="video/mp4" />
      </video>
      <p class="landing__tagline text-muted">Local marketing &amp; enrolment intelligence for kindergartens.</p>
      <nav class="landing__buttons grid" aria-label="Primary navigation">
        ${buttonRow}
      </nav>
      <section class="landing__tiles flex flex-wrap justify-center gap-12" aria-label="Upcoming tools">
        ${secondaryTileRow}
        ${placeholderTiles.join("")}
      </section>
      ${renderLandingIntelligenceFeed(options.intelligenceFeed)}
      <footer class="landing__footer flex justify-center flex-wrap gap-12">
        <a class="landing__github inline-flex items-center gap-8 text-muted" href="/contacts/upload">
          <i class="bi bi-person-lines-fill" aria-hidden="true"></i>
          <span>Upload Contacts</span>
        </a>
        <button type="button" class="landing__restart inline-flex items-center gap-8 text-muted" data-restart aria-label="Restart the server">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
          <span class="landing__restart-label">Restart server</span>
        </button>
        ${(options.intelligenceFeed?.aiModel?.isUpgrade ?? true) ? `<button type="button" class="landing__restart inline-flex items-center gap-8 text-muted" data-update-ai-model aria-label="Update the local AI model">
          <i class="bi bi-cpu" aria-hidden="true"></i>
          <span class="landing__update-ai-label">Update AI model</span>
        </button>` : ""}
        <button type="button" class="landing__restart inline-flex items-center gap-8 text-muted" data-rollback-ai-model aria-label="Rollback the local AI model"${options.intelligenceFeed?.aiModel?.fallbackModel ? "" : " disabled"}>
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
          <span class="landing__rollback-ai-label">Rollback AI model</span>
        </button>
        <a class="landing__github inline-flex items-center gap-8 text-muted" href="/settings/infocare">
          <i class="bi bi-shield-lock" aria-hidden="true"></i>
          <span>Infocare Login</span>
        </a>
        <button type="button" class="landing__restart inline-flex items-center gap-8 text-muted" data-backup aria-label="Save a full backup of the app's data on this computer">
          <i class="bi bi-database-down" aria-hidden="true"></i>
          <span class="landing__backup-label">Back up data</span>
        </button>
        <a class="landing__github inline-flex items-center gap-8 text-muted" href="https://github.com/Inspired-Kindergartens/Marketing-HELPER-AI" target="_blank" rel="noopener noreferrer">
          <i class="bi bi-github" aria-hidden="true"></i>
          <span>View on GitHub</span>
        </a>
        ${renderThemePicker()}
      </footer>
    </main>
    ${remindersHtml}
    </div>
    <script>
      (function () {
        var btn = document.querySelector("[data-restart]");
        if (!btn) return;
        var label = btn.querySelector(".landing__restart-label");
        btn.addEventListener("click", function () {
          if (btn.disabled) return;
          if (!window.confirm("Restart the server? The app will be briefly unavailable while it comes back up.")) {
            return;
          }
          btn.disabled = true;
          if (label) label.textContent = "Restarting…";
          fetch("/actions/restart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }).catch(function () {
            // The process exits mid-request, so a network error here is expected.
          });
          // Poll /health until the freshly respawned server answers, then reload.
          var deadline = Date.now() + 90000;
          function poll() {
            if (Date.now() > deadline) {
              if (label) label.textContent = "Restart server";
              btn.disabled = false;
              return;
            }
            fetch("/health", { cache: "no-store" })
              .then(function (res) {
                if (res.ok) {
                  if (label) label.textContent = "Back online — reloading…";
                  window.location.reload();
                } else {
                  setTimeout(poll, 1500);
                }
              })
              .catch(function () {
                setTimeout(poll, 1500);
              });
          }
          setTimeout(poll, 3000);
        });
      })();
      (function () {
        function bindAction(selector, labelSelector, confirmText, endpoint, busyText, doneText) {
          var btn = document.querySelector(selector);
          if (!btn) return;
          var label = btn.querySelector(labelSelector);
          btn.addEventListener("click", function () {
            if (btn.disabled) return;
            if (!window.confirm(confirmText)) {
              return;
            }
            btn.disabled = true;
            if (label) label.textContent = busyText;
            fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            })
              .then(function (res) { return res.json(); })
              .then(function (payload) {
                if (label) label.textContent = payload.ok ? doneText : "Action failed";
                setTimeout(function () { window.location.reload(); }, 2500);
              })
              .catch(function () {
                if (label) label.textContent = "Action failed";
                btn.disabled = false;
              });
          });
        }
        bindAction(
          "[data-rollback-ai-model]",
          ".landing__rollback-ai-label",
          "Rollback AI Chat to the fallback model?",
          "/actions/rollback-ai-model",
          "Rolling back...",
          "Rolled back"
        );
      })();
      (function () {
        var btn = document.querySelector("[data-backup]");
        if (!btn) return;
        var label = btn.querySelector(".landing__backup-label");
        var defaultText = "Back up data";
        function done(text) {
          if (label) label.textContent = text;
          setTimeout(function () {
            if (label) label.textContent = defaultText;
            btn.disabled = false;
          }, 4000);
        }
        btn.addEventListener("click", function () {
          if (btn.disabled) return;
          if (!window.confirm("Create a full backup (database, uploads and credential files)? It is saved in the app's backups folder on this computer. It contains passwords and API keys, so keep it somewhere safe.")) {
            return;
          }
          btn.disabled = true;
          if (label) label.textContent = "Backing up…";
          fetch("/actions/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (!payload.ok) {
                done("Backup failed");
                return;
              }
              window.alert("Backup saved on this computer: " + payload.path);
              done("Backup saved");
            })
            .catch(function () {
              done("Backup failed");
            });
        });
      })();
      (function () {
        var btn = document.querySelector("[data-update-ai-model]");
        if (!btn) return;
        var label = btn.querySelector(".landing__update-ai-label");
        var defaultText = "Update AI model";
        function setLabel(text) {
          if (label) label.textContent = text;
        }
        function reset(message) {
          setLabel(message);
          setTimeout(function () {
            setLabel(defaultText);
            btn.disabled = false;
          }, 4000);
        }
        function pollStatus(deadline) {
          fetch("/actions/update-ai-model/status", { cache: "no-store" })
            .then(function (res) { return res.json(); })
            .then(function (status) {
              if (status.state === "success") {
                setLabel("Model updated — reloading…");
                setTimeout(function () { window.location.reload(); }, 2000);
                return;
              }
              if (status.state === "error") {
                reset("Update failed");
                return;
              }
              if (status.state === "downloading") {
                var progress = typeof status.progress === "number" ? " " + status.progress + "%" : "";
                var detail = status.detail ? " (" + status.detail + ")" : "";
                setLabel("Downloading…" + progress + detail);
              }
              if (Date.now() > deadline) {
                reset("Still running — check again later");
                return;
              }
              setTimeout(function () { pollStatus(deadline); }, 2000);
            })
            .catch(function () {
              if (Date.now() > deadline) {
                reset("Still running — check again later");
                return;
              }
              setTimeout(function () { pollStatus(deadline); }, 2000);
            });
        }
        // If a download is already running (e.g. the page was reloaded mid-update),
        // pick the progress display back up instead of showing the idle button.
        fetch("/actions/update-ai-model/status", { cache: "no-store" })
          .then(function (res) { return res.json(); })
          .then(function (status) {
            if (status.state === "downloading") {
              btn.disabled = true;
              setLabel("Downloading…");
              pollStatus(Date.now() + 45 * 60 * 1000);
            }
          })
          .catch(function () {});
        btn.addEventListener("click", function () {
          if (btn.disabled) return;
          if (!window.confirm("Pull the recommended Ollama model and set it for AI Chat? The current model will be kept as rollback fallback.")) {
            return;
          }
          btn.disabled = true;
          setLabel("Starting…");
          fetch("/actions/update-ai-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (!payload.ok) {
                reset("Update failed");
                return;
              }
              // Poll for up to 45 minutes — qwen3:8b is a ~5 GB download.
              pollStatus(Date.now() + 45 * 60 * 1000);
            })
            .catch(function () {
              reset("Update failed");
            });
        });
      })();
      (function () {
        var feed = document.querySelector("[data-landing-feed]");
        if (!feed) return;
        var OPENED_KEY = "landingFeedOpenedLinks";
        function getOpened() {
          try {
            return JSON.parse(window.localStorage.getItem(OPENED_KEY) || "[]");
          } catch (err) {
            return [];
          }
        }
        function markOpened(href) {
          var opened = getOpened();
          if (opened.indexOf(href) === -1) {
            opened.push(href);
            try {
              window.localStorage.setItem(OPENED_KEY, JSON.stringify(opened));
            } catch (err) {
              // Ignore storage failures (e.g. private browsing quota).
            }
          }
        }
        function applyOpenedState(root) {
          var opened = getOpened();
          root.querySelectorAll("[data-feed-href]").forEach(function (link) {
            var href = link.getAttribute("data-feed-href");
            link.classList.toggle("landing-feed-item--opened", opened.indexOf(href) !== -1);
          });
        }
        function setCopyButtonState(button, text, disabled) {
          var label = button.querySelector("span");
          if (label) label.textContent = text;
          button.disabled = Boolean(disabled);
        }
        function writePlainTextFallback(text) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
          }
          var textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "");
          textarea.className = "clipboard-buffer";
          document.body.appendChild(textarea);
          textarea.select();
          var copied = document.execCommand("copy");
          textarea.remove();
          return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard unavailable"));
        }
        function copyHtmlFallback(html) {
          var container = document.createElement("div");
          container.contentEditable = "true";
          container.className = "clipboard-buffer";
          container.innerHTML = html;
          document.body.appendChild(container);
          var range = document.createRange();
          range.selectNodeContents(container);
          var selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          var copied = document.execCommand("copy");
          if (selection) selection.removeAllRanges();
          container.remove();
          return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard unavailable"));
        }
        function buildFeedClipboardPayload(root) {
          var seen = {};
          var list = document.createElement("ul");
          var plain = [];
          root.querySelectorAll("[data-feed-href]").forEach(function (link) {
            var href = link.getAttribute("data-feed-href");
            if (!href || seen[href]) return;
            seen[href] = true;
            var titleNode = link.querySelector(".landing-feed-item__title");
            var metaNode = link.querySelector(".landing-feed-item__meta");
            var title = titleNode ? titleNode.textContent.trim() : link.textContent.trim();
            var meta = metaNode ? metaNode.textContent.trim() : "";
            var item = document.createElement("li");
            var anchor = document.createElement("a");
            anchor.href = href;
            anchor.textContent = title;
            item.appendChild(anchor);
            if (meta) {
              item.appendChild(document.createTextNode(" - " + meta));
            }
            list.appendChild(item);
            plain.push(title + (meta ? " - " + meta : "") + "\\n" + href);
          });
          return { html: list.outerHTML, text: plain.join("\\n\\n") };
        }
        function copyLandingFeed(button, root) {
          var payload = buildFeedClipboardPayload(root);
          if (!payload.text) return;
          setCopyButtonState(button, "Copying...", true);
          var write = navigator.clipboard && navigator.clipboard.write && window.ClipboardItem
            ? navigator.clipboard.write([
                new ClipboardItem({
                  "text/html": new Blob([payload.html], { type: "text/html" }),
                  "text/plain": new Blob([payload.text], { type: "text/plain" }),
                }),
              ])
            : copyHtmlFallback(payload.html).catch(function () { return writePlainTextFallback(payload.text); });
          write
            .then(function () {
              setCopyButtonState(button, "Copied", true);
              setTimeout(function () { setCopyButtonState(button, "Copy to clipboard", false); }, 1800);
            })
            .catch(function () {
              setCopyButtonState(button, "Copy failed", false);
            });
        }
        function replaceLandingFeedHtml(html) {
          if (!html) return false;
          var wrapper = document.createElement("div");
          wrapper.innerHTML = html;
          var next = wrapper.querySelector("[data-landing-feed]");
          var current = document.querySelector("[data-landing-feed]");
          if (next && current) {
            current.replaceWith(next);
            feed = next;
            applyOpenedState(feed);
            return true;
          }
          return false;
        }
        function setSearchStatus(root, text) {
          var status = root.querySelector("[data-landing-search-status]");
          if (status) status.textContent = text || "";
        }
        function submitSearchText(root, text, remove) {
          setSearchStatus(root, remove ? "Removing..." : "Refreshing RSS...");
          return fetch(remove ? "/api/landing-intelligence/search-texts/remove" : "/api/landing-intelligence/search-texts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text }),
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (!payload.ok) throw new Error(payload.error || "Search text update failed");
              replaceLandingFeedHtml(payload.html);
            })
            .catch(function () {
              setSearchStatus(root, "Update failed");
            });
        }
        document.addEventListener("click", function (event) {
          var target = event.target;
          if (!(target instanceof Element)) return;
          var toggleButton = target.closest("[data-toggle-landing-search]");
          if (toggleButton instanceof HTMLButtonElement) {
            var toggleRoot = toggleButton.closest("[data-landing-feed]");
            var panel = toggleRoot ? toggleRoot.querySelector("[data-landing-search-panel]") : null;
            if (panel instanceof HTMLElement) {
              var isHidden = panel.hasAttribute("hidden");
              panel.toggleAttribute("hidden", !isHidden);
              toggleButton.setAttribute("aria-expanded", String(isHidden));
              if (isHidden) {
                var input = panel.querySelector("input[name='text']");
                if (input instanceof HTMLInputElement) input.focus();
              }
            }
            return;
          }
          var copyButton = target.closest("[data-copy-landing-feed]");
          if (copyButton instanceof HTMLButtonElement) {
            var copyRoot = copyButton.closest("[data-landing-feed]");
            if (copyRoot) copyLandingFeed(copyButton, copyRoot);
            return;
          }
          var removeButton = target.closest("[data-remove-landing-search-text]");
          if (removeButton instanceof HTMLButtonElement) {
            var removeRoot = removeButton.closest("[data-landing-feed]");
            var text = removeButton.getAttribute("data-remove-landing-search-text") || "";
            if (removeRoot && text) submitSearchText(removeRoot, text, true);
            return;
          }
          var link = target.closest("[data-feed-href]");
          if (!link) return;
          markOpened(link.getAttribute("data-feed-href"));
          link.classList.add("landing-feed-item--opened");
        });
        document.addEventListener("submit", function (event) {
          var target = event.target;
          if (!(target instanceof HTMLFormElement) || !target.matches("[data-landing-search-form]")) return;
          event.preventDefault();
          var root = target.closest("[data-landing-feed]");
          var input = target.querySelector("input[name='text']");
          if (!root || !(input instanceof HTMLInputElement)) return;
          var text = input.value.trim();
          if (!text) return;
          input.value = "";
          submitSearchText(root, text, false);
        });
        // Drag the ticker to scrub it: moves the CSS animation's currentTime so it
        // resumes from wherever it was dropped. Listeners are delegated because the
        // feed fragment is swapped in place on refresh.
        var scrub = null;
        var suppressFeedClick = false;
        function getFeedAnimation(list) {
          if (!list || typeof list.getAnimations !== "function") return null;
          var animations = list.getAnimations();
          return animations.length ? animations[0] : null;
        }
        document.addEventListener("pointerdown", function (event) {
          if (event.button !== 0 || !(event.target instanceof Element)) return;
          var viewport = event.target.closest(".landing-feed__viewport");
          if (!(viewport instanceof HTMLElement)) return;
          var list = viewport.querySelector(".landing-feed__list--scroll");
          var animation = getFeedAnimation(list);
          if (!animation || !(list instanceof HTMLElement)) return;
          var duration = Number(animation.effect && animation.effect.getComputedTiming().duration) || 0;
          var halfWidth = list.scrollWidth / 2;
          if (!duration || !halfWidth) return;
          scrub = {
            viewport: viewport,
            animation: animation,
            pointerId: event.pointerId,
            startX: event.clientX,
            startTime: Number(animation.currentTime) || 0,
            msPerPx: duration / halfWidth,
            duration: duration,
            moved: false,
          };
        });
        document.addEventListener("pointermove", function (event) {
          if (!scrub || event.pointerId !== scrub.pointerId) return;
          var dx = event.clientX - scrub.startX;
          if (!scrub.moved) {
            if (Math.abs(dx) < 4) return;
            scrub.moved = true;
            scrub.viewport.classList.add("landing-feed__viewport--scrubbing");
            try { scrub.viewport.setPointerCapture(event.pointerId); } catch (err) {}
          }
          var time = scrub.startTime - dx * scrub.msPerPx;
          // Keep the time positive inside the infinite loop so it never hits the pre-start state.
          scrub.animation.currentTime = ((time % scrub.duration) + scrub.duration) % scrub.duration + scrub.duration;
          event.preventDefault();
        });
        function endScrub(event) {
          if (!scrub || event.pointerId !== scrub.pointerId) return;
          if (scrub.moved) {
            suppressFeedClick = true;
            setTimeout(function () { suppressFeedClick = false; }, 0);
            scrub.viewport.classList.remove("landing-feed__viewport--scrubbing");
          }
          scrub = null;
        }
        document.addEventListener("pointerup", endScrub);
        document.addEventListener("pointercancel", endScrub);
        document.addEventListener("click", function (event) {
          if (!suppressFeedClick) return;
          suppressFeedClick = false;
          event.preventDefault();
          event.stopPropagation();
        }, true);
        document.addEventListener("dragstart", function (event) {
          if (event.target instanceof Element && event.target.closest(".landing-feed__viewport")) event.preventDefault();
        });
        applyOpenedState(feed);
        function refreshFeed() {
          fetch("/api/landing-intelligence", { cache: "no-store" })
            .then(function (res) { return res.text(); })
            .then(function (html) {
              replaceLandingFeedHtml(html);
            })
            .catch(function () {});
        }
        setInterval(refreshFeed, 15 * 60 * 1000);
      })();
    </script>
  </body>
</html>`;
}
