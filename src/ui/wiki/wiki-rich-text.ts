// The single rich-text editor used everywhere a wiki article body is written,
// so the create flow and the edit flow are the same component rather than two
// drifting variants. Toolbar commands match the JD blurb editor's allow-list,
// which is also what the server-side sanitiser accepts.

export type WikiRichTextOptions = {
  // Marks the editable region so the page script can find it.
  contentAttribute: string;
  html: string;
  // Extra buttons rendered at the right of the toolbar (e.g. Regenerate tags).
  trailingButtons?: string;
};

export function renderWikiRichText(options: WikiRichTextOptions): string {
  return `
    <div class="wiki-editor__toolbar" data-wiki-toolbar>
      <button type="button" data-wiki-cmd="formatBlock" data-wiki-value="H2" title="Heading"><i class="bi bi-type-h2 ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="formatBlock" data-wiki-value="H3" title="Subheading"><i class="bi bi-type-h3 ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="formatBlock" data-wiki-value="P" title="Paragraph"><i class="bi bi-paragraph ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="bold" title="Bold"><i class="bi bi-type-bold ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="italic" title="Italic"><i class="bi bi-type-italic ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="underline" title="Underline"><i class="bi bi-type-underline ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="insertUnorderedList" title="Bullet list"><i class="bi bi-list-ul ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="insertOrderedList" title="Numbered list"><i class="bi bi-list-ol ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="outdent" title="Outdent (Shift+Tab)"><i class="bi bi-text-indent-right ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="indent" title="Indent (Tab)"><i class="bi bi-text-indent-left ui-icon" aria-hidden="true"></i></button>
      <button type="button" data-wiki-cmd="createLink" title="Hyperlink"><i class="bi bi-link-45deg ui-icon" aria-hidden="true"></i></button>
      ${options.trailingButtons ?? ""}
    </div>
    <div class="wiki-editor__content" ${options.contentAttribute} contenteditable="true">${options.html || "<p></p>"}</div>
  `;
}
