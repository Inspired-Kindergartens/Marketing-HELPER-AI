type PanelOptions = {
  id?: string;
  title: string;
  children: string;
  className?: string;
  meta?: string;
  actions?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPanel({ id, title, children, className, meta, actions }: PanelOptions) {
  const panelClassName = className ? `panel ${className}` : "panel";
  const panelId = id ?? title;

  return `
    <section class="${escapeHtml(panelClassName)}" data-panel-id="${escapeHtml(panelId)}" aria-labelledby="panel-${escapeHtml(panelId)}">
      <header class="panel__header">
        <div class="panel__header-row">
          <h2 id="panel-${escapeHtml(panelId)}" class="panel__title">${escapeHtml(title)}</h2>
          <div class="panel__header-aside">
            ${meta ? `<div class="panel__meta">${meta}</div>` : ""}
            ${actions ? `<div class="panel__actions">${actions}</div>` : ""}
          </div>
        </div>
      </header>
      <div class="panel__body">
        ${children}
      </div>
    </section>
  `;
}
