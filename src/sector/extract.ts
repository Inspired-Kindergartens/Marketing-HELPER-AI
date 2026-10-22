import type { AiChatMessage } from "../ai/client.js";
import { namesLooselyMatch, namesMatch } from "./names.js";
import { isSupportedByPage } from "./promotions.js";

// The local model reads a page excerpt and returns the offers, meals and
// transport it states, as JSON constrained by EXTRACTION_SCHEMA. Everything it
// returns is checked against the page before it is stored: an offer whose
// numbers or wording are not on the page is dropped.

// Fits the 4,096-token window with the prompt and the reply.
export const EXCERPT_MAX_CHARS = 7000;

const APPLIES_TO = { type: "array", items: { type: "string" } };
const FEATURE = {
  type: "object",
  properties: {
    mentioned: { type: "boolean" },
    provided: { type: "boolean" },
    detail: { type: "string" },
    appliesTo: APPLIES_TO,
  },
  required: ["mentioned", "provided", "detail", "appliesTo"],
};

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    promotions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          appliesTo: APPLIES_TO,
          current: { type: "boolean" },
        },
        required: ["text", "appliesTo", "current"],
      },
    },
    meals: FEATURE,
    transport: FEATURE,
  },
  required: ["promotions", "meals", "transport"],
};

export function buildExtractionMessages(excerpt: string, centreNames: string[], today: string): AiChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You read excerpts of a New Zealand early childhood centre group's website and pull out facts for a competitor database. Reply with JSON only.",
        `Today is ${today}.`,
        "promotions: offers made to win new enrolments: fee discounts, free days/weeks/months, extra free hours beyond the government's standard 20 Hours ECE, free gifts, waived fees, cheap-day deals.",
        "- Do not include the standard government 20 Hours ECE on its own, general descriptions, philosophy, job adverts, fundraising or events.",
        "- text: the offer in the page's own words, as short as possible (at most 10 words), e.g. \"50% off fees for 4 months\". Never invent or change a number.",
        "- current: false when the page shows the offer has ended or its dates are before today; otherwise true.",
        "- appliesTo: centre names copied exactly from the list you are given. Use [\"ALL\"] when the page presents the offer for the whole group or every listed centre without restricting it. Lines starting OFFER: name the participating centres when an offer is restricted.",
        "meals: mentioned=true only when the page plainly says that a listed centre, or every centre of the group, supplies food (or that families bring lunch). provided=true for meals/lunch provided, a cook, catered food; false when families must bring lunch. detail: a few words from the page.",
        "- Hedged statements such as \"in centres providing meals\", \"some centres\" or \"selected centres\" do not say which centres, so they mean mentioned=false. Offers are never evidence about meals.",
        "transport: the same rules for the centre transporting children (van, bus, pick-up and drop-off).",
        "A statement in a list of centres applies only to the centre named next to it. If nothing applies, return an empty promotions array and mentioned=false.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Centres this page is being read for:\n${centreNames.map((name) => `- ${name}`).join("\n")}\n\nPage excerpt:\n${excerpt}`,
    },
  ];
}

export type FeatureFinding = { provided: boolean; detail: string; centres: string[] };

export type SiteFindings = {
  promotions: Array<{ text: string; centres: string[] }>;
  meals: FeatureFinding | null;
  transport: FeatureFinding | null;
};

