import assert from "node:assert/strict";
import test from "node:test";

import { decodeCsvBytes, parseCsv, readSectorCsv } from "../src/sector/csv.js";
import { findBestNameMatch, namesLooselyMatch, namesMatch } from "../src/sector/names.js";
import { categorisePromotion, findMatchingPromotion, isSupportedByPage, promotionSimilarity } from "../src/sector/promotions.js";
import { buildPageExcerpt, centreWindows, embeddedPayloadRecords, pickFollowLinks, unflattenDevalue } from "../src/sector/page-text.js";
import { isIncentive, readExtraction } from "../src/sector/extract.js";
import { operatorPrefixes, parseRobots, robotsRuleMatches } from "../src/sector/sync.js";
import { readDirectoryRecord, websiteFromEmail } from "../src/sector/ece-directory.js";
import { applySectorFilters, buildSectorVocabulary, parseSectorQuestion, summariseSector } from "../src/sector/query.js";
import { planSectorAnswer, sectorQuestionText } from "../src/ai/sector-context.js";
import type { SectorCentreView } from "../src/storage/sector-store.js";
import { renderSectorAppShell } from "../src/ui/sector-app-shell.js";
import { renderLandingPage } from "../src/ui/landing-page.js";

// --- CSV ------------------------------------------------------------------------

test("reads the BOP competitor CSV: quoted fields, Windows-1252, unverified operators, split promotions", () => {
  const csv = [
    "Centre,Operator / service group,Promotion category,Meals,Transport,City,Suburb,Operator source URL,Promotion source URL",
    'Agape Christian Preschool,Agape Christian Preschool,30 hours free for 3–4 year olds; first 15 hours free for under-3s,,,Rotorua,,https://a.example/,https://a.example/promo',
    'The Orchard Child Care & Preschool,The Orchard Childcare Limited,,"Yes - morning tea, lunch & afternoon tea (official site)",,Rotorua,,https://orchard.example/,',
    "Learning Adventures Katikati,Evolve,,Lunch Box,Yes,Katikati,,,",
    "Robins Nest,Unverified,,,,Katikati,,,",
    ",,,,,,,,",
  ].join("\r\n");
  const bytes = new Uint8Array([...Buffer.from(csv.replace("–", "\u0096"), "latin1")]);
  const rows = readSectorCsv(decodeCsvBytes(bytes));

  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0].promotions, ["30 hours free for 3–4 year olds", "first 15 hours free for under-3s"]);
  assert.equal(rows[1].meals, "Yes - morning tea, lunch & afternoon tea (official site)");
  assert.equal(rows[1].providesMeals, true);
  assert.equal(rows[2].providesMeals, null, "a lunch box is brought by families, so meals stay unknown");
  assert.equal(rows[2].providesTransport, true);
  assert.equal(rows[3].operator, "");
  assert.equal(rows[3].verified, false);
});

test("parseCsv keeps doubled quotes and embedded newlines", () => {
  assert.deepEqual(parseCsv('a,"b ""c""\nd",e\n1,2,3'), [["a", 'b "c"\nd', "e"], ["1", "2", "3"]]);
});

// --- Names ------------------------------------------------------------------------

test("names match across macrons, the CSV's ? placeholders, punctuation and company suffixes", () => {
  assert.ok(namesMatch("Central Kids Kindergartens - ?p?tiki", "Central Kids Kindergartens - Ōpōtiki"));
  assert.ok(namesMatch("Busy Bees Ngongotah?", "Busy Bees Ngongotahā"));
  assert.ok(namesMatch("New Shoots Childrens Centre (Papamoa)", "New Shoots Children's Centre - Papamoa"));
  assert.ok(namesMatch("Maungatapu Preschool 2025 Ltd", "Maungatapu Preschool"));
  assert.ok(!namesMatch("Busy Bees Katikati", "Busy Bees Katikati North"));
  assert.ok(namesLooselyMatch("Busy Bees McGarvey Road", "Busy Bees McGarvey Road 1"));
  assert.ok(!namesLooselyMatch("Little Pipi Early Childhood Centre", "Little Learners on Nineteenth"));
});

