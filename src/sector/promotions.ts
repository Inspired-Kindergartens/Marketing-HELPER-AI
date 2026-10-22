// Promotion helpers for Sector Insight: what kind of offer a line is, whether
// this month's crawl found the same offer as last month's (competitors reword
// slightly), and whether an offer the model extracted is really on the page.

export type PromotionCategory = "free_period" | "discount" | "free_hours" | "gift" | "other";

export const PROMOTION_CATEGORY_LABELS: Record<PromotionCategory, string> = {
  free_period: "Free weeks / months",
  discount: "Fee discount",
  free_hours: "Extra free hours",
  gift: "Gift / voucher",
  other: "Other incentive",
};

const NUMBER_WORD = "(?:\\d+|one|two|three|four|five|six|eight|ten|twelve)";

// First match wins: "30 days free, plus up to 50% off" is a free period first.
const CATEGORY_RULES: Array<[PromotionCategory, RegExp]> = [
  ["free_period", new RegExp(`\\b${NUMBER_WORD}\\s*(days?|weeks?|months?)\\s*(of\\s*)?(fees?\\s*)?free|\\bfree\\s+(childcare|fees?|care)\\s+for\\s+${NUMBER_WORD}\\s*(days?|weeks?|months?)|\\b(days?|weeks?|months?)\\s+free\\b`, "i")],
  ["discount", /%\s*off|\bhalf[- ]price|\bdiscount|\$\s?\d+(\.\d+)?\s*(\/|per)\s*(hour|day)|\$\d+\s+days?|\bwaive|\bno (enrolment|registration) fee/i],
  ["free_hours", /\b\d+\s*free\s*(ece\s*)?hours?\b|\b\d+\s*(ece\s*)?hours?\b[^.;]*\bfree\b|\bfree\b[^.;]*\b\d+\s*hours?\b|\bhours free\b/i],
  ["gift", /\bgift|\bvoucher|\btoy\b|\bfree (bag|book|hat|uniform)/i],
];

export function categorisePromotion(text: string): PromotionCategory {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return "other";
}

export function splitPromotions(cell: string): string[] {
  return cell
    .split(";")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "all", "any", "ask", "about", "get", "can",
  "when", "per", "who", "this", "that", "from", "into", "at", "of", "to", "a", "an", "on", "in", "up", "plus",
  // Qualifiers that come and go between rewordings of the same offer.
  "new", "enrolment", "enrolments", "participating", "selected", "select", "centre", "centres", "families", "only", "available", "first",
]);

function promotionTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function numbersIn(text: string): string[] {
  return text.match(/\d+(\.\d+)?/g) ?? [];
}

// Token overlap (Jaccard), with a hard rule that the numbers must agree:
// "50% off for 4 months" is not the same offer as "50% off for 6 months".
export function promotionSimilarity(a: string, b: string): number {
  const left = new Set(promotionTokens(a));
  const right = new Set(promotionTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  const numbersA = [...new Set(numbersIn(a))].sort().join(",");
  const numbersB = [...new Set(numbersIn(b))].sort().join(",");
  if (numbersA !== numbersB) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

export const SAME_PROMOTION_THRESHOLD = 0.5;

export function findMatchingPromotion<T extends { text: string }>(text: string, existing: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = SAME_PROMOTION_THRESHOLD;
  for (const candidate of existing) {
    const score = promotionSimilarity(text, candidate.text);
    if (score >= bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

// The guard against a model inventing an offer: every number in it must be on
// the page, and most of its words too.
export function isSupportedByPage(promotion: string, pageText: string): boolean {
  const page = pageText.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pageNumbers = new Set(numbersIn(page));
  if (numbersIn(promotion).some((number) => !pageNumbers.has(number))) return false;
  const words = promotionTokens(promotion).filter((token) => token.length >= 3 && !/^\d/.test(token));
  if (words.length === 0) return numbersIn(promotion).length > 0;
  const pageTokens = new Set(promotionTokens(page));
  const found = words.filter((word) => pageTokens.has(word) || pageTokens.has(word.replace(/s$/, "")) || pageTokens.has(`${word}s`));
  return found.length / words.length >= 0.6;
}
