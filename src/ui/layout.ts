import { renderPanel } from "./panel.js";

type LayoutPanel = {
  id: string;
  title: string;
  children: string;
  className?: string;
  meta?: string;
  actions?: string;
};

type LayoutOptions = {
  panels: LayoutPanel[];
  focusPanelId?: string | null;
};

export function renderLayout({ panels, focusPanelId }: LayoutOptions) {
  const focusPanel = focusPanelId ? panels.find((panel) => panel.id === focusPanelId) : null;

  if (focusPanel) {
    return `
      <main class="app-shell app-shell--focus">
        ${renderPanel({
          id: focusPanel.id,
          title: focusPanel.title,
          children: focusPanel.children,
          className: `${focusPanel.className ?? ""} panel--focus`.trim(),
          meta: focusPanel.meta,
          actions: focusPanel.actions,
        })}
      </main>
    `;
  }

  const chatPanel = panels.find((panel) => panel.className?.includes("panel--chat"));
  const leftPanels = panels.filter((panel) => !panel.className?.includes("panel--chat"));

  return `
    <main class="app-shell">
      <div class="app-shell__left">
        <div class="left-grid">
          ${leftPanels
            .map((panel) =>
              renderPanel({
                id: panel.id,
                title: panel.title,
                children: panel.children,
                className: panel.className,
                meta: panel.meta,
                actions: panel.actions,
              }),
            )
            .join("")}
        </div>
      </div>
      <div class="app-shell__right">
        ${
          chatPanel
            ? renderPanel({
                id: chatPanel.id,
                title: chatPanel.title,
                children: chatPanel.children,
                className: chatPanel.className,
                meta: chatPanel.meta,
                actions: chatPanel.actions,
              })
            : ""
        }
      </div>
    </main>
  `;
}
