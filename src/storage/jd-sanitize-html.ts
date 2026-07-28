// Minimal server-side sanitiser for the JD blurb WYSIWYG editor. Allows only
// the tags the editor's toolbar can produce; strips everything else
// (including script/style/event handlers) rather than trying to escape them.

const ALLOWED_TAGS = new Set(["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "a", "br"]);
const SELF_CLOSING = new Set(["br"]);

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
    const tagName = nameMatch ? nameMatch[1].toLowerCase() : "";

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

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
