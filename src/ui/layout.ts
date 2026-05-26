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
  const activeAccordionPanelId = leftPanels[0]?.id ?? "";

  return `
    <main class="app-shell">
      <div class="app-shell__left">
        <div class="left-grid" data-panel-accordion>
          ${leftPanels
            .map((panel) =>
              renderPanel({
                id: panel.id,
                title: panel.title,
                children: panel.children,
                className: `${panel.className ?? ""} panel--accordion${panel.id === activeAccordionPanelId ? " panel--accordion-active" : ""}`.trim(),
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
    <script>
      (function() {
        var accordions = document.querySelectorAll("[data-panel-accordion]");

        function activatePanel(accordion, panel) {
          if (!panel || panel.classList.contains("panel--accordion-active")) {
            return;
          }

          accordion.querySelectorAll(".panel--accordion-active").forEach(function(activePanel) {
            activePanel.classList.remove("panel--accordion-active");
            activePanel.querySelector(".panel__header")?.setAttribute("aria-expanded", "false");
          });

          panel.classList.add("panel--accordion-active");
          panel.querySelector(".panel__header")?.setAttribute("aria-expanded", "true");
        }

        accordions.forEach(function(accordion) {
          accordion.querySelectorAll(".panel--accordion .panel__header").forEach(function(header) {
            var panel = header.closest(".panel--accordion");
            header.setAttribute("role", "button");
            header.setAttribute("tabindex", "0");
            header.setAttribute("aria-expanded", panel?.classList.contains("panel--accordion-active") ? "true" : "false");
          });

          accordion.addEventListener("click", function(event) {
            var target = event.target;
            var header = target instanceof Element ? target.closest(".panel__header") : null;

            if (!header || !accordion.contains(header)) {
              return;
            }

            if (target instanceof Element && target.closest("a, button, input, select, textarea")) {
              return;
            }

            var panel = header.closest(".panel--accordion");
            activatePanel(accordion, panel);
          });

          accordion.addEventListener("keydown", function(event) {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            var target = event.target;
            var header = target instanceof Element ? target.closest(".panel__header") : null;

            if (!header || !accordion.contains(header)) {
              return;
            }

            event.preventDefault();
            activatePanel(accordion, header.closest(".panel--accordion"));
          });
        });
      })();
    </script>
  `;
}
