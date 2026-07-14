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

function renderReminders(reminders: TaskReminderFeed | undefined): string {
  if (!reminders || reminders.total === 0) return "";
  const items = [
    ...reminders.overdue.map((reminder) => renderReminderItem(reminder, true)),
    ...reminders.dueSoon.map((reminder) => renderReminderItem(reminder, false)),
  ].join("");
  const overdueCount = reminders.overdue.length;
  const heading =
    overdueCount > 0
      ? `${overdueCount} overdue · ${reminders.total} need attention`
      : `${reminders.total} due soon`;
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

  return `
    <section class="landing-feed" aria-label="Local intelligence feed" data-landing-feed>
      <header class="landing-feed__header">
        <div>
          <p class="landing-feed__meta">Updated ${escapeHtml(formatFeedTime(feed?.generatedAt ?? null))} · ${escapeHtml(statusLabel)}</p>
        </div>
      </header>
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
};

export function renderLandingPage(options: LandingPageOptions = {}) {
  const tiles = [
    { label: "Marketing", description: "Infocare, Meta Ads & Google Analytics", href: "/app", primary: true },
    { label: "Tasks", description: "Tasks, projects & reminders", href: "/tasks", primary: true },
    { label: "General Chat", description: "General help with saved conversations", href: "/chat", primary: true },
    { label: "Communications", description: "Postmark, Mailchimp & Formstack", href: "/comms", primary: false },
  ];

  const secondaryTiles = [
    { label: "Read Me", href: "/readme", external: false },
    { label: "Upload Contacts", href: "/contacts/upload", external: false },
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
      <header class="landing__header">
        <h1 class="landing__title">Marketing Helper AI</h1>
      </header>
      <video class="landing__hero" autoplay muted playsinline preload="auto" aria-hidden="true">
        <source src="/assets/beepbeep-intro.mp4" type="video/mp4" />
      </video>
      <p class="landing__tagline">Local marketing &amp; enrolment intelligence for kindergartens.</p>
      ${renderReminders(options.reminders)}
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
        feed.addEventListener("click", function (event) {
          var link = event.target.closest("[data-feed-href]");
          if (!link) return;
          markOpened(link.getAttribute("data-feed-href"));
          link.classList.add("landing-feed-item--opened");
        });
        applyOpenedState(feed);
        function refreshFeed() {
          fetch("/api/landing-intelligence", { cache: "no-store" })
            .then(function (res) { return res.text(); })
            .then(function (html) {
              if (!html) return;
              var wrapper = document.createElement("div");
              wrapper.innerHTML = html;
              var next = wrapper.querySelector("[data-landing-feed]");
              var current = document.querySelector("[data-landing-feed]");
              if (next && current) {
                current.replaceWith(next);
                feed = next;
                applyOpenedState(feed);
              }
            })
            .catch(function () {});
        }
        setInterval(refreshFeed, 15 * 60 * 1000);
      })();
    </script>
  </body>
</html>`;
}