test("an ambiguous name is settled by town, and an ambiguous loose match is refused", () => {
  const services = [
    { name: "Seedlings Preschool", towns: ["Edgecumbe"] },
    { name: "Seedlings Preschool", towns: ["Tauranga"] },
    { name: "Busy Bees McGarvey Road 1", towns: ["Whakatane"] },
    { name: "Busy Bees McGarvey Road 2", towns: ["Whakatane"] },
  ];
  assert.equal(findBestNameMatch("Seedlings Preschool", "Tauranga", services, (service) => service), services[1]);
  assert.equal(findBestNameMatch("Busy Bees McGarvey Road", "Whakatane", services, (service) => service), null);
});

// --- Promotions ---------------------------------------------------------------------

test("promotions are categorised by the kind of offer", () => {
  assert.equal(categorisePromotion("50% off for 4 months"), "discount");
  assert.equal(categorisePromotion("Join us today and get 30 days free childcare, plus up to 50% off fees"), "free_period");
  assert.equal(categorisePromotion("1 month free childcare for new enrolments"), "free_period");
  assert.equal(categorisePromotion("30 Free ECE Hours for ages 3-5 (20 Ministry-funded + 10 extra)"), "free_hours");
  assert.equal(categorisePromotion("20 Hours Free for 2 year olds"), "free_hours");
  assert.equal(categorisePromotion("$6 days - under 2s: 6 hours for $1/hour"), "discount");
  assert.equal(categorisePromotion("Enrol and get a free gift"), "gift");
});

test("the same offer reworded still matches, but different numbers never do", () => {
  assert.ok(promotionSimilarity("50% off for 4 months", "Ask about 50% off fees for the first 4 months") >= 0.5);
  assert.equal(promotionSimilarity("50% off for 4 months", "50% off for 6 months"), 0);
  const existing = [{ id: 1, text: "50% off for 4 months" }, { id: 2, text: "20 Hours Free for 2 year olds" }];
  assert.equal(findMatchingPromotion("50% off fees for 4 months", existing)?.id, 1);
  assert.equal(findMatchingPromotion("6 Months Fees Free", existing), null);
});

test("an extracted offer must be on the page: invented numbers or wording are rejected", () => {
  const page = "Ask about 50% off fees for the first 4 months for all ages at participating centres.";
  assert.ok(isSupportedByPage("50% off fees for 4 months", page));
  assert.ok(!isSupportedByPage("50% off fees for 6 months", page));
  assert.ok(!isSupportedByPage("Free uniform and nappies for every child", page));
});

// --- Page text ----------------------------------------------------------------------

test("decodes a Nuxt devalue payload and keeps only offers for our centres", () => {
  // [root, offers[], offer1, title1, desc1, status1, centres1, c1, name1, c2, name2, c3, name3, offer2 …]
  const flat: unknown[] = [
    { offers: 1 },
    [2, 13],
    { title: 3, description: 4, status: 5, centre: 6 },
    "50% off for 4 months",
    "Ask about 50% off fees for the first 4 months at participating centres.",
    "published",
    [7, 9, 11],
    { centre_id: 8 },
    { center_name: 17 },
    { centre_id: 10 },
    { center_name: 18 },
    { centre_id: 12 },
    { center_name: 19 },
    { title: 14, description: 15, status: 16 },
    "Winter: 30 Hours Free",
    "Ask about 30 hours free for over 3s during winter.",
    "archived",
    "BestStart Albany",
    "BestStart Greerton",
    "BestStart Apirana Avenue",
  ];
  const html = `<html><script type="application/json" id="__NUXT_DATA__" data-ssr="true">${JSON.stringify(flat)}</script></html>`;
  const records = embeddedPayloadRecords(html);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].relatedNames, ["BestStart Albany", "BestStart Greerton", "BestStart Apirana Avenue"]);

  const excerpt = buildPageExcerpt({ text: "", records, centreNames: ["BestStart Greerton", "BestStart Bayfair"] }, 4000);
  assert.match(excerpt, /OFFER: 50% off for 4 months/);
  assert.match(excerpt, /Participating centres \(of yours\): BestStart Greerton$/m);
  assert.doesNotMatch(excerpt, /Winter/, "an archived offer is not current");

  const elsewhere = buildPageExcerpt({ text: "", records, centreNames: ["BestStart Bayfair"] }, 4000);
  assert.doesNotMatch(elsewhere, /50% off/, "an offer none of our centres takes part in is dropped");
  assert.equal(unflattenDevalue([["Reactive", 1], { a: 2 }, "x"]) instanceof Object, true);
});

