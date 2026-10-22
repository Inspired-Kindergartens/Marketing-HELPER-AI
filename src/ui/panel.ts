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
  const panelClassName = className ? `panel panel-border-a ${className}` : "panel panel-border-a";
  const panelId = id ?? title;

  return `
    <section class="${escapeHtml(panelClassName)}" data-panel-id="${escapeHtml(panelId)}" aria-labelledby="panel-${escapeHtml(panelId)}">
      <header class="panel__header">
        <div class="panel__header-row flex items-center justify-between gap-12">
          <h2 id="panel-${escapeHtml(panelId)}" class="panel__title font-strong label-case">${escapeHtml(title)}</h2>
          <div class="panel__header-aside flex items-center justify-end flex-wrap gap-8">
            ${meta ? `<div class="panel__meta flex items-center gap-8 text-small text-ghost nowrap">${meta}</div>` : ""}
            ${actions ? `<div class="panel__actions flex items-center gap-8">${actions}</div>` : ""}
          </div>
        </div>
      </header>
      <div class="panel__body text-body">
        ${children}
      </div>
    </section>
  `;
}
