import type { TaskView } from "../storage/task-store.js";
import type { ProjectListItem, ProjectRollup } from "../storage/project-store.js";
import type {
  EmailContactSuggestion,
  MemberDirectoryData,
  MemberView,
} from "../storage/member-store.js";
import { renderLayout } from "./layout.js";
import { renderTaskBoardPanel } from "./tasks/task-board-panel.js";
import { renderTaskDetailPanel } from "./tasks/task-detail-panel.js";
import { renderProjectsPanel } from "./tasks/projects-panel.js";
import { renderMembersPanel } from "./tasks/members-panel.js";

const PANEL_DEFINITIONS = [
  { id: "task-board", title: "Task Board", className: "panel--task-board" },
  { id: "task-detail", title: "Task Detail", className: "panel--task-detail" },
  { id: "projects", title: "Projects", className: "panel--projects" },
  { id: "members", title: "Members", className: "panel--members" },
  { id: "chat", title: "AI Chat with Beep Beep", className: "panel--chat" },
] as const;

const VALID_TASKS_PANEL_IDS = new Set<string>(PANEL_DEFINITIONS.map((panel) => panel.id));

export type TasksAppShellOptions = {
  focusPanelId?: string | null;
  tasks: TaskView[];
  projects: ProjectListItem[];
  members: MemberDirectoryData;
  selectedTask?: TaskView | null;
  selectedProject?: ProjectRollup | null;
  // Rollup for the selected task's project, so the detail group picker is filled.
  selectedTaskProject?: ProjectRollup | null;
  // Member + centre contacts for the task email "To" autocomplete.
  contactSuggestions?: EmailContactSuggestion[];
};

export function resolveTasksFocusPanelId(input?: string | null) {
  return input && VALID_TASKS_PANEL_IDS.has(input) ? input : null;
}

function renderPanelContent(panelId: string, options: TasksAppShellOptions): string {
  const memberList: MemberView[] = options.members.members;

  if (panelId === "task-detail") {
    return renderTaskDetailPanel({
      task: options.selectedTask ?? null,
      projects: options.projects,
      members: memberList,
      projectRollup: options.selectedTaskProject ?? null,
      contactSuggestions: options.contactSuggestions ?? [],
    });
  }

  if (panelId === "projects") {
    return renderProjectsPanel({
      projects: options.projects,
      selectedProject: options.selectedProject ?? null,
      members: memberList,
    });
  }

  if (panelId === "members") {
    return renderMembersPanel({ directory: options.members });
  }

  if (panelId === "chat") {
    return renderTasksAiChatPanel();
  }

  return renderTaskBoardPanel({
    tasks: options.tasks,
    projects: options.projects,
    members: memberList,
  });
}

function renderTasksAiChatPanel(): string {
  return `
    <div class="chat-shell" data-ai-chat data-ai-chat-endpoint="/api/tasks/ai/chat/stream">
      <div class="chat-shell__messages">
        <div class="chat-message chat-message--assistant">
          <span class="chat-message__role">Beep Beep</span>
          <p class="chat-message__body">Ask about tasks, projects, due dates, time logged, or who is assigned to what.</p>
        </div>
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label" for="tasks-chat-prompt">Prompt</label>
        <textarea id="tasks-chat-prompt" class="chat-shell__prompt-input" placeholder="Ask about overdue tasks, project progress, or team workload."></textarea>
        <button class="chat-shell__send" type="button" data-ai-chat-send><i class="bi bi-send ui-icon" aria-hidden="true"></i><span>Send</span></button>
      </div>
    </div>
  `;
}