test("a group's centre list keeps each centre's own line, and repeated lines appear once", () => {
  const text = ["Busy Bees Ashburton", "Meals provided", "Busy Bees Katikati", "Meals provided", "Busy Bees Douglas Street", "Busy Bees Dargaville", "Meals provided"].join("\n");
  const excerpt = buildPageExcerpt({ text, records: [], centreNames: ["Busy Bees Katikati", "Busy Bees Douglas Street"] }, 4000);
  assert.match(excerpt, /Busy Bees Katikati \/ Meals provided/);
  assert.match(excerpt, /^Busy Bees Douglas Street$/m, "the next centre's line is not pulled in");
  assert.doesNotMatch(excerpt, /Ashburton|Dargaville/);
});

test("follows same-site links about offers and fees, never files or other sites", () => {
  const html = `
    <a href="/promotions">Special offers</a>
    <a href="/about-us">About</a>
    <a href="/fees-and-funding">Fees</a>
    <a href="/menu.pdf">Our menu</a>
    <a href="https://facebook.com/x/offers">Offers</a>`;
  assert.deepEqual(pickFollowLinks(html, "https://centre.example/", 3), ["https://centre.example/promotions", "https://centre.example/fees-and-funding"]);
});

test("a group's shared name opening files its other centres, but common words never do", () => {
  const prefixes = operatorPrefixes([
    { name: "BestStart Greerton", operator: "BestStart Educare" },
    { name: "BestStart Bayfair", operator: "BestStart Educare" },
    { name: "Little Pipi Early Childhood Centre", operator: "Little Pipi" },
    { name: "Little Pipi Welcome Bay", operator: "Little Pipi" },
    { name: "Little Learners on Nineteenth", operator: "Little Learners" },
    { name: "Little Learners Papamoa", operator: "Little Learners" },
    { name: "Arataki Free Kindergarten", operator: "Inspired Kindergartens" },
    { name: "Avenues Kindergarten", operator: "Inspired Kindergartens" },
  ]);
  assert.deepEqual(prefixes, [["little learners", "Little Learners"], ["little pipi", "Little Pipi"], ["beststart", "BestStart Educare"]]);
  const lonely = operatorPrefixes([{ name: "Kidz World - Brent Road", operator: "Kidz" }, { name: "Kidz Rock", operator: "Kidz" }]);
  assert.deepEqual(lonely, [], "'kidz' alone is too common to identify a group");
});

test("robots.txt rules for every crawler are honoured", () => {
  const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /wp-admin/\nDisallow: /private\n";
  assert.deepEqual(parseRobots(robots), ["/wp-admin/", "/private"]);
});

test("robots wildcards block only what they describe (Squarespace's /*?author=* is not the whole site)", () => {
  assert.ok(!robotsRuleMatches("/*?author=*", "/"));
  assert.ok(!robotsRuleMatches("/*?author=*", "/enrolments"));
  assert.ok(robotsRuleMatches("/*?author=*", "/blog?author=sam"));
  assert.ok(robotsRuleMatches("/account$", "/account"));
  assert.ok(!robotsRuleMatches("/account$", "/accounts"));
  assert.ok(robotsRuleMatches("/private", "/private/fees"));
  assert.ok(robotsRuleMatches("/", "/anything"));
});

// --- Extraction --------------------------------------------------------------------

test("the model's reading is checked: unsupported offers dropped, ALL means every centre, plain 20 Hours ECE ignored", () => {
  const page = "New families: 1 month free childcare for new enrolments. 20 Hours ECE. All meals provided by our cook.";
  const findings = readExtraction(
    {
      promotions: [
        { text: "1 month free childcare for new enrolments", appliesTo: ["ALL"], current: true },
        { text: "3 months free childcare", appliesTo: ["ALL"], current: true },
        { text: "20 Hours ECE", appliesTo: ["ALL"], current: true },
        { text: "Old winter deal", appliesTo: ["ALL"], current: false },
      ],
      meals: { mentioned: true, provided: true, detail: "All meals provided by our cook", appliesTo: ["The Village"] },
      transport: { mentioned: true, provided: true, detail: "Van", appliesTo: ["Kiddie Corner"] },
    },
    ["The Village Preschool & Childcare Centre", "Other Centre"],
    page,
  );
  assert.deepEqual(findings.promotions, [{ text: "1 month free childcare for new enrolments", centres: ["The Village Preschool & Childcare Centre", "Other Centre"] }]);
  assert.deepEqual(findings.meals?.centres, ["The Village Preschool & Childcare Centre"], "a shortened name still finds its centre");
  assert.equal(findings.transport, null, "transport is not on the page, and the name matches no centre");
});

