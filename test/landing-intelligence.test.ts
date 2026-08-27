import assert from "node:assert/strict";
import test from "node:test";

import {
  BRAND_QUERIES,
  NEWS_QUERY_TIERS,
  SECTOR_WATCH_QUERIES,
  SOURCE_SPECIFIC_NEWS_QUERIES,
  assessNewsCandidate,
  isBlockedSourceItem,
  isFreshFeedItem,
  isLikelyNewsArticleItem,
  isLikelyPaywalledItem,
  isPublicFacingRelevantVideoPage,
  isStandaloneVideoLink,
  isNzOrAustraliaRelatedItem,
  parseNzHeraldEducationListing,
  parseRnzListing,
  parseStuffListing,
  parseSunLiveListing,
} from "../src/landing-intelligence.js";

const NOW = new Date("2026-07-31T00:00:00.000Z").getTime();
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

test("landing intelligence queries cover NZ and Australia ECE news terms", () => {
  const combinedNewsQueries = [...SOURCE_SPECIFIC_NEWS_QUERIES, ...NEWS_QUERY_TIERS].join(" ");

  assert.match(combinedNewsQueries, /early childhood/);
  assert.match(combinedNewsQueries, /early childhood education/);
  assert.match(combinedNewsQueries, /\bECE\b/);
  assert.match(combinedNewsQueries, /kindergarten/);
  assert.match(combinedNewsQueries, /New Zealand/);
  assert.match(combinedNewsQueries, /Australia/);
  assert.doesNotMatch(combinedNewsQueries, /international/);
  assert.doesNotMatch(combinedNewsQueries, /United Kingdom/);
  assert.doesNotMatch(combinedNewsQueries, /United States/);
  assert.doesNotMatch(combinedNewsQueries, /Canada/);
});

test("landing intelligence runs source-specific and official ECE searches", () => {
  const combinedSourceQueries = SOURCE_SPECIFIC_NEWS_QUERIES.join(" ");

  assert.match(combinedSourceQueries, /NZ Herald/);
  assert.match(combinedSourceQueries, /site:nzherald\.co\.nz/);
  assert.match(combinedSourceQueries, /Stuff/);
  assert.match(combinedSourceQueries, /site:stuff\.co\.nz/);
  assert.match(combinedSourceQueries, /RNZ/);
  assert.match(combinedSourceQueries, /site:rnz\.co\.nz/);
  assert.match(combinedSourceQueries, /SunLive/);
  assert.match(combinedSourceQueries, /site:sunlive\.co\.nz/);
  assert.match(combinedSourceQueries, /Bay of Plenty/);
  assert.match(combinedSourceQueries, /Tauranga/);
  assert.match(combinedSourceQueries, /NZME/);
  assert.match(combinedSourceQueries, /Education Review Office/);
  assert.match(combinedSourceQueries, /site:ero\.govt\.nz/);
  assert.match(combinedSourceQueries, /Ministry of Education/);
  assert.match(combinedSourceQueries, /MoE/);
  assert.match(combinedSourceQueries, /site:education\.govt\.nz/);
  assert.match(combinedSourceQueries, /NZEI/);
  assert.match(combinedSourceQueries, /site:nzei\.org\.nz/);
  assert.match(combinedSourceQueries, /press release/);
});

test("landing intelligence watch queries include required kindergarten organisations", () => {
  const watchedQueries = [...BRAND_QUERIES, ...SECTOR_WATCH_QUERIES].map((item) => item.query).join(" ");

  assert.match(watchedQueries, /"Inspired Kindergartens"/);
  assert.match(watchedQueries, /"Tauranga Regional Free Kindergarten Association"/);
  assert.match(watchedQueries, /"Kindergartens Aotearoa"/);
  assert.match(watchedQueries, /NZME/);
  assert.match(watchedQueries, /Education Review Office/);
  assert.match(watchedQueries, /Ministry of Education/);
  assert.match(watchedQueries, /MoE/);
  assert.match(watchedQueries, /NZEI/);
  assert.match(watchedQueries, /"Whānau Manaaki"/);
});

