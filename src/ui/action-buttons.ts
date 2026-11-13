// The app's two standard action buttons, used on every page so they look and
// behave the same:
//   - Refresh: anything that fetches or recrawls from a source (Infocare,
//     Meta, Google Analytics, Mailchimp, Formstack, the ECE directory...).
//     The refresh icon; while it runs, the same icon spins.
//   - Print: anything that downloads a report to print (a PDF).
// Both are icon only, never text: the label goes in the tooltip and
// aria-label. Class names `action-refresh` / `action-print` mark them, on top
// of the standard `panel-action-button` styling.

export const REFRESH_ICON = "bi-arrow-clockwise";
export const PRINT_ICON = "bi-printer";
export const SPINNER_CLASS = "panel-action-button__spinner";

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ActionButtonOptions = {
  label: string;
  // A link when set; otherwise a <button type="button">.
  href?: string;
  // Extra attributes, already escaped (e.g. `data-roll-fetch`).
  attributes?: string;
  // Extra classes (e.g. `panel-action-button--pulsate`).
  className?: string;
};

function renderAction(kind: "refresh" | "print", icon: string, options: ActionButtonOptions & { download?: boolean; disabled?: boolean }) {
  const label = escapeAttribute(options.label);
  const classes = ["panel-action-button", `action-${kind}`, options.className, options.disabled ? "panel-action-button--disabled" : ""]
    .filter(Boolean)
    .join(" ");
  const extra = options.attributes ? ` ${options.attributes}` : "";
  const content = `<i class="bi ${icon} ui-icon" aria-hidden="true"></i>`;
  if (options.href && !options.disabled) {
    return `<a class="${classes}" href="${escapeAttribute(options.href)}"${options.download ? " download" : ""}${extra} aria-label="${label}" title="${label}">${content}</a>`;
  }
  return `<button class="${classes}" type="button"${options.disabled ? " disabled" : ""}${extra} aria-label="${label}" title="${label}">${content}</button>`;
}

// `running` shows the spinning icon and disables the button.
export function renderRefreshAction(options: ActionButtonOptions & { running?: boolean }) {
  return renderAction("refresh", options.running ? `${REFRESH_ICON} ${SPINNER_CLASS}` : REFRESH_ICON, {
    ...options,
    disabled: options.running,
  });
}

// With `href`, downloads the PDF; without, a button for a page script.
export function renderPrintAction(options: ActionButtonOptions) {
  return renderAction("print", PRINT_ICON, { ...options, download: Boolean(options.href) });
}