test("on a group's centre list, meals and transport come from each centre's own badges, not the model's 'ALL'", () => {
  const text = [
    "Busy Bees Katikati", "20 Hours ECE", "Storypark", "Meals provided",
    "Busy Bees Mangakakahi", "Transport", "Storypark", "Meals provided",
    "Busy Bees Douglas Street", "20 Hours ECE", "Storypark", "41 Douglas St, Whakatane 3120",
  ].join("\n");
  const names = ["Busy Bees Katikati", "Busy Bees Mangakakahi", "Busy Bees Douglas Street"];
  const findings = readExtraction(
    {
      promotions: [],
      meals: { mentioned: true, provided: true, detail: "Meals provided", appliesTo: ["ALL"] },
      transport: { mentioned: true, provided: false, detail: "Transport", appliesTo: ["Busy Bees Mangakakahi"] },
    },
    names,
    text,
    centreWindows(text, names),
  );
  assert.deepEqual(findings.meals?.centres, ["Busy Bees Katikati", "Busy Bees Mangakakahi"]);
  assert.equal(findings.transport?.provided, true, "a bare Transport badge means it is provided");

  const hedged = readExtraction(
    { promotions: [], meals: { mentioned: true, provided: false, detail: "some centres provide meals", appliesTo: ["ALL"] }, transport: {} },
    ["BestStart Greerton"],
    "In centres providing meals, cooks prepare healthy food.",
  );
  assert.equal(hedged.meals, null);

  const unfounded = readExtraction(
    { promotions: [], meals: { mentioned: true, provided: false, detail: "cooks prepare healthy, nutritious dishes", appliesTo: ["ALL"] }, transport: {} },
    ["BestStart Bay Kindy"],
    "Our cooks prepare healthy, nutritious dishes.",
  );
  assert.equal(unfounded.meals, null, "'no meals' needs the page to say families bring lunch");
  const lunchBox = readExtraction(
    { promotions: [], meals: { mentioned: true, provided: false, detail: "Please bring a packed lunch box", appliesTo: ["ALL"] }, transport: {} },
    ["Kiddo Centre"],
    "Please bring a packed lunch box each day.",
  );
  assert.equal(lunchBox.meals?.provided, false);
});

test("only real incentives count as promotions", () => {
  for (const offer of ["50% off First 2 Months of Enrollment", "6 MONTHS FREE for the first 20 enrolments", "10% sibling discount for eldest enrolled child",
    "20 Hours Free for 2 year olds", "30 Free Hours for 3-5 Year Olds", "Up to $5070 of childcare free", "Enrol and get a free gift"]) {
    assert.ok(isIncentive(offer), offer);
  }
  for (const notOffer of ["Enrol your child today", "20 Hours ECE available", "20 Hours ECE", "We offer 20 free hours for 3-5 year olds", "Book a visit"]) {
    assert.ok(!isIncentive(notOffer), notOffer);
  }
});

// --- Directory -----------------------------------------------------------------------

test("reads a Ministry directory record and guesses a website only from a non-generic email domain", () => {
  const service = readDirectoryRecord({
    ECE_Id: 40044, Org_Name: "Nature's Cove", Org_Type: "Education & Care Service", Authority: "Privately owned",
    Add1_City: "Tauranga", Add1_Suburb: "Tauranga South", Territorial_Authority: "Tauranga City", All_Children: 45, Under_2s: "11",
    Total: 44, Roll_Date: "2025-07-01T00:00:00", "20_Hrs_ECE": "Yes", Email: "NaturesCove@outlook.co.nz",
  });
  assert.equal(service?.eceId, 40044);
  assert.equal(service?.under2Places, 11);
  assert.equal(service?.twentyHoursEce, true);
  assert.equal(websiteFromEmail(service!.email), "");
  assert.equal(websiteFromEmail("info@futurefocus.co.nz"), "https://futurefocus.co.nz/");
  assert.equal(websiteFromEmail("deborah@bopdhb.govt.nz"), "");
  assert.equal(websiteFromEmail("k05c035@kohanga.ac.nz"), "");
});

// --- Questions -------------------------------------------------------------------------