function renderTasksChatScript(): string {
  return `
    <script>
      (function() {
        var shell = document.querySelector("[data-ai-chat]");
        if (!shell) return;
        var input = shell.querySelector(".chat-shell__prompt-input");
        var button = shell.querySelector("[data-ai-chat-send]");
        var messages = shell.querySelector(".chat-shell__messages");
        var history = [];
        function append(role, text) {
          var row = document.createElement("div");
          row.className = "chat-message chat-message--" + role;
          var title = document.createElement("span");
          title.className = "chat-message__role";
          title.textContent = role === "assistant" ? "Beep Beep" : "You";
          var body = document.createElement("p");
          body.className = "chat-message__body";
          body.textContent = text;
          row.append(title, body);
          messages.appendChild(row);
          messages.scrollTop = messages.scrollHeight;
          return body;
        }
        async function send() {
          var prompt = input.value.trim();
          if (!prompt || button.disabled) return;
          append("user", prompt);
          input.value = "";
          button.disabled = true;
          var output = append("assistant", "");
          var answer = "";
          try {
            var response = await fetch(shell.dataset.aiChatEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: prompt, messages: history }),
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
                } else if (eventType === "event: error") {
                  output.textContent = payload.error || "Chat request failed.";
                }
              });
            }
            history.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
          } catch (error) {
            output.textContent = error instanceof Error ? error.message : "Chat request failed.";
          } finally {
            button.disabled = false;
          }
        }
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

// One delegated client script for every mutation in the section. Each action is
// a JSON fetch (matching the existing notes/notifications POST convention) that
// reloads the page on success so the server re-renders the new state.
function renderTasksScript(): string {
  return `
    <script>
      (function() {
        var root = document.querySelector("[data-task-board], [data-task-detail], [data-projects-panel], [data-members-panel]");
        var body = document.body;

        function reload() { window.location.reload(); }

        // Fires the JSON POST. When reloadOnSuccess is false the caller keeps
        // control of the page (used by "Open in Outlook", which must navigate to
        // a mailto: instead of reloading). Returns true on success.
        async function postRaw(url, payload, reloadOnSuccess) {
          try {
            var response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
            });
            if (!response.ok) throw new Error("Request failed");
            if (reloadOnSuccess !== false) reload();
            return true;
          } catch (error) {
            window.alert("That action couldn't be saved. Please try again.");
            return false;
          }
        }

        function post(url, payload) { return postRaw(url, payload, true); }

        async function postForm(url, form) {
          try {
            var response = await fetch(url, { method: "POST", body: new FormData(form) });
            if (!response.ok) throw new Error("Request failed");
            reload();
            return true;
          } catch (error) {
            window.alert("That file couldn't be attached. Please try again.");
            return false;
          }
        }

        function num(value) {
          var n = parseInt(value, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        }

        // Reads the compose editor and returns { to, subject, body }. The "To"
        // value falls back to the placeholder (the last-used recipient) when the
        // user leaves it blank, so submitting unchanged reuses the prior contact.
        function readEmailDraft(section) {
          var toEl = section.querySelector("[data-email-to]");
          var subjectEl = section.querySelector("[data-email-subject]");
          var bodyEl = section.querySelector("[data-email-body]");
          var to = (toEl && toEl.value.trim()) || (toEl && toEl.getAttribute("placeholder")) || "";
          // The placeholder may be "Name <email>" — extract the address.
          var match = /<([^>]+)>/.exec(to);
          var address = match ? match[1].trim() : to;
          if (address.indexOf("@") === -1) address = "";
          return {
            to: address,
            toName: match ? to.replace(/<[^>]+>/, "").trim() : "",
            subject: subjectEl ? subjectEl.value : "",
            body: bodyEl ? bodyEl.value : "",
          };
        }

        function buildMailto(draft) {
          var to = (draft.to || "").replace(/[\\r\\n]/g, "");
          return "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") +
            "?subject=" + encodeURIComponent(draft.subject || "") +
            "&body=" + encodeURIComponent(draft.body || "");
        }

        document.addEventListener("click", function(event) {
          // A previous-recipient chip (outside the action set) fills "To".
          var chip = event.target instanceof Element ? event.target.closest("[data-email-recipient]") : null;
          if (chip) {
            event.preventDefault();
            var toInput = document.querySelector("[data-email-to]");
            if (toInput) {
              var chipName = chip.getAttribute("data-email-name");
              var chipEmail = chip.getAttribute("data-email-recipient");
              toInput.value = chipName ? chipName + " <" + chipEmail + ">" : chipEmail;
            }
            return;
          }

          var el = event.target instanceof Element ? event.target.closest("[data-task-action], [data-project-action], [data-member-action]") : null;
          if (!el) return;

          var taskAction = el.getAttribute("data-task-action");
          var projectAction = el.getAttribute("data-project-action");
          var memberAction = el.getAttribute("data-member-action");

          var taskHost = el.closest("[data-task-id]");
          var taskId = el.getAttribute("data-task-id") || (taskHost && taskHost.getAttribute("data-task-id"));

          if (taskAction === "timer-start") { event.preventDefault(); post("/api/tasks/" + taskId + "/timer/start", {}); return; }
          if (taskAction === "timer-stop") { event.preventDefault(); post("/api/tasks/" + taskId + "/timer/stop", {}); return; }
          if (taskAction === "delete") {
            event.preventDefault();
            if (window.confirm("Delete this task?")) post("/api/tasks/" + taskId + "/delete", {});
            return;
          }
          if (taskAction === "checklist-toggle") {
            post("/api/tasks/" + taskId + "/checklist/" + el.getAttribute("data-item-id") + "/toggle", {});
            return;
          }
          if (taskAction === "checklist-delete") {
            event.preventDefault();
            post("/api/tasks/" + taskId + "/checklist/" + el.getAttribute("data-item-id") + "/delete", {});
            return;
          }
          if (taskAction === "attachment-delete") {
            event.preventDefault();
            post("/api/tasks/" + taskId + "/attachments/" + el.getAttribute("data-attachment-id") + "/delete", {});
            return;
          }

          // Email compose actions live in the [data-task-email] section.
          if (taskAction === "email-save" || taskAction === "email-open") {
            event.preventDefault();
            var section = el.closest("[data-task-email]");
            if (!section) return;
            var draft = readEmailDraft(section);
            if (taskAction === "email-open") {
              if (!draft.to) { window.alert("Add a recipient email address first."); return; }
              // Remember the draft, then hand off to the mail app. Don't reload
              // (that would cancel the mailto: navigation).
              postRaw("/api/tasks/" + taskId + "/email", draft, false).then(function(ok) {
                if (ok) window.location.href = buildMailto(draft);
              });
            } else {
              post("/api/tasks/" + taskId + "/email", draft);
            }
            return;
          }

          if (projectAction || memberAction) {
            var projectHost = el.closest("[data-project-id]");
            var projectId = projectHost && projectHost.getAttribute("data-project-id");
            if (projectAction === "delete") {
              event.preventDefault();
              if (window.confirm("Delete this project? Its tasks become unassigned.")) post("/api/projects/" + projectId + "/delete", {});
              return;
            }
            if (projectAction === "member-remove") {
              event.preventDefault();
              post("/api/projects/" + projectId + "/members", { memberId: num(el.getAttribute("data-member-id")), remove: true });
              return;
            }
            if (memberAction === "toggle-active") {
              event.preventDefault();
              var memberId = num(el.getAttribute("data-member-id"));
              var active = el.getAttribute("data-active") !== "1";
              post("/api/members/" + memberId, { active: active, toggleActive: true });
              return;
            }
            if (memberAction === "delete") {
              event.preventDefault();
              if (window.confirm("Delete this member?")) post("/api/members/" + num(el.getAttribute("data-member-id")) + "/delete", {});
              return;
            }
          }
        });

        // Status dropdown on the detail panel changes status immediately.
        document.addEventListener("change", function(event) {
          var select = event.target;
          if (!(select instanceof HTMLSelectElement)) return;
          if (select.getAttribute("data-task-action") !== "status") return;
          var host = select.closest("[data-task-id]");
          if (!host) return;
          post("/api/tasks/" + host.getAttribute("data-task-id") + "/status", { status: select.value });
        });

        // Every other field on the task-edit form (title, description, due date,
        // estimate, project, group, assignee) autosaves too: text-like fields on
        // blur (so we're not posting per keystroke), selects on change. Changing
        // the project reloads (its group options depend on the selected project);
        // everything else saves silently in place so focus/scroll isn't disturbed.
        function autosaveTaskEdit(field) {
          var form = field.closest("[data-task-edit]");
          if (!form) return;
          var host = form.closest("[data-task-id]");
          if (!host) return;
          var titleInput = form.querySelector("[name=title]");
          if (!titleInput || !titleInput.value.trim()) return;
          var needsReload = field.getAttribute("name") === "projectId";
          postRaw("/api/tasks/" + host.getAttribute("data-task-id"), formData(form), needsReload);
        }

        document.addEventListener("blur", function(event) {
          var field = event.target instanceof Element ? event.target.closest("[data-task-edit] input, [data-task-edit] textarea") : null;
          if (!field) return;
          autosaveTaskEdit(field);
        }, true);

        document.addEventListener("change", function(event) {
          var field = event.target instanceof Element ? event.target.closest("[data-task-edit] select") : null;
          if (!field) return;
          autosaveTaskEdit(field);
        });

        function formData(form) {
          var data = {};
          new FormData(form).forEach(function(value, key) {
            var trimmed = typeof value === "string" ? value.trim() : value;
            if (trimmed !== "") data[key] = trimmed;
          });
          return data;
        }

        // Commit checklist edits when the field loses focus with a changed value
        // (Enter also works via the form's submit handler below).
        document.addEventListener("change", function(event) {
          var input = event.target instanceof Element ? event.target.closest("[data-checklist-edit] input") : null;
          if (!input) return;
          var form = input.closest("form");
          if (!form) return;
          if (typeof form.requestSubmit === "function") form.requestSubmit();
          else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });

        document.addEventListener("submit", function(event) {
          var form = event.target;
          if (!(form instanceof HTMLFormElement)) return;

          if (form.hasAttribute("data-task-create")) {
            event.preventDefault(); post("/api/tasks", formData(form)); return;
          }
          if (form.hasAttribute("data-task-edit")) {
            event.preventDefault();
            var host = form.closest("[data-task-id]");
            post("/api/tasks/" + host.getAttribute("data-task-id"), formData(form));
            return;
          }
          if (form.hasAttribute("data-task-log")) {
            event.preventDefault();
            var logHost = form.closest("[data-task-id]");
            post("/api/tasks/" + logHost.getAttribute("data-task-id") + "/time", formData(form));
            return;
          }
          if (form.hasAttribute("data-checklist-add")) {
            event.preventDefault();
            var clHost = form.closest("[data-task-id]");
            post("/api/tasks/" + clHost.getAttribute("data-task-id") + "/checklist", formData(form));
            return;
          }
          if (form.hasAttribute("data-checklist-edit")) {
            event.preventDefault();
            var editHost = form.closest("[data-task-id]");
            post("/api/tasks/" + editHost.getAttribute("data-task-id") + "/checklist/" + form.getAttribute("data-item-id"), formData(form));
            return;
          }
          if (form.hasAttribute("data-task-attachment-upload")) {
            event.preventDefault();
            var attachmentHost = form.closest("[data-task-id]");
            postForm("/api/tasks/" + attachmentHost.getAttribute("data-task-id") + "/attachments", form);
            return;
          }
          if (form.hasAttribute("data-project-create")) {
            event.preventDefault(); post("/api/projects", formData(form)); return;
          }
          if (form.hasAttribute("data-project-add-group")) {
            event.preventDefault();
            var pgHost = form.closest("[data-project-id]");
            post("/api/projects/" + pgHost.getAttribute("data-project-id") + "/groups", formData(form));
            return;
          }
          if (form.hasAttribute("data-project-add-member")) {
            event.preventDefault();
            var pmHost = form.closest("[data-project-id]");
            post("/api/projects/" + pmHost.getAttribute("data-project-id") + "/members", formData(form));
            return;
          }
          if (form.hasAttribute("data-member-create")) {
            event.preventDefault(); post("/api/members", formData(form)); return;
          }
        });

        void root;
      })();
    </script>
  `;
}

export function renderTasksAppShell(options: TasksAppShellOptions): string {
  const focusPanelId = resolveTasksFocusPanelId(options.focusPanelId);

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
    <title>Marketing Helper - Tasks &amp; Projects</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="app-shell-body">
    <aside class="nav-rail" aria-label="Primary navigation">
      <a class="nav-rail__item" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item nav-rail__item--current" href="/tasks" aria-label="Tasks" title="Tasks" aria-current="page"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/jd" aria-label="Job Descriptions" title="Job Descriptions"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></a>
    </aside>
    ${layout}
    ${renderTasksScript()}
    ${renderTasksChatScript()}
  </body>
</html>`;
}

export { VALID_TASKS_PANEL_IDS };
