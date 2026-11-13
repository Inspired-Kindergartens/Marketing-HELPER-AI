// The SLT (Senior Teacher) filter on Infocare Analytics and Enrolment Quality.
// A centre's SLT comes from the contact list's "Key Senior Teacher" column,
// by first name: "Marion Dekker" is Marion, and a shared centre
// ("Haylee/Vilna") belongs to both.
import { matchCentreContact, type CentreContact } from "../storage/centre-contact-store.js";

function sltNamesOf(contact: CentreContact): string[] {
  // The column is optional in the sheet.
  return (contact.keySeniorTeacher ?? "")
    .split("/")
    .map((name) => name.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

// Every SLT in the contact list, A to Z.
export function listSltNames(contacts: readonly CentreContact[]): string[] {
  const names = new Map<string, string>();
  for (const name of contacts.flatMap(sltNamesOf)) {
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// The SLT a query value names, or null (no filter) when it names none.
export function resolveSlt(value: unknown, contacts: readonly CentreContact[]): string | null {
  const wanted = String(value ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return listSltNames(contacts).find((name) => name.toLowerCase() === wanted) ?? null;
}

// The rows whose centre belongs to the SLT; every row when no SLT is chosen.
export function filterBySlt<T>(
  rows: readonly T[],
  centreName: (row: T) => string,
  slt: string | null | undefined,
  contacts: readonly CentreContact[],
): T[] {
  if (!slt) return [...rows];
  const wanted = slt.toLowerCase();
  return rows.filter((row) => {
    const contact = matchCentreContact(centreName(row), contacts);
    return contact != null && sltNamesOf(contact).some((name) => name.toLowerCase() === wanted);
  });
}

// The total row's name under a filter, e.g. "Marion's kindergartens".
export function sltTotalName(slt: string) {
  return `${slt}'s kindergartens`;
}
