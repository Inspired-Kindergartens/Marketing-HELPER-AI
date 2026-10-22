// Name matching for Sector Insight: the BOP CSV, the Ministry of Education
// directory and competitors' websites all spell a centre slightly differently
// ("New Shoots Childrens Centre (Papamoa)" / "New Shoots Children's Centre -
// Papamoa", "Ngongotah?" for "Ngongotahā"). Pure, so it is unit-tested.

const NOISE_WORDS = /\b(ltd|limited|inc|incorporated|the|2021|2025)\b/g;

// Lower case, macrons and punctuation stripped, "&" spelled out, company
// suffixes dropped. A "?" survives: the CSV export turned every macron vowel
// into one, so it is treated as a single-letter wildcard by namesMatch.
export function normaliseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9?]+/g, " ")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
}

export function namesMatch(a: string, b: string): boolean {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (!left.includes("?") && !right.includes("?")) return false;
  const [pattern, subject] = left.includes("?") ? [left, right] : [right, left];
  return new RegExp(`^${escapeRegExp(pattern).replace(/\?/g, "[a-z]")}$`).test(subject);
}

// Words that say what kind of service it is rather than which one, so two
// names are not called the same centre just because both are "preschools".
const GENERIC_WORDS = new Set([
  "early", "learning", "centre", "center", "childcare", "child", "care", "preschool", "pre", "school",
  "kindergarten", "kindy", "education", "and", "ece", "elc", "educare", "childrens", "children",
]);

export function distinctiveTokens(value: string): string[] {
  return normaliseName(value)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_WORDS.has(token));
}

// A looser second-tier match, used only between candidates that already share
// a town: every distinctive word of the shorter name appears in the longer.
export function namesLooselyMatch(a: string, b: string): boolean {
  const left = distinctiveTokens(a);
  const right = distinctiveTokens(b);
  if (left.length === 0 || right.length === 0) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const pool = new Set(longer);
  return shorter.every((token) => pool.has(token) || (token.includes("?") && longer.some((other) => namesMatch(token, other))));
}

// Prefer an exact name match; fall back to a loose one only when it is the
// single loose candidate in the same town, so a wrong pairing is unlikely.
export function findBestNameMatch<T>(
  name: string,
  town: string,
  candidates: readonly T[],
  read: (candidate: T) => { name: string; towns: string[] },
): T | null {
  const sameTown = (candidate: T) => {
    if (!town) return true;
    const wanted = normaliseName(town);
    return read(candidate).towns.some((value) => normaliseName(value) === wanted);
  };
  const exact = candidates.filter((candidate) => namesMatch(name, read(candidate).name));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact.find(sameTown) ?? null;
  const loose = candidates.filter((candidate) => sameTown(candidate) && namesLooselyMatch(name, read(candidate).name));
  return loose.length === 1 ? loose[0] : null;
}

// "Tauranga City" / "Western Bay of Plenty District" → "Tauranga" / "Western Bay of Plenty",
// so a question about "Tauranga" also covers Pāpāmoa and the Mount.
export function shortDistrictName(district: string): string {
  return district.replace(/\s+(city|district)$/i, "").trim();
}