test("NZ Herald listing parser captures New Zealand section early-childhood stories", () => {
  const html = `
    <script>
      self.__next_f.push([1, '{"websiteUrl":"\\/nz\\/early-childhood-teacher-accused-of-filming-in-a-staff-bathroom\\/6OVKWPMGXBH3ZLBCRCYL4522KY\\/","headline":"Early childhood teacher accused of filming in a staff bathroom","publishDate":"2026-07-28T02:34:00.000Z","description":"An early childhood teacher has been charged after a recording device was found in a staff bathroom."}']);
    </script>
  `;

  const items = parseNzHeraldEducationListing(html);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Early childhood teacher accused of filming in a staff bathroom");
  assert.equal(
    items[0].link,
    "https://www.nzherald.co.nz/nz/early-childhood-teacher-accused-of-filming-in-a-staff-bathroom/6OVKWPMGXBH3ZLBCRCYL4522KY/",
  );
  assert.equal(items[0].publishedAt, "2026-07-28T02:34:00.000Z");
});

test("RNZ listing parser captures crime-and-justice early-childhood stories", () => {
  const html = `
    <h3 class="o-digest__headline">
      <a href="/news/crime-and-justice/817700/early-childhood-teacher-accused-of-filming-in-a-staff-bathroom">Early childhood teacher accused of filming in a staff bathroom</a>
    </h3>
    <span class="o-kicker__time kicker-item">28 Jul 2026</span>
  `;

  const items = parseRnzListing(html, "RNZ Crime and Justice");

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Early childhood teacher accused of filming in a staff bathroom");
  assert.equal(
    items[0].link,
    "https://www.rnz.co.nz/news/crime-and-justice/817700/early-childhood-teacher-accused-of-filming-in-a-staff-bathroom",
  );
  assert.equal(items[0].source, "RNZ Crime and Justice");
});

test("Stuff listing parser captures early-childhood article links", () => {
  const html = `
    <script>
      window.__DATA__ = {"headline":"Bay of Plenty kindergarten rolls out early learning garden","url":"/nz-news/360/article/bay-of-plenty-kindergarten-rolls-out-early-learning-garden","publishedDate":"2026-07-29T23:30:00.000Z","description":"A Bay of Plenty kindergarten has opened a new early learning garden."};
    </script>
  `;

  const items = parseStuffListing(html);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Bay of Plenty kindergarten rolls out early learning garden");
  assert.equal(
    items[0].link,
    "https://www.stuff.co.nz/nz-news/360/article/bay-of-plenty-kindergarten-rolls-out-early-learning-garden",
  );
  assert.equal(items[0].source, "Stuff");
  assert.equal(items[0].publishedAt, "2026-07-29T23:30:00.000Z");
});

test("SunLive listing parser captures teacher staff-bathroom article links", () => {
  const html = `
    <article class="news-listing">
      <h2>
        <a href="/news/383627-teacher-charged-over-recordings-in-staff-bathroom.html">Teacher charged over recordings in staff bathroom</a>
      </h2>
      <p class="date">02:00pm Tue 28 Jul, 2026 | By Sam Sherwood</p>
      <p>A former early childhood teacher has been charged after allegedly making recordings in a staff bathroom.</p>
      <a href="/news/383627-teacher-charged-over-recordings-in-staff-bathroom.html">Read More</a>
    </article>
  `;

  const items = parseSunLiveListing(html);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Teacher charged over recordings in staff bathroom");
  assert.equal(
    items[0].link,
    "https://www.sunlive.co.nz/news/383627-teacher-charged-over-recordings-in-staff-bathroom.html",
  );
  assert.equal(items[0].source, "SunLive");
  assert.equal(items[0].author, "Sam Sherwood");
  assert.match(items[0].description, /former early childhood teacher/i);
  assert.equal(items[0].publishedAt, "2026-07-28T02:00:00.000Z");
});

test("landing intelligence blacklists Allora News items", () => {
  assert.equal(
    isBlockedSourceItem({
      title: "Childcare centre funding changes",
      link: null,
      source: "Allora! Italian Australian News",
      description: "An early childhood story.",
    }),
    true,
  );
  assert.equal(
    isBlockedSourceItem({
      title: "Childcare centre funding changes",
      link: "https://www.alloranews.com/story",
      source: "Google News",
      description: "An early childhood story.",
    }),
    true,
  );
  assert.equal(
    isBlockedSourceItem({
      title: "Allora kindergarten wins award",
      link: "https://www.sunlive.co.nz/news/story.html",
      source: "SunLive",
      description: "A story mentioning the town of Allora.",
    }),
    false,
  );
});

