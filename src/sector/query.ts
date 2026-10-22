import { normaliseName, shortDistrictName } from "./names.js";
import { PROMOTION_CATEGORY_LABELS, type PromotionCategory } from "./promotions.js";

// Turns a Sector Insight chat question into exact filters over the centre
// list ("show me the centres that provide meals" → providesMeals = yes), so the
// answer is the real matching rows, not a model's recollection of them. The
// local model only words the reply around those rows. Pure and unit-tested.

export type SectorQueryCentre = {
  id: number;
  eceId: number | null;
  name: string;
  operator: string;
  serviceType: string;
  isOwn: boolean;
  suburb: string;
  city: string;
  district: string;
  licensedPlaces: number | null;
  under2Places: number | null;
  providesMeals: boolean | null;
  meals: string;
  providesTransport: boolean | null;
  transport: string;
  inDirectory: boolean;
  promotions: Array<{ text: string; category: string }>; // active only
};

// Licensed once but gone from the Ministry's directory: closed or relicensed.
// A centre only known from the CSV (no licence number) is not "closed".
export function isClosedCentre(centre: Pick<SectorQueryCentre, "eceId" | "inDirectory">): boolean {
  return centre.eceId != null && !centre.inDirectory;
}

export type SectorFilters = {
  centreIds: number[];
  places: string[];
  operators: string[];
  serviceTypes: string[];
  nameWords: string[];
  meals: boolean | null; // true: provides meals; false: not known to
  transport: boolean | null;
  promotion: boolean | null;
  promotionCategories: PromotionCategory[];
  under2: boolean;
  own: "exclude" | "only" | "include";
};

export type SectorQuestion = {
  filters: SectorFilters;
  intent: "list" | "count";
  sort: "name" | "places-desc" | "places-asc";
  // Plain-language reading of the filters, shown above the results.
  description: string[];
  // False when nothing in the question narrowed the list (an overview question).
  narrowed: boolean;
};

export type SectorVocabulary = {
  places: string[];
  operators: string[];
  centres: Array<{ id: number; name: string }>;
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  "Education & Care Service": "education & care (childcare)",
  "Reo Rua Education and Care": "bilingual education & care",
  "Free Kindergarten": "kindergartens",
  "Homebased Network": "home-based services",
  Playcentre: "playcentres",
  "Te Kōhanga Reo": "kōhanga reo",
  "Puna Reo": "puna reo",
  "Hospital Based": "hospital-based services",
};

const SERVICE_TYPE_RULES: Array<[RegExp, string[]]> = [
  [/\bhome ?based|\bin home\b|\bnann(y|ies)\b|\bhome educators?\b/, ["Homebased Network"]],
  [/\bplay ?centres?\b/, ["Playcentre"]],
  [/\bkohanga\b/, ["Te Kōhanga Reo"]],
  [/\bpuna reo\b/, ["Puna Reo"]],
  [/\bhospital\b/, ["Hospital Based"]],
  [/\bkindergartens?\b|\bkindies\b/, ["Free Kindergarten"]],
  [
    /\b(child ?care|day ?care|creches?|education and care|early learning( centres?)?|elcs?|preschools?|private centres?)\b/,
    ["Education & Care Service", "Reo Rua Education and Care"],
  ],
];

const NAME_WORDS = ["montessori", "steiner", "christian", "catholic"];

// Keys are already normalised ("the" is dropped), so "the Mount" is "mount".
const PLACE_ALIASES: Record<string, string> = {
  "mt maunganui": "Mount Maunganui",
  "mount": "Mount Maunganui",
};

const GENERIC_FIRST_WORDS = new Set(["central", "little", "future", "early", "learning", "kidz", "bright", "first", "happy", "kids"]);

