export type MatchableCentre = {
  centreKey: number;
  name: string;
};

export type CentreMatch = {
  centreKey: number;
  centreName: string;
  confidence: number;
};

const GENERIC_WORDS = new Set([
  "ad",
  "ads",
  "advert",
  "advertising",
  "april",
  "august",
  "campaign",
  "centre",
  "childcare",
  "december",
  "enrol",
  "enrolment",
  "enrolments",
  "enrollment",
  "enrollments",
  "february",
  "january",
  "july",
  "june",
  "kindergarten",
  "kindergartens",
  "march",
  "may",
  "november",
  "october",
  "september",
]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeMetaName(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !GENERIC_WORDS.has(token));
}

function includesAll(source: Set<string>, expected: readonly string[]) {
  return expected.length > 0 && expected.every((token) => source.has(token));
}

export function matchMetaNameToCentre(metaName: string, centres: readonly MatchableCentre[]): CentreMatch | null {
  const metaTokens = tokenizeMetaName(metaName);
  const metaTokenSet = new Set(metaTokens);
  const scored = centres
    .map((centre) => {
      const centreTokens = tokenizeMetaName(centre.name);
      const centreTokenSet = new Set(centreTokens);
      const shared = centreTokens.filter((token) => metaTokenSet.has(token));
      const centreContainedInMeta = includesAll(metaTokenSet, centreTokens);
      const metaContainedInCentre = includesAll(centreTokenSet, metaTokens);
      const denominator = new Set([...centreTokens, ...metaTokens]).size || 1;
      const jaccard = shared.length / denominator;
      const confidence =
        centreContainedInMeta || metaContainedInCentre
          ? 1
          : shared.length > 0
            ? Math.min(0.95, jaccard + shared.length * 0.25)
            : 0;

      return {
        centreKey: centre.centreKey,
        centreName: centre.name,
        confidence,
        sharedCount: shared.length,
        centreTokenCount: centreTokens.length,
      };
    })
    .filter((match) => match.confidence >= 0.65)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      if (right.sharedCount !== left.sharedCount) {
        return right.sharedCount - left.sharedCount;
      }

      return right.centreTokenCount - left.centreTokenCount;
    });

  const best = scored[0];
  const second = scored[1];

  if (!best) {
    return null;
  }

  if (second && second.confidence === best.confidence && second.sharedCount === best.sharedCount) {
    return null;
  }

  return {
    centreKey: best.centreKey,
    centreName: best.centreName,
    confidence: best.confidence,
  };
}
