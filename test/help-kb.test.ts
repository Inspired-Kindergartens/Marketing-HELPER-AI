import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGoogleAnalyticsLinks,
  parseGoogleAnalyticsArticle,
  parseHtmlDocument,
  parseMarkdownDocument,
  parseTextDocument,
  splitHtmlOnHeadings,
  buildPhraseQuery,
  reciprocalRankFusion,
} from "../src/help-kb/parse.js";
import { HELP_SOURCES } from "../src/help-kb/sources.js";

const GA_PAGE = `
  <html><head><meta name="description" content="Events GA4 recommends."></head><body>
  <nav><a href="/analytics/topic/111?hl=en&amp;ref_topic=9">Topic</a></nav>
  <div class="article-container" data-stats-ve="35">
    <h1>[GA4] Recommended events</h1>
    <p>Adding these events helps you measure more.</p>
    <h2 id="lead-gen">For lead generation</h2>
    <p>Send <strong>generate_lead</strong> when a form is submitted.</p>
    <a href="/analytics/answer/222?hl=en&amp;ref_topic=1">Related</a>
  </div>
  <div class="article-survey-container">Was this helpful?</div>
  </body></html>
`;

test("parseGoogleAnalyticsArticle reads the article region split at headings", () => {
  const article = parseGoogleAnalyticsArticle(GA_PAGE, "https://support.google.com/analytics/answer/1?hl=en");
  assert.ok(article);
  assert.equal(article.title, "[GA4] Recommended events");
  assert.equal(article.summary, "Events GA4 recommends.");
  assert.deepEqual(
    article.sections.map((section) => [section.anchor, section.heading]),
    [
      ["", ""],
      ["lead-gen", "For lead generation"],
    ],
  );
  assert.equal(article.sections[0].text, "Adding these events helps you measure more.");
  assert.doesNotMatch(article.sections.map((section) => section.text).join(" "), /data-stats|Was this helpful/);
});

test("parseGoogleAnalyticsArticle skips retired Universal Analytics articles", () => {
  const ua = GA_PAGE.replace("[GA4] Recommended events", "[UA] Goals");
  assert.equal(parseGoogleAnalyticsArticle(ua, "u"), null);
});

test("extractGoogleAnalyticsLinks normalises answers and topics to one English URL", () => {
  assert.deepEqual(extractGoogleAnalyticsLinks(GA_PAGE), {
    answers: ["https://support.google.com/analytics/answer/222?hl=en"],
    topics: ["https://support.google.com/analytics/topic/111?hl=en"],
  });
});

test("splitHtmlOnHeadings keeps an untitled opening and heading ids", () => {
  const sections = splitHtmlOnHeadings(`<p>Intro</p><h2 id="a">First</h2><p>One</p><h3>Second</h3><p>Two</p>`);
  assert.deepEqual(sections, [
    { anchor: "", heading: "", text: "Intro" },
    { anchor: "a", heading: "First", text: "One" },
    { anchor: "", heading: "Second", text: "Two" },
  ]);
});

test("parseMarkdownDocument takes the # heading as title and splits at ## headings", () => {
  const article = parseMarkdownDocument("# Guide\n\nIntro text\n\n## Urgency score\n\nBands are...\n", "local:k/g.md", "fallback");
  assert.ok(article);
  assert.equal(article.title, "Guide");
  assert.deepEqual(
    article.sections.map((section) => [section.anchor, section.heading, section.text]),
    [
      ["guide", "", "Intro text"],
      ["urgency-score", "Urgency score", "Bands are..."],
    ],
  );
});

test("parseMarkdownDocument falls back to the file name for a title", () => {
  assert.equal(parseMarkdownDocument("Just text", "local:x.md", "my notes")?.title, "my notes");
  assert.equal(parseMarkdownDocument("   ", "local:x.md", "empty"), null);
});

test("parseHtmlDocument prefers the main element of a saved page", () => {
  const article = parseHtmlDocument(
    "<html><head><title>Saved | Meta</title></head><body><nav>Menu</nav><main><h1>About learning</h1><h2>Learning limited</h2><p>Too few events.</p></main></body></html>",
    "local:k/m.html",
    "m",
  );
  assert.ok(article);
  assert.equal(article.title, "About learning");
  assert.deepEqual(article.sections, [{ anchor: "", heading: "Learning limited", text: "Too few events." }]);
});

test("parseTextDocument gives a PDF one section per page", () => {
  const article = parseTextDocument("", "local:k/x.pdf", "Manual", ["Page one text", "  ", "Page three"]);
  assert.ok(article);
  assert.deepEqual(
    article.sections.map((section) => [section.anchor, section.heading]),
    [
      ["page=1", "Page 1"],
      ["page=3", "Page 3"],
    ],
  );
});

test("source topics route dashboard questions to the right help", () => {
  assert.ok(HELP_SOURCES.infocare.topic.test("Why is Te Puke critical urgency?"));
  assert.ok(HELP_SOURCES.meta.topic.test("What does learning limited mean?"));
  assert.ok(HELP_SOURCES["google-analytics"].topic.test("What is engagement rate in GA4?"));
  assert.ok(HELP_SOURCES.mailchimp.topic.test("How do I add a merge tag?"));
  assert.ok(!HELP_SOURCES.infocare.topic.test("Write a short article about Matariki"));
});

test("every source indexes its own knowledge/ drop folder", () => {
  for (const [id, source] of Object.entries(HELP_SOURCES)) {
    assert.ok(source.localPaths.includes(`knowledge/${id}`), id);
  }
});

test("buildPhraseQuery pairs consecutive meaningful words", () => {
  assert.equal(buildPhraseQuery("What does Review spend mean?"), "review <-> spend | spend <-> mean");
  assert.equal(buildPhraseQuery("Learning"), "");
});

test("reciprocalRankFusion weights let one list count double", () => {
  const merged = reciprocalRankFusion([[1, 2], [2, 1], [3]], 60, [1, 1, 3]);
  assert.equal(merged[0].id, 3);
});
