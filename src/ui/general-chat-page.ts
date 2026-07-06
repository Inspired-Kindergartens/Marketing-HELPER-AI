import type { GeneralChatPageData } from "../storage/general-chat-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMessages(data: GeneralChatPageData) {
  if (data.messages.length === 0) {
    return `
      <div class="general-chat-empty">
        <i class="bi bi-chat-square-text" aria-hidden="true"></i>
        <span>Start a conversation or select an existing one.</span>
      </div>
    `;
  }

  return data.messages
    .map(
      (message) => `
        <article class="general-chat-message general-chat-message--${message.role}" data-message-id="${message.id}">
          <div class="general-chat-message__top">
            <span class="general-chat-message__role">${message.role === "user" ? "You" : "Beep Beep"}</span>
            <button class="general-chat-icon-button" type="button" data-delete-message="${message.id}" title="Delete message" aria-label="Delete message"><i class="bi bi-trash" aria-hidden="true"></i></button>
          </div>
          <div class="general-chat-message__body">${escapeHtml(message.content).replaceAll("\n", "<br />")}</div>
        </article>
      `,
    )
    .join("");
}

export function renderGeneralChatPage(data: GeneralChatPageData) {
  const selectedId = data.selectedConversation?.id ?? null;
  const selectedGroupId = data.selectedGroupId;
  const groupLinks = [
    `
      <a class="general-chat-group${selectedGroupId == null ? " general-chat-group--active" : ""}" href="/chat">
        <span>All conversations</span>
      </a>
    `,
    ...data.groups.map(
      (group) => `
        <div class="general-chat-group-row" data-group-id="${group.id}">
          <a class="general-chat-group${group.id === selectedGroupId ? " general-chat-group--active" : ""}" href="/chat?group=${group.id}">
            <span>${escapeHtml(group.name)}</span>
            <small data-group-count="${group.id}">${group.conversationCount}</small>
          </a>
          <button class="general-chat-icon-button" type="button" data-rename-group="${group.id}" data-group-name="${escapeHtml(group.name)}" title="Rename group" aria-label="Rename group"><i class="bi bi-pencil" aria-hidden="true"></i></button>
          <button class="general-chat-icon-button" type="button" data-delete-group="${group.id}" data-group-name="${escapeHtml(group.name)}" title="Delete group" aria-label="Delete group"><i class="bi bi-trash" aria-hidden="true"></i></button>
        </div>
      `,
    ),
  ].join("");
  const groups = data.groups
    .map(
      (group) => `
        <option value="${group.id}"${group.id === selectedGroupId ? " selected" : ""}>${escapeHtml(group.name)} (${group.conversationCount})</option>
      `,
    )
    .join("");
  const conversations = data.conversations
    .map(
      (conversation) => `
        <div class="general-chat-thread-row" data-thread-row="${conversation.id}">
          <a class="general-chat-thread${conversation.id === selectedId ? " general-chat-thread--active" : ""}" data-thread-id="${conversation.id}" href="/chat?conversation=${conversation.id}${selectedGroupId == null ? "" : `&group=${selectedGroupId}`}">
            <span class="general-chat-thread__title">${escapeHtml(conversation.title)}</span>
            <span class="general-chat-thread__meta"><span data-thread-message-count="${conversation.id}">${conversation.messageCount}</span> messages</span>
          </a>
          <button class="general-chat-icon-button" type="button" data-delete-conversation="${conversation.id}" data-conversation-title="${escapeHtml(conversation.title)}" title="Delete conversation" aria-label="Delete conversation"><i class="bi bi-trash" aria-hidden="true"></i></button>
        </div>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>General Chat | Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="general-chat-body">
    <aside class="nav-rail" aria-label="Primary navigation">
      <a class="nav-rail__item" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/app" aria-label="Online Marketing dashboard" title="Online Marketing"><i class="bi bi-bar-chart-line" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/tasks" aria-label="Tasks" title="Tasks"><i class="bi bi-check2-square" aria-hidden="true"></i></a>
      <a class="nav-rail__item nav-rail__item--current" href="/chat" aria-label="General Chat" title="General Chat" aria-current="page"><i class="bi bi-chat-dots" aria-hidden="true"></i></a>
      <a class="nav-rail__item" href="/comms" aria-label="Online Communications dashboard" title="Online Communications"><i class="bi bi-envelope-paper" aria-hidden="true"></i></a>
    </aside>
    <main class="general-chat-app" data-selected-conversation="${selectedId ?? ""}" data-selected-group="${selectedGroupId ?? ""}">
      <aside class="general-chat-sidebar">
        <div class="general-chat-sidebar__top">
          <a class="general-chat-home" href="/" aria-label="Back to landing" title="Landing"><i class="bi bi-house-door" aria-hidden="true"></i></a>
          <h1>General Chat</h1>
        </div>
        <form class="general-chat-create" data-create-conversation>
          <input name="title" type="text" placeholder="New conversation" autocomplete="off" />
          <select name="groupId" aria-label="Conversation group">${groups}</select>
          <button type="submit" title="Create conversation" aria-label="Create conversation"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>
        </form>
        <form class="general-chat-create" data-create-group>
          <input name="name" type="text" placeholder="New group" autocomplete="off" />
          <button type="submit" title="Create group" aria-label="Create group"><i class="bi bi-folder-plus" aria-hidden="true"></i></button>
        </form>
        <nav class="general-chat-groups" aria-label="Conversation groups">${groupLinks}</nav>
        <nav class="general-chat-threads" aria-label="Conversations">${conversations}</nav>
      </aside>
      <section class="general-chat-main">
        <header class="general-chat-header">
          <div>
            <span class="general-chat-kicker">General Help</span>
            <h2>${escapeHtml(data.selectedConversation?.title ?? "No conversation selected")}</h2>
          </div>
          <div class="general-chat-context">
            <span>${data.contextLimitTokens.toLocaleString()} token model context</span>
            <span>${data.sendCharBudget.toLocaleString()} char working window</span>
          </div>
        </header>
        <div class="general-chat-messages" data-chat-messages>${renderMessages(data)}</div>
        <form class="general-chat-composer" data-chat-composer>
          <textarea name="prompt" placeholder="Ask for help with anything..." ${selectedId == null ? "disabled" : ""}></textarea>
          <button type="submit" ${selectedId == null ? "disabled" : ""} title="Send" aria-label="Send"><i class="bi bi-send" aria-hidden="true"></i></button>
        </form>
      </section>
    </main>
    <script>
      (function () {
        var app = document.querySelector("[data-selected-conversation]");
        var selectedConversation = app ? app.getAttribute("data-selected-conversation") : "";
        var selectedGroup = app ? app.getAttribute("data-selected-group") : "";
        var messages = document.querySelector("[data-chat-messages]");
        var composer = document.querySelector("[data-chat-composer]");
        var pendingAssistantRow = null;
        var pendingUserRow = null;

        function updateThreadMessageCount(count) {
          if (!selectedConversation || typeof count !== "number") return;
          var target = document.querySelector('[data-thread-message-count="' + CSS.escape(selectedConversation) + '"]');
          if (target) target.textContent = String(count);
        }

        function appendMessage(role, content, state) {
          if (!messages) return null;
          var empty = messages.querySelector(".general-chat-empty");
          if (empty) empty.remove();
          var row = document.createElement("article");
          row.className = "general-chat-message general-chat-message--" + role;
          if (state) row.setAttribute("data-state", state);
          var top = document.createElement("div");
          top.className = "general-chat-message__top";
          var label = document.createElement("span");
          label.className = "general-chat-message__role";
          label.textContent = role === "user" ? "You" : "Beep Beep";
          var deleteButton = document.createElement("button");
          deleteButton.className = "general-chat-icon-button";
          deleteButton.type = "button";
          deleteButton.title = "Delete message";
          deleteButton.setAttribute("aria-label", "Delete message");
          deleteButton.disabled = true;
          deleteButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
          var body = document.createElement("div");
          body.className = "general-chat-message__body";
          body.textContent = content;
          top.appendChild(label);
          top.appendChild(deleteButton);
          row.appendChild(top);
          row.appendChild(body);
          messages.appendChild(row);
          messages.scrollTop = messages.scrollHeight;
          return row;
        }

        function markMessageSaved(row, messageId) {
          if (!row || !messageId) return;
          row.setAttribute("data-message-id", String(messageId));
          var button = row.querySelector(".general-chat-icon-button");
          if (button) {
            button.disabled = false;
            button.setAttribute("data-delete-message", String(messageId));
          }
        }

        document.querySelector("[data-create-group]")?.addEventListener("submit", function (event) {
          event.preventDefault();
          var form = event.currentTarget;
          var name = (new FormData(form).get("name") || "").toString().trim();
          if (!name) return;
          fetch("/api/general-chat/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name }),
          }).then(function (res) {
            if (res.ok) return res.json();
          }).then(function (payload) {
            if (payload && payload.id) window.location.href = "/chat?group=" + payload.id;
          });
        });

        document.addEventListener("click", function (event) {
          var target = event.target;
          if (!(target instanceof Element)) return;

          var renameGroup = target.closest("[data-rename-group]");
          if (renameGroup instanceof HTMLButtonElement) {
            var groupId = renameGroup.getAttribute("data-rename-group");
            var currentName = renameGroup.getAttribute("data-group-name") || "";
            var nextName = window.prompt("Rename group", currentName);
            if (!groupId || nextName == null || !nextName.trim()) return;
            fetch("/api/general-chat/groups/" + encodeURIComponent(groupId), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: nextName.trim() }),
            }).then(function (res) {
              if (res.ok) window.location.reload();
            });
            return;
          }

          var deleteGroup = target.closest("[data-delete-group]");
          if (deleteGroup instanceof HTMLButtonElement) {
            var deleteGroupId = deleteGroup.getAttribute("data-delete-group");
            var groupName = deleteGroup.getAttribute("data-group-name") || "this group";
            if (!deleteGroupId || !window.confirm("Delete " + groupName + "? Conversations in it will be kept and moved out of the group.")) return;
            fetch("/api/general-chat/groups/" + encodeURIComponent(deleteGroupId), { method: "DELETE" })
              .then(function (res) {
                if (res.ok) window.location.href = "/chat";
              });
            return;
          }

          var deleteMessage = target.closest("[data-delete-message]");
          if (deleteMessage instanceof HTMLButtonElement) {
            var messageId = deleteMessage.getAttribute("data-delete-message");
            if (!messageId || !window.confirm("Delete this message?")) return;
            fetch("/api/general-chat/messages/" + encodeURIComponent(messageId), { method: "DELETE" })
              .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("Delete failed.")); })
              .then(function (payload) {
                var row = document.querySelector('[data-message-id="' + CSS.escape(messageId) + '"]');
                if (row) row.remove();
                updateThreadMessageCount(payload.messageCount);
                if (messages && !messages.querySelector(".general-chat-message")) {
                  messages.innerHTML = '<div class="general-chat-empty"><i class="bi bi-chat-square-text" aria-hidden="true"></i><span>Start a conversation or select an existing one.</span></div>';
                }
              });
            return;
          }

          var deleteConversation = target.closest("[data-delete-conversation]");
          if (deleteConversation instanceof HTMLButtonElement) {
            var conversationId = deleteConversation.getAttribute("data-delete-conversation");
            var conversationTitle = deleteConversation.getAttribute("data-conversation-title") || "this conversation";
            if (!conversationId || !window.confirm("Delete " + conversationTitle + "? This will delete all messages in the conversation.")) return;
            fetch("/api/general-chat/conversations/" + encodeURIComponent(conversationId), { method: "DELETE" })
              .then(function (res) {
                if (!res.ok) throw new Error("Delete failed.");
                if (conversationId === selectedConversation) {
                  window.location.href = selectedGroup ? "/chat?group=" + selectedGroup : "/chat";
                  return;
                }
                var row = document.querySelector('[data-thread-row="' + CSS.escape(conversationId) + '"]');
                if (row) row.remove();
              });
          }
        });

        document.querySelector("[data-create-conversation]")?.addEventListener("submit", function (event) {
          event.preventDefault();
          var form = event.currentTarget;
          var data = new FormData(form);
          fetch("/api/general-chat/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: (data.get("title") || "").toString(),
              groupId: Number(data.get("groupId") || 0),
            }),
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (payload.id) window.location.href = "/chat?conversation=" + payload.id + (selectedGroup ? "&group=" + selectedGroup : "");
            });
        });

        composer?.querySelector("textarea")?.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          if (event.currentTarget.disabled) return;
          composer.requestSubmit();
        });

        composer?.addEventListener("submit", function (event) {
          event.preventDefault();
          if (!selectedConversation) return;
          var input = composer.querySelector("textarea");
          var button = composer.querySelector("button");
          var prompt = input.value.trim();
          if (!prompt) return;
          input.value = "";
          input.disabled = true;
          button.disabled = true;
          pendingUserRow = appendMessage("user", prompt);
          pendingAssistantRow = appendMessage("assistant", "", "pending");
          var sourceText = "";

          fetch("/api/general-chat/conversations/" + selectedConversation + "/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt }),
          }).then(function (response) {
            if (!response.ok || !response.body) throw new Error("Chat request failed.");
            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";
            function pump() {
              return reader.read().then(function (result) {
                if (result.done) return;
                buffer += decoder.decode(result.value, { stream: true });
                var frames = buffer.split("\\n\\n");
                buffer = frames.pop() || "";
                frames.forEach(function (frame) {
                  var event = "message";
                  var data = "";
                  frame.split("\\n").forEach(function (line) {
                    if (line.indexOf("event: ") === 0) event = line.slice(7);
                    if (line.indexOf("data: ") === 0) data = line.slice(6);
                  });
                  if (!data) return;
                  var payload = JSON.parse(data);
                  if (event === "saved") {
                    if (payload.role === "user") markMessageSaved(pendingUserRow, payload.messageId);
                    if (payload.role === "assistant") markMessageSaved(pendingAssistantRow, payload.messageId);
                    updateThreadMessageCount(payload.messageCount);
                  }
                  if (event === "chunk") {
                    sourceText += payload.chunk || "";
                    var pendingBody = pendingAssistantRow ? pendingAssistantRow.querySelector(".general-chat-message__body") : null;
                    if (pendingBody) pendingBody.textContent = sourceText;
                  }
                  if (event === "done") {
                    if (pendingAssistantRow) pendingAssistantRow.removeAttribute("data-state");
                    updateThreadMessageCount(payload.messageCount);
                  }
                  if (event === "error" && pendingAssistantRow) {
                    var errorBody = pendingAssistantRow.querySelector(".general-chat-message__body");
                    if (errorBody) errorBody.textContent = payload.error || "Chat request failed.";
                    pendingAssistantRow.setAttribute("data-state", "error");
                  }
                });
                if (messages) messages.scrollTop = messages.scrollHeight;
                return pump();
              });
            }
            return pump();
          }).catch(function (error) {
            if (pendingAssistantRow) {
              var errorBody = pendingAssistantRow.querySelector(".general-chat-message__body");
              if (errorBody) errorBody.textContent = error && error.message ? error.message : "Chat request failed.";
              pendingAssistantRow.setAttribute("data-state", "error");
            }
          }).finally(function () {
            input.disabled = false;
            button.disabled = false;
            input.focus();
          });
        });
      })();
    </script>
  </body>
</html>`;
}
