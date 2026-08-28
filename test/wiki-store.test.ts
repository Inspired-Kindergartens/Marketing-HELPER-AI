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
import {
  DEFAULT_WIKI_CATEGORIES,
  buildWikiTaggingChatMessages,
  parseWikiTaggingResponse,
  resolveWikiCategory,
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

  assert.doesNotMatch(reading, /contenteditable/);
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
