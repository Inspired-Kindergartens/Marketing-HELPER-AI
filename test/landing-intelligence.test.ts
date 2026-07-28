import assert from "node:assert/strict";
import test from "node:test";

import {
  BRAND_QUERIES,
  NEWS_QUERY_TIERS,
  SECTOR_WATCH_QUERIES,
  SOURCE_SPECIFIC_NEWS_QUERIES,
  parseNzHeraldEducationListing,
  parseRnzListing,
} from "../src/landing-intelligence.js";

test("landing intelligence queries cover NZ and international ECE news terms", () => {
  const combinedNewsQueries = [...SOURCE_SPECIFIC_NEWS_QUERIES, ...NEWS_QUERY_TIERS].join(" ");

  assert.match(combinedNewsQueries, /early childhood/);
  assert.match(combinedNewsQueries, /early childhood education/);
  assert.match(combinedNewsQueries, /\bECE\b/);
  assert.match(combinedNewsQueries, /kindergarten/);
  assert.match(combinedNewsQueries, /New Zealand/);
  assert.match(combinedNewsQueries, /international/);
  assert.match(combinedNewsQueries, /Australia/);
  assert.match(combinedNewsQueries, /United Kingdom/);
  assert.match(combinedNewsQueries, /United States/);
});

test("landing intelligence runs source-specific Herald and RNZ ECE searches", () => {
  const combinedSourceQueries = SOURCE_SPECIFIC_NEWS_QUERIES.join(" ");

  assert.match(combinedSourceQueries, /NZ Herald/);
  assert.match(combinedSourceQueries, /site:nzherald\.co\.nz/);
  assert.match(combinedSourceQueries, /RNZ/);
  assert.match(combinedSourceQueries, /site:rnz\.co\.nz/);
});

test("landing intelligence watch queries include required kindergarten organisations", () => {
  const watchedQueries = [...BRAND_QUERIES, ...SECTOR_WATCH_QUERIES].map((item) => item.query).join(" ");

  assert.match(watchedQueries, /"Inspired Kindergartens"/);
  assert.match(watchedQueries, /"Tauranga Regional Free Kindergarten Association"/);
  assert.match(watchedQueries, /"Kindergartens Aotearoa"/);
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
