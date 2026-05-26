import { matchMetaNameToCentre, type MatchableCentre, type CentreMatch } from "../meta/centre-match.js";

export type MailchimpCampaignMatchInput = {
  subject?: string | null;
  title?: string | null;
  previewText?: string | null;
  listName?: string | null;
  segmentText?: string | null;
};

function joinCandidate(values: (string | null | undefined)[]) {
  return values
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0)
    .join(" ");
}

export function matchMailchimpCampaignToCentre(
  input: MailchimpCampaignMatchInput,
  centres: readonly MatchableCentre[],
): CentreMatch | null {
  // Try the most specific field first, then progressively widen so a strong
  // match on subject isn't drowned out by generic list / segment text.
  const candidates = [
    input.subject ?? null,
    input.title ?? null,
    joinCandidate([input.subject, input.previewText]),
    joinCandidate([input.subject, input.title, input.segmentText]),
    joinCandidate([input.subject, input.title, input.listName, input.segmentText]),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = matchMetaNameToCentre(candidate, centres);
    if (match) return match;
  }

  return null;
}