// "Evolve Education Group - Learning Adventures" is asked about as "Evolve",
// "Learning Adventures" or the whole name.
export function operatorAliases(operator: string): string[] {
  const aliases = new Set<string>([normaliseName(operator)]);
  for (const segment of operator.split(/\s+[-–—]\s+/)) {
    const words = normaliseName(segment).split(" ").filter(Boolean);
    if (words.length === 0) continue;
    aliases.add(words.join(" "));
    if (words.length > 2) aliases.add(words.slice(0, 2).join(" "));
    if (words[0].length >= 6 && !GENERIC_FIRST_WORDS.has(words[0])) aliases.add(words[0]);
  }
  return [...aliases].filter((alias) => alias.length >= 4);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${haystack} `.includes(` ${phrase} `);
}

function removePhrase(haystack: string, phrase: string): string {
  return ` ${haystack} `.replace(` ${phrase} `, " ").replace(/\s+/g, " ").trim();
}

export function parseSectorQuestion(question: string, vocabulary: SectorVocabulary): SectorQuestion {
  let text = normaliseName(question.replace(/%/g, " percent ")).replace(/\?/g, " ").trim();
  const description: string[] = [];
  const filters: SectorFilters = {
    centreIds: [],
    places: [],
    operators: [],
    serviceTypes: [],
    nameWords: [],
    meals: null,
    transport: null,
    promotion: null,
    promotionCategories: [],
    under2: false,
    own: "exclude",
  };

  // Specific centres first (longest name first), so "BestStart Greerton" is
  // that centre rather than every BestStart in Greerton.
  for (const centre of [...vocabulary.centres].sort((a, b) => b.name.length - a.name.length)) {
    const name = normaliseName(centre.name);
    if (name.length >= 8 && containsPhrase(text, name)) {
      filters.centreIds.push(centre.id);
      text = removePhrase(text, name);
    }
  }

  // Operators, by any of their aliases. One alias can name several brands of
  // a group ("Evolve": Learning Adventures, Little Lights, Lollipops).
  const byAlias = new Map<string, string[]>();
  for (const operator of vocabulary.operators) {
    for (const alias of operatorAliases(operator)) byAlias.set(alias, [...(byAlias.get(alias) ?? []), operator]);
  }
  for (const alias of [...byAlias.keys()].sort((a, b) => b.length - a.length)) {
    if (!containsPhrase(text, alias)) continue;
    for (const operator of byAlias.get(alias)!) if (!filters.operators.includes(operator)) filters.operators.push(operator);
    text = removePhrase(text, alias);
  }

  // Places: a town, suburb or district ("Tauranga" covers Pāpāmoa and the Mount).
  for (const [alias, place] of Object.entries(PLACE_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
    if (containsPhrase(text, alias) && vocabulary.places.some((known) => normaliseName(known) === normaliseName(place))) {
      filters.places.push(place);
      text = removePhrase(text, alias);
    }
  }
  for (const place of [...vocabulary.places].sort((a, b) => b.length - a.length)) {
    const name = normaliseName(place);
    if (name.length >= 3 && containsPhrase(text, name)) {
      if (!filters.places.some((known) => normaliseName(known) === name)) filters.places.push(place);
      text = removePhrase(text, name);
    }
  }

  // "Free kindergarten" is a kind of service, not an offer; take it out before
  // looking for promotions.
  if (/\bfree kindergartens?\b/.test(text)) {
    filters.serviceTypes.push("Free Kindergarten");
    text = text.replace(/\bfree kindergartens?\b/g, " ");
  }
  for (const [pattern, types] of SERVICE_TYPE_RULES) {
    if (pattern.test(text)) {
      for (const type of types) if (!filters.serviceTypes.includes(type)) filters.serviceTypes.push(type);
    }
  }

  for (const word of NAME_WORDS) {
    if (containsPhrase(text, word)) filters.nameWords.push(word);
  }

  const negated = (feature: string) =>
    new RegExp(`\\b(no|without|dont|do not|doesnt|does not|not)\\b(\\s+\\w+){0,3}\\s+(${feature})`).test(text);

  const MEALS = "meals?|food|lunch(es)?|morning tea|afternoon tea|breakfast|catered|kai|cooked";
  if (new RegExp(`\\b(${MEALS})\\b`).test(text)) filters.meals = !negated(MEALS);
  const TRANSPORT = "transport|vans?|bus|buses|pick ?ups?|drop ?offs?|shuttle";
  if (new RegExp(`\\b(${TRANSPORT})\\b`).test(text)) filters.transport = !negated(TRANSPORT);

  // Promotions. "Offer" is also a verb ("which centres offer meals"), so on
  // its own it only counts when no other feature was asked about.
  const categories: Array<[RegExp, PromotionCategory]> = [
    [/\bfree (weeks?|months?|days?|fees|childcare)\b|\b(weeks?|months?|days?) free\b|\bfees free\b/, "free_period"],
    [/\bdiscounts?\b|\bpercent off\b|\bhalf price\b|\bcheaper\b|\breduced fees\b/, "discount"],
    [/\b(free|extra) hours\b|\bhours free\b|\b30 hours\b/, "free_hours"],
    [/\bgifts?\b|\bvouchers?\b/, "gift"],
  ];
  for (const [pattern, category] of categories) {
    if (pattern.test(text)) filters.promotionCategories.push(category);
  }
  const promotionWords = /\b(promos?|promotions?|promotional|incentives?|deals?|specials?|sign ?up bonus)\b/.test(text);
  const offerNoun = /\b(offers|special offers?|any offers?|offers? running)\b/.test(text) && filters.meals === null && filters.transport === null;
  if (filters.promotionCategories.length > 0 || promotionWords || offerNoun) {
    filters.promotion = !negated("promos?|promotions?|incentives?|deals?|offers?|specials?|discounts?");
  }

  if (/\b(under ?(2|two)s?|infants?|bab(y|ies)|nursery|toddlers?)\b/.test(text)) filters.under2 = true;

  // ("Inspired's" is "inspireds" once normalised.)
  if (/\b(includ(e|ing)|with|and|plus|compare|versus|vs)\b(\s+\w+){0,2}\s+(inspireds?|our own|our centres|our kindergartens|ours)\b/.test(text)) {
    filters.own = "include";
  } else if (/\b(inspireds?|our (own )?(centres|kindergartens|services)|own centres)\b/.test(text)) {
    filters.own = "only";
  }
  // A question about a named centre is about that centre, ours or not.
  if (filters.centreIds.length > 0) filters.own = "include";

  const intent: SectorQuestion["intent"] = /\b(how many|number of|count)\b/.test(text) ? "count" : "list";
  const sort: SectorQuestion["sort"] = /\b(largest|biggest|most places|most children|capacity)\b/.test(text)
    ? "places-desc"
    : /\bsmallest\b/.test(text)
      ? "places-asc"
      : "name";

  // Plain-language reading of the filters.
  if (filters.centreIds.length) {
    const names = vocabulary.centres.filter((centre) => filters.centreIds.includes(centre.id)).map((centre) => centre.name);
    description.push(`named: ${names.join(", ")}`);
  }
  if (filters.serviceTypes.length) {
    description.push([...new Set(filters.serviceTypes.map((type) => SERVICE_TYPE_LABELS[type] ?? type))].join(" or "));
  }
  if (filters.operators.length) description.push(`run by ${filters.operators.join(" or ")}`);
  if (filters.nameWords.length) description.push(`"${filters.nameWords.join('" or "')}" in the name`);
  if (filters.places.length) description.push(`in ${filters.places.join(" or ")}`);
  if (filters.meals === true) description.push("provide meals");
  if (filters.meals === false) description.push("not known to provide meals");
  if (filters.transport === true) description.push("provide transport");
  if (filters.transport === false) description.push("not known to provide transport");
  if (filters.promotion === true) {
    description.push(
      filters.promotionCategories.length
        ? `running a promotion: ${filters.promotionCategories.map((category) => PROMOTION_CATEGORY_LABELS[category].toLowerCase()).join(" or ")}`
        : "running a promotion",
    );
  }
  if (filters.promotion === false) description.push("no promotion found");
  if (filters.under2) description.push("licensed for under-2s");
  if (filters.own === "only") description.push("Inspired's own centres only");
  if (filters.own === "exclude") description.push("competitors only (Inspired's own centres left out)");

  const narrowed =
    filters.centreIds.length > 0 ||
    filters.places.length > 0 ||
    filters.operators.length > 0 ||
    filters.serviceTypes.length > 0 ||
    filters.nameWords.length > 0 ||
    filters.meals !== null ||
    filters.transport !== null ||
    filters.promotion !== null ||
    filters.under2 ||
    filters.own === "only";

  return { filters, intent, sort, description, narrowed };
}

function placeKeys(centre: SectorQueryCentre): string[] {
  return [centre.city, centre.suburb, centre.district, shortDistrictName(centre.district)]
    .filter(Boolean)
    .map((value) => normaliseName(value));
}

export function applySectorFilters<T extends SectorQueryCentre>(centres: readonly T[], question: SectorQuestion): T[] {
  const { filters } = question;
  const wantedPlaces = filters.places.map((place) => normaliseName(place));
  const matches = centres.filter((centre) => {
    if (filters.centreIds.length) return filters.centreIds.includes(centre.id);
    if (isClosedCentre(centre)) return false;
    if (filters.own === "exclude" && centre.isOwn) return false;
    if (filters.own === "only" && !centre.isOwn) return false;
    if (wantedPlaces.length && !placeKeys(centre).some((key) => wantedPlaces.includes(key))) return false;
    if (filters.operators.length && !filters.operators.includes(centre.operator)) return false;
    if (filters.serviceTypes.length && !filters.serviceTypes.includes(centre.serviceType)) return false;
    if (filters.nameWords.length && !filters.nameWords.some((word) => normaliseName(centre.name).includes(word))) return false;
    if (filters.meals === true && centre.providesMeals !== true) return false;
    if (filters.meals === false && centre.providesMeals === true) return false;
    if (filters.transport === true && centre.providesTransport !== true) return false;
    if (filters.transport === false && centre.providesTransport === true) return false;
    if (filters.promotion === true) {
      const promotions = filters.promotionCategories.length
        ? centre.promotions.filter((promotion) => filters.promotionCategories.includes(promotion.category as PromotionCategory))
        : centre.promotions;
      if (promotions.length === 0) return false;
    }
    if (filters.promotion === false && centre.promotions.length > 0) return false;
    if (filters.under2 && !(centre.under2Places && centre.under2Places > 0)) return false;
    return true;
  });

  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  if (question.sort === "places-desc") return matches.sort((a, b) => (b.licensedPlaces ?? -1) - (a.licensedPlaces ?? -1) || byName(a, b));
  if (question.sort === "places-asc") return matches.sort((a, b) => (a.licensedPlaces ?? 1e9) - (b.licensedPlaces ?? 1e9) || byName(a, b));
  return matches.sort(byName);
}

export function buildSectorVocabulary(centres: readonly SectorQueryCentre[]): SectorVocabulary {
  const places = new Set<string>(Object.values(PLACE_ALIASES));
  for (const centre of centres) {
    for (const value of [centre.city, centre.suburb, shortDistrictName(centre.district)]) if (value) places.add(value);
  }
  return {
    places: [...places],
    operators: [...new Set(centres.map((centre) => centre.operator).filter(Boolean))],
    centres: centres.map((centre) => ({ id: centre.id, name: centre.name })),
  };
}

// --- Overview for the model ---------------------------------------------------

function countBy<T>(items: readonly T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// A compact picture of the whole sector, always sent with a question so
// "which operator has the most centres?" can be answered without a filter.
export function summariseSector(centres: readonly SectorQueryCentre[]) {
  const competitors = centres.filter((centre) => !centre.isOwn && !isClosedCentre(centre));
  const promotions = new Map<string, { centres: number; operators: Set<string> }>();
  for (const centre of competitors) {
    for (const promotion of centre.promotions) {
      const entry = promotions.get(promotion.text) ?? { centres: 0, operators: new Set<string>() };
      entry.centres++;
      entry.operators.add(centre.operator || centre.name);
      promotions.set(promotion.text, entry);
    }
  }
  return {
    competitorCount: competitors.length,
    ownCentreCount: centres.filter((centre) => centre.isOwn).length,
    closedCount: centres.filter(isClosedCentre).length,
    byServiceType: Object.fromEntries(countBy(competitors, (centre) => centre.serviceType || "Unknown")),
    byTown: Object.fromEntries(countBy(competitors, (centre) => centre.city).slice(0, 15)),
    largestOperators: Object.fromEntries(countBy(competitors, (centre) => centre.operator).slice(0, 12)),
    providingMeals: competitors.filter((centre) => centre.providesMeals === true).length,
    providingTransport: competitors.filter((centre) => centre.providesTransport === true).length,
    withActivePromotion: competitors.filter((centre) => centre.promotions.length > 0).length,
    activePromotions: [...promotions.entries()]
      .sort((a, b) => b[1].centres - a[1].centres)
      .slice(0, 15)
      .map(([text, entry]) => ({ text, centres: entry.centres, by: [...entry.operators].slice(0, 3).join(", ") })),
  };
}
