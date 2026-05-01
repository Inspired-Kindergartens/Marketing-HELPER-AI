import type { CentreReference } from "../infocare/models.js";

export type ManualCapacitySeed = {
  matchName: string;
  maxU2?: number;
  maxO2: number;
};

export type ResolvedManualCapacity = {
  centreKey: number;
  centreName: string;
  licensedCapacity: number;
  maxU2?: number;
  maxO2: number;
  notes?: string;
};

const MANUAL_CAPACITY_SEEDS: ManualCapacitySeed[] = [
  { matchName: "Arataki", maxO2: 45 },
  { matchName: "Avenues", maxO2: 42 },
  { matchName: "Brookfield", maxO2: 42 },
  { matchName: "Gwen Rogers", maxO2: 45 },
  { matchName: "Karamuramu", maxO2: 45 },
  { matchName: "Katikati", maxO2: 30 },
  { matchName: "Maarawaewae", maxO2: 45 },
  { matchName: "Matua", maxO2: 40 },
  { matchName: "Maungaaarangi", maxO2: 40 },
  { matchName: "Maunganui", maxU2: 8, maxO2: 30 },
  { matchName: "Maungatapu", maxO2: 45 },
  { matchName: "OPEYS ALL DAY", maxU2: 18, maxO2: 60 },
  { matchName: "Otamarakau", maxO2: 21 },
  { matchName: "Otumoetai", maxO2: 45 },
  { matchName: "Paengaroa", maxO2: 43 },
  { matchName: "Papamoa Coast", maxO2: 40 },
  { matchName: "Papamoa", maxO2: 45 },
  { matchName: "Tai o Fenua", maxU2: 5, maxO2: 30 },
  { matchName: "Te Puke", maxO2: 42 },
  { matchName: "Te Puna", maxO2: 42 },
  { matchName: "Waihi", maxO2: 35 },
  { matchName: "Wairakei", maxO2: 45 },
  { matchName: "Welcome Bay", maxO2: 43 },
  { matchName: "Whakamarama", maxO2: 30 },
  { matchName: "Whangamata", maxO2: 40 },
];

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLowerCase();
}

function findMatchingCentre(
  centres: readonly CentreReference[],
  seed: ManualCapacitySeed,
  usedCentreKeys: ReadonlySet<number>,
) {
  const normalizedSeedName = normalizeName(seed.matchName);
  const availableCentres = centres.filter((centre) => !usedCentreKeys.has(centre.centreKey));
  const exactMatch = availableCentres.find(
    (centre) => normalizeName(centre.name) === normalizedSeedName,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const prefixMatch = availableCentres.find((centre) =>
    normalizeName(centre.name).startsWith(`${normalizedSeedName} `),
  );

  if (prefixMatch) {
    return prefixMatch;
  }

  return availableCentres.find((centre) => normalizeName(centre.name).includes(normalizedSeedName));
}

export function buildManualCapacityOverrides(
  centres: readonly CentreReference[],
): ResolvedManualCapacity[] {
  const resolved: ResolvedManualCapacity[] = [];
  const usedCentreKeys = new Set<number>();

  for (const seed of MANUAL_CAPACITY_SEEDS) {
    const centre = findMatchingCentre(centres, seed, usedCentreKeys);

    if (!centre) {
      continue;
    }

    usedCentreKeys.add(centre.centreKey);

    resolved.push({
      centreKey: centre.centreKey,
      centreName: centre.name,
      licensedCapacity: (seed.maxU2 ?? 0) + seed.maxO2,
      maxU2: seed.maxU2,
      maxO2: seed.maxO2,
      notes: "Imported from INFOCARE-LICENSE.md",
    });
  }

  return resolved;
}
