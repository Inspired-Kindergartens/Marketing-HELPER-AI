import { matchMetaNameToCentre, type CentreMatch, type MatchableCentre } from "../meta/centre-match.js";

export type FormstackCentreMatchInput = {
  name?: string | null;
  folder?: string | null;
};

export function matchFormstackFormToCentre(
  input: FormstackCentreMatchInput,
  centres: readonly MatchableCentre[],
): CentreMatch | null {
  const candidates = [
    input.name ?? "",
    input.folder ?? "",
    `${input.folder ?? ""} ${input.name ?? ""}`.trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = matchMetaNameToCentre(candidate, centres);
    if (match) return match;
  }

  return null;
}
