import { matchMetaNameToCentre, tokenizeMetaName, type CentreMatch, type MatchableCentre } from "../meta/centre-match.js";

export type PostmarkCentreMatchInput = {
  tag?: string | null;
  recipient?: string | null;
};

function recipientMailbox(recipient: string | null | undefined) {
  if (!recipient) return null;
  const separator = recipient.indexOf("@");
  if (separator <= 0) return null;
  return recipient.slice(0, separator).trim() || null;
}

export function matchPostmarkEventToCentre(
  input: PostmarkCentreMatchInput,
  centres: readonly MatchableCentre[],
): CentreMatch | null {
  const tagMatch = input.tag ? matchMetaNameToCentre(input.tag, centres) : null;
  if (tagMatch) return tagMatch;

  const mailbox = recipientMailbox(input.recipient);
  const mailboxTokens = mailbox ? tokenizeMetaName(mailbox).join(" ") : "";
  const compactMailbox = mailboxTokens.replaceAll(" ", "");
  const exactMailboxMatches = mailboxTokens
    ? centres.filter((centre) => {
      const centreTokens = tokenizeMetaName(centre.name);
      return centreTokens.join(" ") === mailboxTokens || centreTokens.join("") === compactMailbox;
    })
    : [];

  if (exactMailboxMatches.length === 1) {
    return {
      centreKey: exactMailboxMatches[0].centreKey,
      centreName: exactMailboxMatches[0].name,
      confidence: 1,
    };
  }

  return mailbox ? matchMetaNameToCentre(mailbox, centres) : null;
}
