// Minimal server-side sanitiser for the JD blurb WYSIWYG editor. Allows only
// the tags the editor's toolbar can produce; strips everything else
// (including script/style/event handlers) rather than trying to escape them.

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "p", "strong", "em", "u", "s", "ul", "ol", "li", "a", "br",
]);
const SELF_CLOSING = new Set(["br"]);

// document.execCommand("bold"/"italic") emits <b>/<i> in most browsers, so the
// editors produce these rather than the semantic tags. Normalise instead of
// allow-listing both, to keep one representation in storage.
const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
  del: "s",
};

function sanitizeHref(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("#")) {
    return value.replace(/"/g, "&quot;");
  }
  return null;
}

// Strips any tag not in ALLOWED_TAGS (keeping its text content), and on
// allowed tags keeps only safe attributes (href on <a>, sanitised).
export function sanitizeJdBlurbHtml(input: string): string {
  let out = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(input.slice(i));
      break;
    }
    out += escapeText(input.slice(i, lt));

    const gt = input.indexOf(">", lt);
    if (gt === -1) {
      i = len;
      break;
    }
    const rawTag = input.slice(lt + 1, gt);
    i = gt + 1;

    const isClosing = rawTag.startsWith("/");
    const nameMatch = /^\/?\s*([a-zA-Z0-9]+)/.exec(rawTag);
    const rawName = nameMatch ? nameMatch[1].toLowerCase() : "";
    // Map the presentational tags contenteditable emits onto the semantic ones
    // we store, so <b> is kept as <strong> rather than dropped.
    const tagName = TAG_ALIASES[rawName] ?? rawName;

    if (!tagName || !ALLOWED_TAGS.has(tagName)) {
      continue; // drop the tag, keep surrounding text
    }

    if (isClosing) {
      if (!SELF_CLOSING.has(tagName)) out += `</${tagName}>`;
      continue;
    }

    if (tagName === "a") {
      const hrefMatch = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(rawTag);
      const href = hrefMatch ? sanitizeHref(hrefMatch[1] ?? hrefMatch[2] ?? "") : null;
      out += href ? `<a href="${href}" rel="noopener noreferrer">` : "<a>";
      continue;
    }

    out += SELF_CLOSING.has(tagName) ? `<${tagName}>` : `<${tagName}>`;
  }

  return out;
}

// Entities the WYSIWYG editors actually emit. contenteditable inserts &nbsp;
// constantly (for a trailing space, a double space, an empty line), and pasted
// text brings punctuation entities with it.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // A plain space, not U+00A0. contenteditable scatters non-breaking spaces
  // through ordinary prose, where they are invisible, wrap differently, and
  // break word search. Nothing the editors produce needs a real one.
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  trade: "™",
  copy: "©",
  reg: "®",
  deg: "°",
  pound: "£",
  euro: "€",
};

// Turns entities back into the characters they stand for, so escapeText can
// re-encode from a known-decoded state. Without this the round-trip compounds:
// "&nbsp;" saves as "&amp;nbsp;" and renders as literal "&nbsp;" text, and each
// further save adds another "amp;".
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const codePoint = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
      try {
        // &#160; is the numeric spelling of &nbsp;, normalised the same way.
        return codePoint === 0xa0 ? " " : String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

// Decode first so text is plain characters, then escape only what must be
// escaped. A non-breaking space is written out as the literal character rather
// than "&nbsp;" so it survives the next save unchanged.
function escapeText(text: string): string {
  return decodeEntities(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