test("landing intelligence rejects blacklisted sources as news candidates", () => {
  const assessment = assessNewsCandidate(
    {
      title: "Early childhood education funding boost announced",
      link: "https://www.alloranews.com/story",
      source: "Allora! Italian Australian News",
      publishedAt: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
      description: "Early childhood education centres in Australia.",
    },
    NOW,
    MAX_AGE,
  );

  assert.equal(assessment.accepted, false);
  assert.deepEqual(assessment.reasons, ["blocked-source"]);
});

test("landing intelligence excludes known paywall sources and paywall markers", () => {
  assert.equal(
    isLikelyPaywalledItem({
      title: "Early childhood teacher accused of filming in a staff bathroom",
      link: "https://www.nzherald.co.nz/nz/example/",
      source: "NZ Herald",
      description: "An early childhood story.",
    }),
    false,
  );
  assert.equal(
    isLikelyPaywalledItem({
      title: "ECE workforce update",
      link: "https://example.com/story",
      source: "Example News",
      description: "Premium subscribers only.",
    }),
    true,
  );
  assert.equal(
    isLikelyPaywalledItem({
      title: "Teacher charged over recordings in staff bathroom",
      link: "https://www.sunlive.co.nz/news/383627-teacher-charged-over-recordings-in-staff-bathroom.html",
      source: "SunLive",
      description: "A former early childhood teacher has been charged.",
    }),
    false,
  );
});

test("landing intelligence excludes static ERO institution pages from news", () => {
  assert.equal(
    isLikelyNewsArticleItem({
      title: "Saplings Early Learning Taupo Ltd",
      link: "https://www.ero.govt.nz/institution/48421/saplings-early-learning-taupo-ltd",
      source: "Education Review Office",
      description: "Early learning service profile.",
    }),
    false,
  );
  assert.equal(
    isLikelyNewsArticleItem({
      title: "ERO publishes early childhood education report",
      link: "https://www.ero.govt.nz/news/ero-publishes-early-childhood-education-report",
      source: "Education Review Office",
      description: "A new report has been released.",
    }),
    true,
  );
  assert.equal(
    isLikelyNewsArticleItem({
      title: "Saplings Early Learning Taupo Ltd - ero.govt.nz",
      link: "https://news.google.com/rss/articles/example?oc=5",
      source: "ero.govt.nz",
      description: "Saplings Early Learning Taupo Ltd  ero.govt.nz",
    }),
    false,
  );
});

test("landing intelligence excludes job vacancy pages from news", () => {
  assert.equal(
    isLikelyNewsArticleItem({
      title: "Qualified ECE teachers",
      link: "https://gazette.education.govt.nz/vacancies/1HAtAy-qualified-ece-teachers/",
      source: "Education Gazette",
      description: "Qualified ECE teachers wanted. Applications close soon.",
    }),
    false,
  );
  assert.equal(
    isLikelyNewsArticleItem({
      title: "Visiting Teacher and Administration ECE Registered Teacher",
      link: "https://gazette.education.govt.nz/vacancies/1HAtF6-visiting-teacher-and-administration-ece-registered-teacher/",
      source: "Education Gazette",
      description: "Early childhood registered teacher vacancy.",
    }),
    false,
  );
  assert.equal(
    isLikelyNewsArticleItem({
      title: "Visiting Teacher and Administration ECE Registered Teacher",
      link: "https://news.google.com/rss/articles/example?oc=5",
      source: "Education Gazette",
      description: "Vacancy listing from gazette.education.govt.nz.",
    }),
    false,
  );
  assert.deepEqual(
    assessNewsCandidate(
      {
        title: "Qualified ECE teachers",
        link: "https://gazette.education.govt.nz/vacancies/1HAtAy-qualified-ece-teachers/",
        source: "Education Gazette",
        publishedAt: "2026-07-30T00:00:00.000Z",
        description: "Qualified ECE teachers wanted. Applications close soon.",
      },
      NOW,
      MAX_AGE,
    ).reasons,
    ["not-news-article"],
  );
});