function readString(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// The model's appliesTo names, mapped back to the exact names it was given.
function resolveCentres(value: unknown, centreNames: string[]): string[] {
  const names = Array.isArray(value) ? value.map((item) => readString(item, 200)).filter(Boolean) : [];
  if (centreNames.length === 1) return centreNames;
  if (names.length === 0 || names.some((name) => /^all$/i.test(name))) return centreNames;
  return centreNames.filter((centre) => names.some((name) => namesMatch(name, centre) || namesLooselyMatch(name, centre)));
}

const MEALS_WORDS = /\b(meals?|food|lunch|morning tea|afternoon tea|breakfast|cook|chef|catered|kai|menu)\b/i;
const TRANSPORT_WORDS = /\b(transport|van|bus|pick[- ]?up|drop[- ]?off|shuttle)\b/i;

// "Some centres provide meals" says nothing about any one centre.
const HEDGED = /\b(some|selected?|certain|participating|most|may|might)\b/i;
const NEGATED = /\b(no|not|bring|byo|own lunch|lunch ?box(es)?)\b/i;

function readFeature(
  value: unknown,
  centreNames: string[],
  pageText: string,
  words: RegExp,
  windows: ReadonlyMap<string, string>,
): FeatureFinding | null {
  if (!value || typeof value !== "object") return null;
  const feature = value as Record<string, unknown>;
  if (feature.mentioned !== true || typeof feature.provided !== "boolean") return null;
  const detail = readString(feature.detail, 160);
  if (HEDGED.test(detail)) return null;
  // The page must actually talk about it.
  if (!words.test(pageText)) return null;
  let centres = resolveCentres(feature.appliesTo, centreNames);
  let provided = feature.provided;
  if (windows.size > 0) {
    // On a list of centres, only a centre whose own lines mention it, and its
    // badge ("Transport", "Meals provided") is the answer unless it says no.
    centres = centres.filter((centre) => words.test(windows.get(centre) ?? ""));
    provided = !centres.some((centre) => NEGATED.test(windows.get(centre) ?? ""));
  } else if (!provided && !NEGATED.test(detail)) {
    // A "no" needs the page to say so ("bring a lunch box"), not just a
    // model's reading of a page about food.
    return null;
  }
  if (centres.length === 0) return null;
  return { provided, detail, centres };
}

const INCENTIVE_WORDS = /\bfree\b|\boff\b|%|\bdiscount|\breduc|\brebate|\bhalf[- ]price|\$\s?\d|\bgift|\bvoucher|\bwaive|\bbonus|\bno (enrolment|registration) fee/i;
// The government's 20 Hours ECE for 3-5 year olds, however it is worded, is
// what every centre offers; more hours, younger children or extra days are not.
const STANDARD_FUNDING = /\b20\s*(free\s*)?hours?\b/i;
const BEYOND_STANDARD = /\b(2[- ]?year|two[- ]?year|under|toddler|infant|extra|additional|plus|\+|[3-9]\d\s*(free\s*)?hours?|\d+\s*(days?|weeks?|months?))\b/i;

// "Enrol your child today" or "20 Hours ECE available" is not an incentive.
export function isIncentive(text: string): boolean {
  if (!INCENTIVE_WORDS.test(text) && !STANDARD_FUNDING.test(text)) return false;
  if (STANDARD_FUNDING.test(text) && !BEYOND_STANDARD.test(text) && !/%|\$|\boff\b|\bdiscount|\bgift/i.test(text)) return false;
  return true;
}

export function readExtraction(
  raw: unknown,
  centreNames: string[],
  pageText: string,
  windows: ReadonlyMap<string, string> = new Map(),
): SiteFindings {
  const result = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const promotions: SiteFindings["promotions"] = [];
  for (const item of Array.isArray(result.promotions) ? result.promotions : []) {
    if (!item || typeof item !== "object") continue;
    const promotion = item as Record<string, unknown>;
    const text = readString(promotion.text, 200);
    if (!text || promotion.current === false) continue;
    if (!isSupportedByPage(text, pageText) || !isIncentive(text)) continue;
    const centres = resolveCentres(promotion.appliesTo, centreNames);
    if (centres.length === 0) continue;
    if (promotions.some((existing) => existing.text.toLowerCase() === text.toLowerCase())) continue;
    promotions.push({ text, centres });
  }
  return {
    promotions,
    meals: readFeature(result.meals, centreNames, pageText, MEALS_WORDS, windows),
    transport: readFeature(result.transport, centreNames, pageText, TRANSPORT_WORDS, windows),
  };
}