function centre(overrides: Partial<SectorCentreView>): SectorCentreView {
  return {
    id: 1, eceId: 1, name: "Centre", operator: "", serviceType: "Education & Care Service", authority: "Privately owned",
    isOwn: false, address: "", suburb: "", city: "Tauranga", district: "Tauranga City", latitude: null, longitude: null,
    phone: "", email: "", website: "", promotionUrl: "", licensedPlaces: 50, under2Places: 10, roll: null, rollDate: null,
    twentyHoursEce: true, meals: "", providesMeals: null, transport: "", providesTransport: null, verified: true,
    inDirectory: true, notes: "", lastCrawledAt: null, updatedAt: "2026-10-22T00:00:00.000Z", promotions: [], pastPromotions: [],
    ...overrides,
  };
}

const PROMO = (text: string, category: string) => ({
  id: 1, text, category, sourceUrl: "", origin: "crawl", active: true,
  firstSeenAt: "2026-10-02T00:00:00.000Z", lastSeenAt: "2026-10-22T00:00:00.000Z", endedAt: null,
});

const CENTRES: SectorCentreView[] = [
  centre({ id: 1, name: "BestStart Greerton", operator: "BestStart Educare", suburb: "Greerton", promotions: [PROMO("50% off for 4 months", "discount")] }),
  centre({ id: 2, name: "Busy Bees Mangakakahi", operator: "Busy Bees", city: "Rotorua", district: "Rotorua District", providesMeals: true, meals: "Yes", providesTransport: true }),
  centre({ id: 3, name: "Future Focus - West Dune", operator: "Future Focus", city: "Papamoa", suburb: "Papamoa", providesMeals: true, meals: "Fresh seasonal meals" }),
  centre({ id: 4, name: "Arataki Free Kindergarten", operator: "Inspired Kindergartens", serviceType: "Free Kindergarten", isOwn: true, providesMeals: true }),
  centre({ id: 5, name: "Central Kids Kindergartens - Selwyn", operator: "Central Kids", serviceType: "Free Kindergarten", city: "Rotorua", district: "Rotorua District", under2Places: 0 }),
  centre({ id: 6, name: "PORSE Bay of Plenty", operator: "", serviceType: "Homebased Network", city: "Rotorua", district: "Rotorua District" }),
  centre({ id: 7, name: "Closed Kids", providesMeals: true, inDirectory: false }),
];
const VOCABULARY = buildSectorVocabulary(CENTRES);

function ask(question: string) {
  const parsed = parseSectorQuestion(question, VOCABULARY);
  return { parsed, names: applySectorFilters(CENTRES, parsed).map((row) => row.name) };
}

test("'show me the list of centres that provide meals' lists exactly the competitors with meals", () => {
  const { parsed, names } = ask("Show me the list of centres that provide meals");
  assert.equal(parsed.filters.meals, true);
  assert.equal(parsed.filters.promotion, null, "'provide' is not an offer");
  assert.deepEqual(names, ["Busy Bees Mangakakahi", "Future Focus - West Dune"], "own and closed centres are left out");
  assert.match(parsed.description.join(" · "), /provide meals · competitors only/);
});

test("places cover a whole district, operators are found by short name, and offer as a verb is not a promotion", () => {
  assert.deepEqual(ask("Which centres in Tauranga provide meals?").names, ["Future Focus - West Dune"]);
  assert.deepEqual(ask("Which BestStart centres are running a promotion?").names, ["BestStart Greerton"]);
  assert.deepEqual(ask("Which centres offer transport?").names, ["Busy Bees Mangakakahi"]);
  assert.deepEqual(ask("Any discounts in Greerton?").names, ["BestStart Greerton"]);
  assert.equal(ask("Which centres offer transport?").parsed.filters.promotion, null);
});

test("a group name shared by several brands selects all of them", () => {
  const brands = [
    centre({ id: 11, name: "Learning Adventures Katikati", operator: "Evolve Education Group – Learning Adventures" }),
    centre({ id: 12, name: "Little Lights Kindy", operator: "Evolve Education Group – Little Lights" }),
    centre({ id: 13, name: "Lollipops Tauranga", operator: "Evolve Education Group – Lollipops" }),
    centre({ id: 14, name: "BestStart Bayfair", operator: "BestStart Educare" }),
  ];
  const question = parseSectorQuestion("Which Evolve centres are there?", buildSectorVocabulary(brands));
  assert.deepEqual(applySectorFilters(brands, question).map((row) => row.name), ["Learning Adventures Katikati", "Little Lights Kindy", "Lollipops Tauranga"]);
  const one = parseSectorQuestion("Lollipops centres", buildSectorVocabulary(brands));
  assert.deepEqual(one.filters.operators, ["Evolve Education Group – Lollipops"]);
});