test("landing intelligence treats standalone video links as verifiable content, not automatic rejects", () => {
  const item = {
    title: "Adelaide childcare centre shut down following alleged incident",
    link: "https://www.nine.com.au/australia-news/videos/adelaide-childcare-centre-shut-down-following-alleged-incident/cmsu513wk002z0hljxj3ulbhx",
    source: "Nine",
    description: "A standalone video landing page whose visible clips do not clearly support the headline.",
  };

  assert.equal(isStandaloneVideoLink(item.link), true);
  assert.equal(isLikelyNewsArticleItem(item), true);
  assert.equal(
    assessNewsCandidate(
      {
        ...item,
        publishedAt: "2026-07-30T00:00:00.000Z",
      },
      NOW,
      MAX_AGE,
    ).accepted,
    true,
  );
});

test("landing intelligence verifies video page content against the RSS title and URL slug", () => {
  const item = {
    title: "Adelaide childcare centre shut down following alleged incident",
    link: "https://www.nine.com.au/australia-news/videos/adelaide-childcare-centre-shut-down-following-alleged-incident/cmsu513wk002z0hljxj3ulbhx",
  };
  const matchingPublicVideoPage = `
    <main>
      <h1>Adelaide childcare centre shut down following alleged incident</h1>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Adelaide childcare centre shut down following alleged incident",
          "uploadDate": "2026-07-30T00:00:00.000Z"
        }
      </script>
      <div class="video-player" data-video-id="cmsu513wk002z0hljxj3ulbhx"></div>
    </main>
  `;
  const unrelatedVideoPage = `
    <main>
      <h1>Search for missing bushwalker enters seventh day</h1>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Morning weather update for Sydney commuters"
        }
      </script>
      <div class="video-player" data-video-id="weather-clip"></div>
    </main>
  `;
  const metadataOnlyPage = `
    <main>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Adelaide childcare centre shut down following alleged incident"
        }
      </script>
      <script>window.__VIDEO_DATA__ = {"headline":"Adelaide childcare centre shut down following alleged incident","brightcoveId":"6403444752112"}</script>
    </main>
  `;

  assert.equal(isPublicFacingRelevantVideoPage(item, matchingPublicVideoPage), true);
  assert.equal(isPublicFacingRelevantVideoPage(item, unrelatedVideoPage), false);
  assert.equal(isPublicFacingRelevantVideoPage(item, metadataOnlyPage), false);
  assert.equal(isPublicFacingRelevantVideoPage(item, "<main><h1>Adelaide childcare centre shut down following alleged incident</h1></main>"), false);
});

test("landing intelligence keeps international press only when it relates to NZ or Australia", () => {
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Childcare workforce changes announced",
      link: "https://example.com/world/ece",
      source: "Global Education Daily",
      description: "A general international early childhood story.",
    }),
    false,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Kindergarten teacher charged in New Zealand relocation case",
      link: "https://example.com/world/ece",
      source: "Malay Mail",
      description: "International press coverage linked to New Zealand.",
    }),
    true,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Australian preschool funding update",
      link: "https://example.com/story",
      source: "Example News",
      description: "Policy changes for Australia.",
    }),
    true,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Turkmenistanda mekdebe cenli bilimi kamillesdirmek boyunca YUNISEF-in seminary gecirilyar",
      link: "https://turkmenportal.com/en/news/103152-turkmenistanda-mekdebe-cenli-bilimi-kamillesdirmek-boyunca-yunisef-in-seminary-gecirilyar--",
      source: "Turkmenportal",
      description: "A preschool education seminar in Turkmenistan.",
    }),
    false,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Ministry of Education holds meeting on expanding preschool education access",
      link: "https://akipress.com/news:909565:Ministry_of_Education_holds_meeting_on_expanding_preschool_education_access/",
      source: "AKIpress",
      description: "A ministry meeting about preschool education access.",
    }),
    false,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "MoE releases New Zealand early learning guidance",
      link: "https://education.govt.nz/early-childhood/moe-releases-early-learning-guidance/",
      source: "Ministry of Education",
      description: "Guidance for early learning services.",
    }),
    true,
  );
  assert.equal(
    isNzOrAustraliaRelatedItem({
      title: "Education Review Office early childhood report",
      link: "https://www.ero.govt.nz/reports/early-childhood-report/",
      source: "Education Review Office",
      description: "Report for early childhood services.",
    }),
    true,
  );
});

