import type { TaskReminderFeed, TaskReminderView } from "../storage/task-store.js";
import type { LandingIntelligenceFeed, LandingIntelligenceItem } from "../landing-intelligence.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// "Overdue by 3 days" / "Due today" / "Due in 2 days" from the signed
// daysUntilDue the reminder feed computes.
function dueLabel(reminder: TaskReminderView): string {
  const days = reminder.daysUntilDue;
  if (days < 0) {
    const n = Math.abs(days);
    return `Overdue by ${n} day${n === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function renderReminderItem(reminder: TaskReminderView, overdue: boolean): string {
  const meta = [reminder.projectName, reminder.assigneeName]
    .filter((value): value is string => Boolean(value))
    .map((value) => escapeHtml(value))
    .join(" · ");
  return `
    <a class="landing-reminder${overdue ? " landing-reminder--overdue" : ""}" href="/tasks?task=${reminder.id}">
      <span class="landing-reminder__due">${escapeHtml(dueLabel(reminder))}</span>
      <span class="landing-reminder__title">${escapeHtml(reminder.title)}</span>
      ${meta ? `<span class="landing-reminder__meta">${meta}</span>` : ""}
    </a>
  `;
}

function renderKtcaReminderItem(reminder: KtcaReminder): string {
  const label = reminder.expired
    ? `Expired ${Math.abs(reminder.daysUntilExpiry)} day${Math.abs(reminder.daysUntilExpiry) === 1 ? "" : "s"} ago`
    : `Expires in ${reminder.daysUntilExpiry} day${reminder.daysUntilExpiry === 1 ? "" : "s"}`;
  return `
    <a class="landing-reminder landing-reminder--overdue" href="/jd?panel=jd-settings">
      <span class="landing-reminder__due">${escapeHtml(label)}</span>
      <span class="landing-reminder__title">KTCA agreement needs updating</span>
      <span class="landing-reminder__meta">Import the new Kindergarten Teachers Collective Agreement</span>
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
      <a class="landing-alert__link" href="/comms?panel=postmark">
        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
        <span class="landing-alert__body">
          <span class="landing-alert__heading">${escapeHtml(heading)}</span>
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
    <section class="landing__reminders" aria-label="Task reminders">
      <h2 class="landing-reminders__heading">${escapeHtml(heading)}</h2>
      <div class="landing-reminders__list">${items}</div>
    </section>
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
    <span class="landing-feed-item__icon"><i class="bi ${icon}" aria-hidden="true"></i></span>
    <span class="landing-feed-item__content">
      <span class="landing-feed-item__title">${escapeHtml(item.title)}</span>
      <span class="landing-feed-item__meta">${escapeHtml(item.source)}${item.publishedAt ? ` · ${escapeHtml(formatFeedTime(item.publishedAt))}` : ""}</span>
    </span>
  `;

  if (item.href) {
    return `
      <a class="landing-feed-item${item.urgent ? " landing-feed-item--urgent" : ""}" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer" data-feed-href="${escapeHtml(item.href)}">
        ${body}
      </a>
    `;
  }

  return `
    <div class="landing-feed-item${item.urgent ? " landing-feed-item--urgent" : ""}">
      ${body}
    </div>
  `;
}

function renderSearchTextControls(searchTexts: string[]) {
  const items = searchTexts.length
    ? searchTexts
        .map(
          (text) => `
            <li class="landing-feed-search__item">
              <span>${escapeHtml(text)}</span>
              <button type="button" data-remove-landing-search-text="${escapeHtml(text)}" aria-label="Remove ${escapeHtml(text)}">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </li>
          `,
        )
        .join("")
    : `<li class="landing-feed-search__empty">No extra search text saved</li>`;

  return `
    <div class="landing-feed-search" data-landing-search-panel hidden>
      <form class="landing-feed-search__form" data-landing-search-form>
        <input type="text" name="text" maxlength="180" autocomplete="off" placeholder="Add search text" aria-label="Search text" required />
        <button type="submit" aria-label="Add search text"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>
      </form>
      <ul class="landing-feed-search__list" data-landing-search-list>${items}</ul>
      <p class="landing-feed-search__status" data-landing-search-status aria-live="polite"></p>
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
    <section class="landing-feed" aria-label="Local intelligence feed" data-landing-feed>
      <header class="landing-feed__header">
        <div>
          <p class="landing-feed__meta">Updated ${escapeHtml(formatFeedTime(feed?.generatedAt ?? null))} · ${escapeHtml(statusLabel)}</p>
        </div>
        <div class="landing-feed__actions">
          <button type="button" class="landing-feed__copy" data-toggle-landing-search aria-expanded="false" aria-label="Open RSS search text">
            <i class="bi bi-search" aria-hidden="true"></i>
            <span>Search text</span>
          </button>
          <button type="button" class="landing-feed__copy" data-copy-landing-feed aria-label="Copy RSS feed to clipboard">
            <i class="bi bi-clipboard" aria-hidden="true"></i>
            <span>Copy to clipboard</span>
          </button>
        </div>
      </header>
      ${renderSearchTextControls(searchTexts)}
      ${feed?.error ? `<p class="landing-feed__error">${escapeHtml(feed.error)}</p>` : ""}
      <div class="landing-feed__viewport" tabindex="0" aria-label="Scrolling local intelligence stories">
        <div class="landing-feed__list landing-feed__list--scroll">
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
    { label: "Upload Contacts", href: "/contacts/upload", external: false },
    { label: "Open Upscalar", href: "upscalar://open", external: false },
    { label: "SharePoint", href: "https://ikindergartens.sharepoint.com/", external: true },
    { label: "Website", href: "https://inspiredkindergartens.nz/admin/", external: true },
  ];

  const placeholderTiles: string[] = [];

  const secondaryTileRow = secondaryTiles
    .map(
      (tile) => `
        <a class="landing-tile landing-tile--link" href="${escapeHtml(tile.href)}"${tile.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
          <span>${escapeHtml(tile.label)}</span>
        </a>
      `,
    )
    .join("");

  const buttonRow = tiles
    .map(
      (tile) => `
        <a class="landing-button${tile.primary ? " landing-button--primary" : ""}" href="${escapeHtml(tile.href)}">
          <span class="landing-button__label">${escapeHtml(tile.label)}</span>
          <span class="landing-button__description">${escapeHtml(tile.description)}</span>
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
  </head>
  <body class="landing-body">
    <main class="landing">
      ${renderPostmarkAlert(options.postmarkAlert)}
      <header class="landing__header">
        <h1 class="landing__title">Marketing Helper AI</h1>
      </header>
      <video class="landing__hero" autoplay muted playsinline preload="auto" aria-hidden="true">
        <source src="/assets/beepbeep-intro.mp4" type="video/mp4" />
      </video>
      <p class="landing__tagline">Local marketing &amp; enrolment intelligence for kindergartens.</p>
      ${renderReminders(options.reminders, options.ktcaReminder)}
      <nav class="landing__buttons" aria-label="Primary navigation">
        ${buttonRow}
      </nav>
      <section class="landing__tiles" aria-label="Upcoming tools">
        ${secondaryTileRow}
        ${placeholderTiles.join("")}
      </section>
      ${renderLandingIntelligenceFeed(options.intelligenceFeed)}
      <footer class="landing__footer">
        <button type="button" class="landing__restart" data-restart aria-label="Restart the server">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
          <span class="landing__restart-label">Restart server</span>
        </button>
        ${(options.intelligenceFeed?.aiModel?.isUpgrade ?? true) ? `<button type="button" class="landing__restart" data-update-ai-model aria-label="Update the local AI model">
          <i class="bi bi-cpu" aria-hidden="true"></i>
          <span class="landing__update-ai-label">Update AI model</span>
        </button>` : ""}
        <button type="button" class="landing__restart" data-rollback-ai-model aria-label="Rollback the local AI model"${options.intelligenceFeed?.aiModel?.fallbackModel ? "" : " disabled"}>
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
          <span class="landing__rollback-ai-label">Rollback AI model</span>
        </button>
        <button type="button" class="landing__restart" data-delete-ai-rollback aria-label="Delete the older rollback AI model"${options.intelligenceFeed?.aiModel?.secondaryFallbackModel ? "" : " disabled"}>
          <i class="bi bi-trash3" aria-hidden="true"></i>
          <span class="landing__delete-ai-label">Delete old fallback</span>
        </button>
        <a class="landing__github" href="https://github.com/Inspired-Kindergartens/Marketing-HELPER-AI" target="_blank" rel="noopener noreferrer">
          <i class="bi bi-github" aria-hidden="true"></i>
          <span>View on GitHub</span>
        </a>
      </footer>
    </main>
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
        bindAction(
          "[data-delete-ai-rollback]",
          ".landing__delete-ai-label",
          "Delete the older secondary fallback model from Ollama? The active rollback fallback will be kept.",
          "/actions/delete-ai-rollback-model",
          "Deleting...",
          "Delete started"
        );
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
          textarea.style.position = "fixed";
          textarea.style.top = "-1000px";
          document.body.appendChild(textarea);
          textarea.select();
          var copied = document.execCommand("copy");
          textarea.remove();
          return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard unavailable"));
        }
        function copyHtmlFallback(html) {
          var container = document.createElement("div");
          container.contentEditable = "true";
          container.style.position = "fixed";
          container.style.top = "-1000px";
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