test("service types: free kindergartens are a type not an offer; home-based; childcare", () => {
  const kindergartens = ask("List the free kindergartens in Rotorua");
  assert.deepEqual(kindergartens.names, ["Central Kids Kindergartens - Selwyn"]);
  assert.equal(kindergartens.parsed.filters.promotion, null);
  assert.deepEqual(ask("How many home-based services are in Rotorua?").names, ["PORSE Bay of Plenty"]);
  assert.equal(ask("How many home-based services are in Rotorua?").parsed.intent, "count");
  assert.deepEqual(ask("childcare centres without meals").names, ["BestStart Greerton"]);
});

test("our own centres only when asked, and a named centre is found whoever runs it", () => {
  assert.deepEqual(ask("Which of Inspired's centres provide meals?").names, ["Arataki Free Kindergarten"]);
  assert.deepEqual(ask("Tell me about Arataki Free Kindergarten").names, ["Arataki Free Kindergarten"]);
  assert.equal(ask("What's happening in the sector?").parsed.narrowed, false);
});

test("a follow-up narrows the previous question, and an open centre answers 'it' questions", () => {
  assert.equal(sectorQuestionText("which of those are in Rotorua?", [{ role: "user", content: "centres that provide meals" }]), "centres that provide meals which of those are in Rotorua?");
  const followUp = planSectorAnswer(CENTRES, "which of those are in Rotorua?", [{ role: "user", content: "centres that provide meals" }], null);
  assert.deepEqual(followUp.matches.map((row) => row.name), ["Busy Bees Mangakakahi"]);

  const open = planSectorAnswer(CENTRES, "Does it have any promotions?", [], 1);
  assert.deepEqual(open.matches.map((row) => row.name), ["BestStart Greerton"]);
  const notScoped = planSectorAnswer(CENTRES, "Which centres provide meals?", [], 1);
  assert.equal(notScoped.matches.length, 2, "a list question on a centre page is still about every centre");
});

test("the sector overview counts competitors only", () => {
  const overview = summariseSector(CENTRES);
  assert.equal(overview.competitorCount, 5);
  assert.equal(overview.providingMeals, 2);
  assert.equal(overview.closedCount, 1);
  assert.deepEqual(overview.activePromotions, [{ text: "50% off for 4 months", centres: 1, by: "BestStart Educare" }]);
});

// --- Page -------------------------------------------------------------------------------

test("Sector Insight page: competitors only, promotion filter on by default, chat, rail entry", () => {
  const html = renderSectorAppShell({
    centres: CENTRES,
    runs: [],
    lastCompletedAt: "2026-10-22T01:00:00.000Z",
    progress: { running: false, runId: null, phase: "", done: 0, total: 0 },
  });
  assert.match(html, /<title>Marketing Helper - Sector Insight<\/title>/);
  assert.match(html, /data-ai-chat-endpoint="\/api\/sector\/ai\/chat\/stream"/);
  assert.match(html, /nav-rail__item--current" href="\/sector"/);
  assert.match(html, /data-sector-filters/);
  assert.doesNotMatch(html, /Arataki Free Kindergarten|Closed Kids/, "own and closed centres are not listed");
  assert.match(html, /<option value="1" selected>Running one<\/option>/);
  assert.doesNotMatch(html, /Also show/);
  assert.match(html, /Updated 22 Oct 2026/);
  assert.match(html, /50% off for 4 months/);
  assert.match(html, /href="\/api\/sector\/export\.csv"/);
});

test("the centre view shows the editor and scopes the chat to that centre", () => {
  const html = renderSectorAppShell({
    centres: [],
    runs: [],
    lastCompletedAt: null,
    progress: { running: false, runId: null, phase: "", done: 0, total: 0 },
    openCentre: CENTRES[0],
  });
  assert.match(html, /data-sector-centre-id="1"/);
  assert.match(html, /data-sector-open-id="1"/);
  assert.match(html, /data-sector-promotion-end="1"/);
  assert.match(html, /href="\/sector"><i class="bi bi-arrow-left/);
});

test("landing page has a Sector Insight button right after Links", () => {
  const html = renderLandingPage();
  const links = html.indexOf('href="/subscriptions"');
  const sector = html.indexOf('href="/sector"');
  assert.ok(links > -1 && sector > links);
  assert.match(html.slice(links, sector + 200), /Links[\s\S]*Sector Insight/);
});