test("landing intelligence assessment rejects non-news and non-NZ/AU ECE items before ranking", () => {
  assert.deepEqual(
    assessNewsCandidate(
      {
        title: "Saplings Early Learning Taupo Ltd",
        link: "https://www.ero.govt.nz/institution/48421/saplings-early-learning-taupo-ltd",
        source: "Education Review Office",
        publishedAt: "2026-07-30T00:00:00.000Z",
        description: "Early learning service profile.",
      },
      NOW,
      MAX_AGE,
    ).reasons,
    ["not-news-article"],
  );
  assert.deepEqual(
    assessNewsCandidate(
      {
        title: "Ministry of Education holds meeting on expanding preschool education access",
        link: "https://akipress.com/news:909565:Ministry_of_Education_holds_meeting_on_expanding_preschool_education_access/",
        source: "AKIpress",
        publishedAt: "2026-07-30T00:00:00.000Z",
        description: "A ministry meeting about preschool education access.",
      },
      NOW,
      MAX_AGE,
    ).reasons,
    ["not-nz-au"],
  );
});

test("landing intelligence assessment boosts Bay of Plenty and owned-centre ECE news", () => {
  const national = assessNewsCandidate(
    {
      title: "New Zealand early childhood education funding update",
      link: "https://www.rnz.co.nz/news/education/123/new-zealand-early-childhood-education-funding-update",
      source: "RNZ Education",
      publishedAt: "2026-07-30T00:00:00.000Z",
      description: "A national early childhood education funding update.",
    },
    NOW,
    MAX_AGE,
  );
  const local = assessNewsCandidate(
    {
      title: "Te Puna kindergarten opens community-built garden in Bay of Plenty",
      link: "https://www.sunlive.co.nz/news/383000-te-puna-kindergarten-opens-community-built-garden.html",
      source: "SunLive",
      publishedAt: "2026-07-30T00:00:00.000Z",
      description: "A Bay of Plenty kindergarten story.",
    },
    NOW,
    MAX_AGE,
    [{ name: "Te Puna Kindergarten", normalizedName: "te puna" }],
  );

  assert.equal(national.accepted, true);
  assert.equal(local.accepted, true);
  assert.ok(local.score > national.score);
  assert.ok(local.reasons.includes("bay-of-plenty"));
  assert.ok(local.reasons.includes("owned-centre"));
});

test("cached news items are re-checked for recency at display time", () => {
  const decadeOld = {
    id: "news-0",
    kind: "news" as const,
    title: "Teaching in New Zealand - Pathways to New Zealand",
    brief: "An archived sector explainer.",
    href: "https://www.example.co.nz/news/teaching-in-new-zealand",
    source: "Pathways to New Zealand",
    publishedAt: "2009-05-14T00:00:00.000Z",
    urgent: false,
  };

  assert.equal(isFreshFeedItem(decadeOld, NOW), false);
  assert.equal(isFreshFeedItem({ ...decadeOld, publishedAt: "2023-10-24T04:59:04.000Z" }, NOW), false);
  assert.equal(isFreshFeedItem({ ...decadeOld, publishedAt: null }, NOW), false);
  assert.equal(isFreshFeedItem({ ...decadeOld, publishedAt: "not a date" }, NOW), false);
  assert.equal(isFreshFeedItem({ ...decadeOld, publishedAt: "2026-07-30T00:00:00.000Z" }, NOW), true);
});

test("non-news feed items are exempt from the recency gate", () => {
  const weather = {
    id: "weather-forecast-Bay of Plenty",
    kind: "weather" as const,
    title: "Bay of Plenty: weather watch",
    brief: "Heavy showers forecast.",
    href: "https://www.metservice.com/warnings/home",
    source: "Open-Meteo forecast",
    publishedAt: null,
    urgent: true,
  };

  assert.equal(isFreshFeedItem(weather, NOW), true);
});

test("rnz listing survives an unparseable date without throwing", () => {
  const html =
    '<h3 class="o-digest__headline"><a href="/news/national/1234/ece-funding-review">ECE funding review</a></h3>' +
    '<span class="o-kicker__time kicker-item">not a real date</span>';

  const items = parseRnzListing(html);

  assert.equal(items.length, 1);
  assert.equal(items[0].publishedAt, null);
});
