import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWikiTags,
  selectWikiGrounding,
  wikiHtmlToPlainText,
  type WikiArticleRow,
} from "../src/storage/wiki-store.js";
import { renderWikiListPanel } from "../src/ui/wiki/wiki-list-panel.js";
import { renderWikiEditorPanel } from "../src/ui/wiki/wiki-editor-panel.js";
import { renderWikiArticlePanel } from "../src/ui/wiki/wiki-article-panel.js";
import { renderWikiAppShell, resolveWikiFocusPanelId } from "../src/ui/wiki-app-shell.js";
import { renderLandingPage } from "../src/ui/landing-page.js";
import { ensureAiRunning, isAiReady } from "../src/ai/runtime.js";
import { renderWikiRichText } from "../src/ui/wiki/wiki-rich-text.js";
import { sanitizeJdBlurbHtml } from "../src/storage/jd-sanitize-html.js";
import { readFileSync } from "node:fs";
import {
  DEFAULT_WIKI_CATEGORIES,
  buildWikiTaggingChatMessages,
  parseWikiTaggingResponse,
  resolveWikiCategory,
  stripMetaOpener,
} from "../src/ai/wiki-context.js";

function buildRow(overrides: Partial<WikiArticleRow> = {}): WikiArticleRow {
  return {
    id: 1,
    title: "Meta ads budget rules",
    category: "Advertising",
    tags: "meta,budget",
    summary: "How we set daily spend on Meta campaigns.",
    contentHtml: "<p>Daily spend starts at twenty dollars per centre.</p>",
    isPinned: false,
    isArchived: false,
    isCategoryLocked: false,
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("tags are lower-cased, de-duplicated and stored comma separated", () => {
  assert.equal(normalizeWikiTags(" Meta , BUDGET, meta "), "meta,budget");
  assert.equal(normalizeWikiTags(["Enrolment", "enrolment", "Waitlist"]), "enrolment,waitlist");
  assert.equal(normalizeWikiTags(""), "");
});

test("article HTML is flattened to readable plain text for the model", () => {
  const text = wikiHtmlToPlainText("<h2>Budget</h2><ul><li>Twenty a day</li><li>Review weekly</li></ul>");

  assert.equal(text, "Budget\nTwenty a day\nReview weekly");
});

test("grounding returns null when the wiki is empty so no message is sent", () => {
  assert.equal(selectWikiGrounding([], "how much do we spend on meta ads"), null);
});

test("grounding pulls in the article matching the prompt and leaves the rest out", () => {
  const grounding = selectWikiGrounding(
    [
      buildRow(),
      buildRow({ id: 2, title: "Newsletter schedule", tags: "mailchimp", summary: "", contentHtml: "<p>Monthly.</p>" }),
    ],
    "what is our meta budget",
  );

  assert.ok(grounding);
  assert.deepEqual(
    grounding.articles.map((article) => article.id),
    [1],
  );
  // The index still lists every article, so the model knows the other exists.
  assert.match(grounding.text, /Newsletter schedule/);
  assert.match(grounding.text, /Daily spend starts at twenty dollars/);
});

test("pinned articles are included even when nothing in the prompt matches", () => {
  const grounding = selectWikiGrounding(
    [buildRow({ id: 3, title: "Brand voice", tags: "voice", isPinned: true, contentHtml: "<p>Warm and plain.</p>" })],
    "unrelated question about parking",
  );

  assert.ok(grounding);
  assert.deepEqual(
    grounding.articles.map((article) => article.id),
    [3],
  );
  assert.match(grounding.text, /Warm and plain/);
});

test("a prompt of only stop words pulls in no unpinned article", () => {
  const grounding = selectWikiGrounding([buildRow()], "what should we do about this");

  assert.ok(grounding);
  assert.deepEqual(grounding.articles, []);
  assert.match(grounding.text, /No article closely matches this question/);
});

test("title and tag matches outrank a body-only mention", () => {
  const grounding = selectWikiGrounding(
    [
      buildRow({ id: 1, title: "Enrolment enquiries", tags: "enrolment", summary: "", contentHtml: "<p>Reply same day.</p>" }),
      buildRow({
        id: 2,
        title: "Office admin",
        tags: "admin",
        summary: "",
        contentHtml: "<p>Filing, supplies, and the odd enrolment note.</p>",
      }),
    ],
    "how fast do we answer an enrolment enquiry",
  );

  assert.ok(grounding);
  assert.equal(grounding.articles[0].id, 1);
});

test("grounding tells the model to treat the wiki as authoritative", () => {
  const grounding = selectWikiGrounding([buildRow()], "meta budget");

  assert.ok(grounding);
  assert.match(grounding.text, /authoritative in-house source/);
});

test("landing page offers Things To Know next to Job Descriptions", () => {
  const html = renderLandingPage({});

  assert.match(html, /href="\/wiki"/);
  assert.match(html, /Things To Know/);
});

test("list panel groups articles by category and marks pinned ones", () => {
  const html = renderWikiListPanel({
    articles: [
      {
        id: 1,
        title: "Brand voice",
        category: "Brand",
        tags: ["voice"],
        summary: "Warm and plain.",
        isPinned: true,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    search: "",
    categories: [],
  });

  assert.match(html, /wiki-list__group-heading/);
  assert.match(html, /bi-pin-angle-fill/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /href="\/wiki\?panel=wiki-article&article=1"/);
});

test("list panel reports an empty search rather than looking broken", () => {
  const html = renderWikiListPanel({ articles: [], search: "payroll", categories: [] });

  assert.match(html, /No articles match "payroll"/);
});

test("editor panel renders the article body and its retrieval fields", () => {
  const html = renderWikiEditorPanel({
    article: {
      id: 7,
      title: "Meta ads budget rules",
      category: "Advertising",
      tags: ["meta", "budget"],
      summary: "How we set daily spend.",
      contentHtml: "<p>Twenty a day.</p>",
      isPinned: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    categories: ["Advertising", "Brand & Voice"],
  });

  assert.match(html, /value="meta, budget"/);
  assert.match(html, /<p>Twenty a day\.<\/p>/);
  assert.match(html, /data-wiki-content/);
});

test("editor panel asks for a selection when no article is open", () => {
  const html = renderWikiEditorPanel({ article: null, categories: [] });

  assert.match(html, /Select an article/);
});

test("only valid wiki panel ids are honoured as a focus target", () => {
  assert.equal(resolveWikiFocusPanelId("wiki-editor"), "wiki-editor");
  assert.equal(resolveWikiFocusPanelId("jd-list"), null);
  assert.equal(resolveWikiFocusPanelId(null), null);
});

test("the shell hides the editor panel until an article is selected", () => {
  const listOnly = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  assert.doesNotMatch(listOnly, /panel--wiki-editor/);
  assert.match(listOnly, /panel--wiki-list/);
});

// --- AI category + tag generation -------------------------------------------

test("the tagging prompt pins the model to the closed category list", () => {
  const messages = buildWikiTaggingChatMessages({ title: "Meta budget", bodyText: "Twenty a day.", categories: [...DEFAULT_WIKI_CATEGORIES] });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  for (const category of DEFAULT_WIKI_CATEGORIES) {
    assert.ok(messages[0].content.includes(category), `system prompt should list ${category}`);
  }
  assert.match(messages[1].content, /Twenty a day\./);
});

test("an article with no body still gets classified from its title", () => {
  const messages = buildWikiTaggingChatMessages({ title: "Brand voice", bodyText: "", categories: [...DEFAULT_WIKI_CATEGORIES] });

  assert.match(messages[1].content, /no body text yet/);
});

test("a valid tagging reply is parsed into a category and tags", () => {
  const result = parseWikiTaggingResponse('{"category":"Advertising","tags":["meta","budget"]}', [...DEFAULT_WIKI_CATEGORIES]);

  assert.equal(result.category, "Advertising");
  assert.deepEqual(result.tags, ["meta", "budget"]);
});

test("a tagging reply wrapped in prose or code fences is still parsed", () => {
  const result = parseWikiTaggingResponse('Sure!\n```json\n{"category":"Enrolment","tags":["waitlist"]}\n```', [...DEFAULT_WIKI_CATEGORIES]);

  assert.equal(result.category, "Enrolment");
  assert.deepEqual(result.tags, ["waitlist"]);
});

test("an invented category is snapped back onto the closed list", () => {
  const result = parseWikiTaggingResponse('{"category":"Marketing Strategy","tags":["ads"]}', [...DEFAULT_WIKI_CATEGORIES]);

  assert.ok(DEFAULT_WIKI_CATEGORIES.includes(result.category as never));
  assert.equal(result.category, "General");
});

test("a near-miss category name resolves to the real category", () => {
  assert.equal(resolveWikiCategory("advertising", [...DEFAULT_WIKI_CATEGORIES]), "Advertising");
  assert.equal(resolveWikiCategory("Advertising and promotion", [...DEFAULT_WIKI_CATEGORIES]), "Advertising");
  assert.equal(resolveWikiCategory("", [...DEFAULT_WIKI_CATEGORIES]), "General");
  assert.equal(resolveWikiCategory(undefined, [...DEFAULT_WIKI_CATEGORIES]), "General");
});

test("malformed model output degrades to General with no tags rather than throwing", () => {
  for (const bad of ["", "not json at all", "{", '{"category":']) {
    const result = parseWikiTaggingResponse(bad, [...DEFAULT_WIKI_CATEGORIES]);
    assert.equal(result.category, "General");
    assert.deepEqual(result.tags, []);
  }
});

test("tags from the model are lower-cased and de-duplicated", () => {
  const result = parseWikiTaggingResponse('{"category":"General","tags":["Meta","meta"," Budget "]}', [...DEFAULT_WIKI_CATEGORIES]);

  assert.deepEqual(result.tags, ["meta", "budget"]);
});

// --- List panel: search, add, filters ---------------------------------------

test("the list header carries the search field and the add button", () => {
  const html = renderWikiListPanel({ articles: [], search: "", categories: [] });

  assert.match(html, /wiki-list__header/);
  assert.match(html, /data-wiki-add/);
  assert.match(html, /name="q"/);
});

test("an untagged article shows that tagging is still running", () => {
  const html = renderWikiListPanel({
    articles: [
      {
        id: 4,
        title: "Fresh article",
        category: "General",
        tags: [],
        summary: "",
        isPinned: false,
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
    ],
    search: "",
    categories: [],
  });

  assert.match(html, /data-wiki-tagging="4"/);
  assert.match(html, /Tagging/);
});

// --- WYSIWYG -----------------------------------------------------------------

test("the editor offers the rich text toolbar and a regenerate control", () => {
  const html = renderWikiEditorPanel({
    article: {
      id: 9,
      title: "Brand voice",
      category: "Brand & Voice",
      tags: ["voice"],
      summary: "",
      contentHtml: "<p>Warm and plain.</p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
    categories: ["Advertising", "Brand & Voice"],
  });

  assert.match(html, /data-wiki-toolbar/);
  assert.match(html, /data-wiki-cmd="bold"/);
  assert.match(html, /data-wiki-regenerate/);
  // Category is a closed list, never a free-text field.
  assert.match(html, /<select name="category">/);
  assert.match(html, /<option value="Brand &amp; Voice" selected>/);
});
// --- Local AI runtime --------------------------------------------------------

test("the builtin provider needs no external runtime", async () => {
  const config = {
    AI_PROVIDER: "builtin" as const,
    AI_BASE_URL: "http://127.0.0.1:11434",
    AI_CHAT_MODEL: "test",
    AI_TIMEOUT_MS: 1000,
  };

  assert.equal(await isAiReady(config), true);
  assert.equal(await ensureAiRunning(config), true);
});

test("an unreachable ollama endpoint reports not ready rather than throwing", async () => {
  // Port 1 is reserved and refuses connections, so this exercises the failure
  // path without waiting on a real timeout.
  const ready = await isAiReady({
    AI_PROVIDER: "ollama" as const,
    AI_BASE_URL: "http://127.0.0.1:1",
    AI_CHAT_MODEL: "test",
    AI_TIMEOUT_MS: 1000,
  });

  assert.equal(ready, false);
});

// --- Shared rich text --------------------------------------------------------

test("the rich text editor is one shared component, not per-flow variants", () => {
  const a = renderWikiRichText({ contentAttribute: "data-wiki-content", html: "<p>One</p>" });
  const b = renderWikiRichText({ contentAttribute: "data-wiki-content", html: "<p>Two</p>" });

  const toolbarOf = (html: string) => html.slice(0, html.indexOf("wiki-editor__content"));
  assert.equal(toolbarOf(a), toolbarOf(b));
  assert.match(a, /<p>One<\/p>/);
});

test("an empty article still gets an editable paragraph to type into", () => {
  const html = renderWikiRichText({ contentAttribute: "data-wiki-content", html: "" });

  assert.match(html, /contenteditable="true"><p><\/p>/);
});

// --- Add is a modal, not a form on the page ---------------------------------

test("adding an article lives in a modal, not above the wiki itself", () => {
  const html = renderWikiListPanel({ articles: [], search: "", categories: [] });

  // The create form must be inside the dialog, so the wiki list is what the
  // page actually shows.
  assert.match(html, /<dialog class="wiki-modal" data-wiki-create-dialog/);
  const dialogStart = html.indexOf("data-wiki-create-dialog");
  const formStart = html.indexOf("data-wiki-create>");
  assert.ok(dialogStart !== -1 && formStart > dialogStart, "create form should sit inside the dialog");
});

test("the article list comes before the add dialog in the markup", () => {
  const html = renderWikiListPanel({ articles: [], search: "", categories: [] });

  assert.ok(
    html.indexOf("wiki-list__rows") < html.indexOf("data-wiki-create-dialog"),
    "the wiki list is the main content and should precede the dialog",
  );
});

// --- Reading is the default; editing is a deliberate step -------------------

test("opening an article shows it for reading with an edit button", () => {
  const html = renderWikiArticlePanel({
    article: {
      id: 12,
      title: "Meta ads budget",
      category: "Advertising",
      tags: ["meta", "budget"],
      summary: "Twenty a day per centre.",
      contentHtml: "<h2>Daily budget</h2><p>Twenty dollars per day.</p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  });

  // Rendered content, not an editable surface.
  assert.match(html, /<h2>Daily budget<\/h2>/);
  assert.doesNotMatch(html, /contenteditable/);
  assert.match(html, /href="\/wiki\?panel=wiki-editor&article=12"/);
  assert.match(html, /wiki-article__edit/);
});

test("an article with no content yet says so instead of looking broken", () => {
  const html = renderWikiArticlePanel({
    article: {
      id: 13,
      title: "Empty",
      category: "General",
      tags: [],
      summary: "",
      contentHtml: "",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  });

  assert.match(html, /no content yet/);
});

test("the reader asks for a selection when no article is open", () => {
  const html = renderWikiArticlePanel({ article: null });

  assert.match(html, /Select an article/);
});

test("the reader and the editor are never both shown at once", () => {
  const reading = renderWikiAppShell({
    focusPanelId: "wiki-article",
    list: { articles: [], search: "", categories: [] },
    article: {
      article: {
        id: 1,
        title: "A",
        category: "General",
        tags: [],
        summary: "",
        contentHtml: "<p>Body.</p>",
        isPinned: false,
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
    },
    editor: { article: null, categories: [] },
  });

  // No editable surface renders in the reader (a mention in a script comment
  // is not one, so match the attribute as it would actually appear).
  assert.doesNotMatch(reading, /contenteditable="true"/);
  assert.doesNotMatch(reading, /wiki-editor__content/);
  assert.match(reading, /wiki-article__edit/);
});

test("the editor returns to the article rather than all the way to the list", () => {
  const editing = renderWikiAppShell({
    focusPanelId: "wiki-editor",
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: {
      article: {
        id: 5,
        title: "A",
        category: "General",
        tags: [],
        summary: "",
        contentHtml: "<p>Body.</p>",
        isPinned: false,
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      categories: [],
    },
  });

  assert.match(editing, /href="\/wiki\?panel=wiki-article&article=5"/);
  assert.match(editing, /contenteditable/);
});

// --- Category management ----------------------------------------------------

test("the categories modal lists each category with its article count", () => {
  const html = renderWikiListPanel({
    articles: [],
    search: "",
    categories: [
      { id: 1, name: "Advertising", isProtected: false, articleCount: 3 },
      { id: 2, name: "General", isProtected: true, articleCount: 1 },
    ],
  });

  assert.match(html, /data-wiki-categories-dialog/);
  assert.match(html, /value="Advertising"/);
  assert.match(html, /3 articles/);
  assert.match(html, /1 article</);
});

test("the default category cannot be deleted from the modal", () => {
  const html = renderWikiListPanel({
    articles: [],
    search: "",
    categories: [
      { id: 1, name: "Advertising", isProtected: false, articleCount: 0 },
      { id: 2, name: "General", isProtected: true, articleCount: 0 },
    ],
  });

  // The unprotected one gets a delete button; the protected one gets a lock.
  assert.equal((html.match(/data-wiki-category-delete/g) ?? []).length, 1);
  assert.match(html, /wiki-categories__locked/);
});

test("the modal explains that deleting re-files rather than destroys", () => {
  const html = renderWikiListPanel({ articles: [], search: "", categories: [] });

  assert.match(html, /moves its articles to General/);
});

test("the wiki page offers a way into category management", () => {
  const html = renderWikiListPanel({ articles: [], search: "", categories: [] });

  assert.match(html, /data-wiki-categories\b/);
  assert.match(html, /<span>Categories<\/span>/);
});

test("the editor offers the managed categories, with the current one selected", () => {
  const html = renderWikiEditorPanel({
    article: {
      id: 1,
      title: "A",
      category: "Advertising",
      tags: [],
      summary: "",
      contentHtml: "<p>Body.</p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
    categories: ["Advertising", "Enrolment"],
  });

  assert.match(html, /<option value="Advertising" selected>/);
  assert.match(html, /<option value="Enrolment">/);
});

test("an article keeps showing a category that has since been removed", () => {
  const html = renderWikiEditorPanel({
    article: {
      id: 1,
      title: "A",
      category: "Retired Category",
      tags: [],
      summary: "",
      contentHtml: "<p>Body.</p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
    categories: ["Advertising"],
  });

  // Otherwise the select would silently re-file the article on the next save.
  assert.match(html, /<option value="Retired Category" selected>/);
});

test("the AI is told to use the categories that currently exist", () => {
  const messages = buildWikiTaggingChatMessages({
    title: "A",
    bodyText: "Body.",
    categories: ["Photography", "Open Days"],
  });

  assert.match(messages[0].content, /- Photography/);
  assert.match(messages[0].content, /- Open Days/);
  // A category that was deleted must not be offered any more.
  assert.doesNotMatch(messages[0].content, /- Advertising/);
});

test("a model reply is snapped onto the live category list, not a stale one", () => {
  const result = parseWikiTaggingResponse('{"category":"Advertising","tags":["x"]}', ["Photography", "General"]);

  // "Advertising" no longer exists, so it must fall back rather than be stored.
  assert.equal(result.category, "General");
});

test("renaming a category is reflected in what the AI may choose", () => {
  const messages = buildWikiTaggingChatMessages({
    title: "A",
    bodyText: "Body.",
    categories: ["Paid Advertising"],
  });

  assert.match(messages[0].content, /- Paid Advertising/);
  assert.equal(resolveWikiCategory("Paid Advertising", ["Paid Advertising"]), "Paid Advertising");
});

test("with no categories at all the fallback is still usable", () => {
  assert.equal(resolveWikiCategory("Anything", []), "General");
  assert.equal(parseWikiTaggingResponse("{}", []).category, "General");
});

test("a list without General falls back to its first category", () => {
  // Guarantees an article always gets a category that actually exists.
  assert.equal(resolveWikiCategory("Nonsense", ["Photography", "Open Days"]), "Photography");
});

// --- Bullet lists ------------------------------------------------------------

test("the editor offers indent controls so bullets can be nested", () => {
  const html = renderWikiRichText({ contentAttribute: "data-wiki-content", html: "<p></p>" });

  assert.match(html, /data-wiki-cmd="insertUnorderedList"/);
  assert.match(html, /data-wiki-cmd="indent"/);
  assert.match(html, /data-wiki-cmd="outdent"/);
});

test("nested lists survive sanitising, so indented bullets persist", () => {
  const nested = "<ul><li>Top<ul><li>Nested</li></ul></li><li>Second</li></ul>";

  assert.equal(sanitizeJdBlurbHtml(nested), nested);
});

test("a blockquote wrapper is stripped without losing the list inside it", () => {
  // execCommand("indent") can wrap a top-level list in a blockquote, which is
  // not on the allow-list; the bullets must still survive.
  assert.equal(sanitizeJdBlurbHtml("<blockquote><ul><li>x</li></ul></blockquote>"), "<ul><li>x</li></ul>");
});

test("rich-text surfaces restore the list indent the global reset removes", () => {
  const css = readFileSync(new URL("../src/ui/app.css", import.meta.url), "utf8");

  // `ul, ol { padding: 0 }` near the top of app.css would otherwise leave
  // bullets flush left with their markers clipped.
  for (const selector of [".wiki-editor__content ul", ".wiki-article__body ul", ".jd-blurb__editor ul"]) {
    const index = css.indexOf(`${selector},`);
    assert.notEqual(index, -1, `${selector} should have list styling`);
  }
  assert.match(css, /padding-left: 1\.6em;\n  list-style-position: outside;/);
});

// --- Entity handling on save -------------------------------------------------

test("a non-breaking space is stored as a space, not as literal &nbsp; text", () => {
  // contenteditable inserts &nbsp; constantly. Escaping the & turned it into
  // visible "&nbsp;" markup in the saved article.
  assert.equal(sanitizeJdBlurbHtml("<p>Hello&nbsp;world</p>"), "<p>Hello world</p>");
});

test("punctuation entities become their characters", () => {
  assert.equal(sanitizeJdBlurbHtml("<p>it&rsquo;s &mdash; fine</p>"), "<p>it’s — fine</p>");
  assert.equal(sanitizeJdBlurbHtml("<p>&#8212; and &#x2014;</p>"), "<p>— and —</p>");
});

test("a real ampersand still round-trips as one ampersand", () => {
  assert.equal(sanitizeJdBlurbHtml("<p>Tom &amp; Jerry</p>"), "<p>Tom &amp; Jerry</p>");
  assert.equal(sanitizeJdBlurbHtml("<p>Fish & Chips</p>"), "<p>Fish &amp; Chips</p>");
});

test("saving repeatedly does not compound the escaping", () => {
  // The original bug grew on every save: &nbsp; -> &amp;nbsp; -> &amp;amp;nbsp;
  for (const input of [
    "<p>Hello&nbsp;world</p>",
    "<p>Tom &amp; Jerry</p>",
    "<p>5 &lt; 10</p>",
    "<p>it&rsquo;s</p>",
  ]) {
    const once = sanitizeJdBlurbHtml(input);
    assert.equal(sanitizeJdBlurbHtml(once), once, `not idempotent for ${input}`);
  }
});

test("an unknown entity is left visible rather than silently dropped", () => {
  assert.equal(sanitizeJdBlurbHtml("<p>&zzz; stays</p>"), "<p>&amp;zzz; stays</p>");
});

test("decoding entities does not let script markup through", () => {
  // Numeric entities decode to < and >, so they must be re-escaped, not trusted.
  for (const input of [
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "&#60;script&#62;alert(1)&#60;/script&#62;",
    "<p>&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;</p>",
  ]) {
    const out = sanitizeJdBlurbHtml(input);
    assert.doesNotMatch(out, /<script/i, `script survived for ${input}`);
  }
});

test("a numeric non-breaking space is normalised like the named one", () => {
  assert.equal(sanitizeJdBlurbHtml("<p>a&#160;b</p>"), "<p>a b</p>");
  assert.equal(sanitizeJdBlurbHtml("<p>a&#xA0;b</p>"), "<p>a b</p>");
});

// --- Inline emphasis ---------------------------------------------------------

test("bold survives saving, whichever tag the browser produced", () => {
  // execCommand("bold") emits <b> in most browsers, not <strong>; allow-listing
  // only <strong> silently stripped every bold run on save.
  assert.equal(sanitizeJdBlurbHtml("<p><b>Bold</b> text</p>"), "<p><strong>Bold</strong> text</p>");
  assert.equal(sanitizeJdBlurbHtml("<p><strong>Bold</strong></p>"), "<p><strong>Bold</strong></p>");
  assert.equal(sanitizeJdBlurbHtml("<p><B>Upper</B></p>"), "<p><strong>Upper</strong></p>");
});

test("italic, underline and strikethrough survive saving", () => {
  assert.equal(sanitizeJdBlurbHtml("<p><i>It</i></p>"), "<p><em>It</em></p>");
  assert.equal(sanitizeJdBlurbHtml("<p><em>It</em></p>"), "<p><em>It</em></p>");
  assert.equal(sanitizeJdBlurbHtml("<p><u>U</u></p>"), "<p><u>U</u></p>");
  assert.equal(sanitizeJdBlurbHtml("<p><strike>S</strike></p>"), "<p><s>S</s></p>");
});

test("nested emphasis keeps both levels", () => {
  assert.equal(sanitizeJdBlurbHtml("<p><b><i>Both</i></b></p>"), "<p><strong><em>Both</em></strong></p>");
});

test("emphasis normalising is idempotent across repeated saves", () => {
  const once = sanitizeJdBlurbHtml("<p><b>Bold</b> and <i>italic</i></p>");
  assert.equal(sanitizeJdBlurbHtml(once), once);
});

test("the editor offers bold, italic and underline controls", () => {
  const html = renderWikiRichText({ contentAttribute: "data-wiki-content", html: "<p></p>" });

  assert.match(html, /data-wiki-cmd="bold"/);
  assert.match(html, /data-wiki-cmd="italic"/);
  assert.match(html, /data-wiki-cmd="underline"/);
});

test("bold is given a visible weight rather than inheriting the reset", () => {
  const css = readFileSync(new URL("../src/ui/app.css", import.meta.url), "utf8");

  assert.match(css, /\.wiki-editor__content strong,/);
  assert.match(css, /\.wiki-article__body strong,/);
});

test("allowing presentational tags does not let dangerous ones through", () => {
  for (const input of ["<script>bad</script>", '<p onclick="x">safe</p>', "<img src=x onerror=alert(1)>"]) {
    const out = sanitizeJdBlurbHtml(input);
    assert.doesNotMatch(out, /<script|onclick|onerror|<img/i);
  }
});

// --- Copy to clipboard -------------------------------------------------------

test("the reader offers copy alongside edit", () => {
  const html = renderWikiArticlePanel({
    article: {
      id: 3,
      title: "A",
      category: "General",
      tags: [],
      summary: "",
      contentHtml: "<p><strong>Bold</strong></p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  });

  assert.match(html, /data-wiki-copy/);
  // The copy handler needs a marked body to read from in the reader.
  assert.match(html, /data-wiki-article-body/);
});

test("copy sends a full HTML document, not a bare fragment", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  // Copying a real selection is what carries formatting across browsers; the
  // async clipboard API is only the fallback.
  assert.match(shell, /document\.execCommand\("copy"\)/);
  assert.match(shell, /"text\/html"/);
  assert.match(shell, /"text\/plain"/);
  assert.ok(
    shell.indexOf("selectionCopy()") < shell.indexOf("navigator.clipboard"),
    "the selection route should be tried before the async clipboard API",
  );
});

test("copy inlines emphasis as style attributes so it survives pasting", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  assert.match(shell, /font-weight:700/);
  assert.match(shell, /font-style:italic/);
  assert.match(shell, /text-decoration:underline/);
  assert.match(shell, /padding-left:28px/);
  // Headings need explicit sizes or they paste as ordinary body text.
  assert.match(shell, /H1: "font-size:22pt/);
  assert.match(shell, /H2: "font-size:16pt/);
});

test("copy falls back to a real selection rather than dropping to plain text", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  // writeText would silently discard the formatting.
  assert.match(shell, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(shell, /navigator\.clipboard\.writeText/);
  // The holder must be laid out; a zero-size off-screen element copies nothing.
  assert.match(shell, /width:1px; height:1px/);
});

// --- Summary generation ------------------------------------------------------

test("the AI is asked for a one-line summary alongside category and tags", () => {
  const messages = buildWikiTaggingChatMessages({
    title: "Meta budget",
    bodyText: "Twenty a day.",
    categories: ["Advertising"],
  });

  assert.match(messages[0].content, /"summary"/);
  assert.match(messages[0].content, /ONE plain sentence/);
  // A summary that describes the document rather than its content is useless
  // as AI grounding.
  assert.match(messages[0].content, /NEVER begin the summary with/);
});

test("a generated summary is parsed out of the reply", () => {
  const result = parseWikiTaggingResponse(
    '{"category":"Advertising","tags":["meta"],"summary":"Meta campaigns start at $20 per day per centre."}',
    ["Advertising"],
  );

  assert.equal(result.summary, "Meta campaigns start at $20 per day per centre.");
});

test("a multi-line summary is flattened to one line", () => {
  const json = JSON.stringify({
    category: "General",
    tags: ["x"],
    summary: "First line.\n\nSecond line.",
  });
  const result = parseWikiTaggingResponse(json, ["General"]);

  assert.equal(result.summary, "First line. Second line.");
});

test("a missing summary parses as empty rather than throwing", () => {
  assert.equal(parseWikiTaggingResponse('{"category":"General","tags":[]}', ["General"]).summary, "");
  assert.equal(parseWikiTaggingResponse("nonsense", ["General"]).summary, "");
});

test("finishing editing returns to the article without waiting on the summary", () => {
  const shell = renderWikiAppShell({
    focusPanelId: "wiki-editor",
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: {
      article: {
        id: 4,
        title: "A",
        category: "General",
        tags: [],
        summary: "",
        contentHtml: "<p>Body.</p>",
        isPinned: false,
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      categories: ["General"],
    },
  });

  assert.match(shell, /data-wiki-done-editing/);
  assert.match(shell, /\/finish-editing/);
  // Leaving the editor must not wait on the model: navigation is not chained
  // off the request, and keepalive lets it finish after the page is gone.
  assert.match(shell, /keepalive: true/);
  assert.ok(
    shell.indexOf("/finish-editing") < shell.indexOf("window.location.href = target"),
    "navigation should be issued without awaiting the summary",
  );
  assert.doesNotMatch(shell, /Summarising\.\.\./);
  // The edits ride along with the request, so the save cannot race the summary.
  assert.match(shell, /article: payload/);
  // Only regenerate when the body actually moved on.
  assert.match(shell, /contentChanged: contentChanged/);
});

test("the summary field says the AI writes it", () => {
  const html = renderWikiEditorPanel({
    article: {
      id: 1,
      title: "A",
      category: "General",
      tags: [],
      summary: "",
      contentHtml: "<p>x</p>",
      isPinned: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
    categories: ["General"],
  });

  assert.match(html, /written by AI when you finish editing/);
});

test("a summary that describes the document is rewritten to state the fact", () => {
  // Local models keep writing "The article outlines..." however firmly the
  // prompt forbids it, so the opener is stripped after the fact.
  assert.equal(
    stripMetaOpener("The article outlines the job application process using Formstack."),
    "The job application process using Formstack.",
  );
  assert.equal(
    stripMetaOpener("This document explains the photography policy."),
    "The photography policy.",
  );
  assert.equal(stripMetaOpener("This article describes how enrolment works."), "How enrolment works.");
});

test("a summary that already states the fact is left alone", () => {
  const good = "Job applications come in through Formstack and are kept for 90 days.";

  assert.equal(stripMetaOpener(good), good);
  assert.equal(stripMetaOpener("Marketing must not use images of real children."), "Marketing must not use images of real children.");
});

test("stripping the opener is applied to generated summaries", () => {
  const json = JSON.stringify({
    category: "General",
    tags: ["x"],
    summary: "The article outlines the retention policy.",
  });

  assert.equal(parseWikiTaggingResponse(json, ["General"]).summary, "The retention policy.");
});

test("the prompt shows the model what a wrong summary looks like", () => {
  const messages = buildWikiTaggingChatMessages({ title: "A", bodyText: "B", categories: ["General"] });

  assert.match(messages[0].content, /NEVER begin the summary with/);
  assert.match(messages[0].content, /WRONG: "The article outlines/);
  assert.match(messages[0].content, /RIGHT: "Job applications come in through Formstack/);
});

test("regenerating updates the summary field, not just tags", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  assert.match(shell, /input\[name="summary"\]/);
  assert.match(shell, /payload\.summary/);
});

test("the editor only sends a category the user actually chose", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  // Sending a category locks it against the AI, so an untouched select must not
  // be part of the autosave payload.
  assert.match(shell, /categoryTouched = true/);
  assert.match(shell, /if \(!categoryTouched\) delete payload\.category;/);
});

test("the editor says who owns the category", () => {
  const article = {
    id: 7,
    title: "Meta ads budget rules",
    category: "Advertising",
    tags: ["meta"],
    summary: "How we set daily spend.",
    contentHtml: "<p>Twenty a day.</p>",
    isPinned: false,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const categories = ["Advertising", "General"];

  const unlocked = renderWikiEditorPanel({
    article: { ...article, isCategoryLocked: false },
    categories,
  });
  const locked = renderWikiEditorPanel({
    article: { ...article, isCategoryLocked: true },
    categories,
  });

  assert.match(unlocked, /set by AI until you choose one/);
  assert.match(locked, /set by you — the AI will not change it/);
});

test("copy repairs lists nested directly inside a list", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  // contenteditable produces <ul><ul>, which is invalid and pastes flat.
  assert.match(shell, /ul > ul, ul > ol, ol > ul, ol > ol/);
  assert.match(shell, /previous\.appendChild\(list\)/);
});

test("copy wraps loose text so it does not merge with the next block", () => {
  const shell = renderWikiAppShell({
    list: { articles: [], search: "", categories: [] },
    article: { article: null },
    editor: { article: null, categories: [] },
  });

  assert.match(shell, /nodeType !== 3/);
});
