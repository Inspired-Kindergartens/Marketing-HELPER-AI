// Gives a wiki body one consistent paragraph structure, so the gap between
// paragraphs always comes from the `.rich-text p` margin and nothing else.
//
// contenteditable leaves two kinds of debris that made the spacing erratic:
// - Text typed before the first Enter sits outside any <p>, so it gets no
//   paragraph margin and the first Enter looks like it did nothing.
// - A second Enter leaves an empty <p><br></p>: a whole blank line plus two
//   margins. Deleting text can leave a contentless <p></p> behind too.
// This wraps loose top-level text into paragraphs and drops empty ones.
// Input is the sanitiser's output, which holds only allow-listed tags.

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "p", "ul", "ol"]);

function hasVisibleText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim().length > 0;
}

export function normaliseWikiParagraphs(html: string): string {
  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  let out = "";
  let loose = "";
  let depth = 0;

  const flushLoose = () => {
    // Trailing line breaks at the end of a loose run are what Enter left behind.
    const trimmed = loose.replace(/(\s|<br>)+$/g, "").replace(/^(\s|<br>)+/g, "");
    if (hasVisibleText(trimmed)) out += `<p>${trimmed}</p>`;
    loose = "";
  };

  for (const token of tokens) {
    const tag = /^<\/?([a-z0-9]+)/i.exec(token);
    const name = tag ? tag[1].toLowerCase() : "";
    const isBlock = BLOCK_TAGS.has(name);

    if (depth === 0 && !isBlock) {
      loose += token;
      continue;
    }
    if (isBlock) {
      if (token.startsWith("</")) {
        depth = Math.max(0, depth - 1);
      } else {
        if (depth === 0) flushLoose();
        depth += 1;
      }
    }
    out += token;
  }
  flushLoose();

  // Empty paragraphs and headings, however many line breaks they hold.
  return out.replace(/<(p|h1|h2|h3)>(?:\s|<br>|&nbsp;| )*<\/\1>/g, "");
}
