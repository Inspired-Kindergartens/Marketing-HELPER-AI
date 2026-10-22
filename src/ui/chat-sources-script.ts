// Client-side helper shared by the chats that stream a "sources" event (the
// help knowledge base excerpts an answer drew on). Defines
// renderChatSources(bodyElement, sources) inside the page's chat script: a
// small line under the reply naming each source, linked when it has a web
// address. In-house guides have none, so they are named only.
export function renderChatSourcesFunction(): string {
  return `
        function renderChatSources(bodyElement, sources) {
          if (!bodyElement || !sources || !sources.length) return;
          var line = document.createElement("p");
          line.className = "chat-message__sources text-ghost text-small";
          line.append("Sources: ");
          sources.forEach(function(source, index) {
            if (index > 0) line.append(" · ");
            line.append((source.label || "Help") + ": ");
            if (source.url) {
              var link = document.createElement("a");
              link.href = source.url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = source.title;
              line.appendChild(link);
            } else {
              line.append(source.title);
            }
          });
          bodyElement.parentElement.appendChild(line);
        }
  `;
}
