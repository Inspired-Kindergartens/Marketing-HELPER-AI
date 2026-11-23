// Info Sheets: filling a kindergarten's fields in from what the app already
// knows. Contact details come from the Sector Insight record of our own
// centre (the Ministry of Education directory), matched by licence number.
import type { OnePagerFields } from "./template.js";

export type KnownCentreContact = {
  address: string;
  suburb: string;
  city: string;
  phone: string;
  email: string;
};

export type OnePagerContact = Pick<OnePagerFields, "address" | "phone" | "email">;

// "27 Botanical Road, Tauranga": the street, then the suburb (or the city
// when there is no suburb), unless the street line already ends with it.
// ("77 Otumoetai Road" still gets ", Otumoetai": the road only shares the name.)
export function formatOnePagerAddress(known: Pick<KnownCentreContact, "address" | "suburb" | "city">): string {
  const street = known.address.replace(/\s+/g, " ").trim().replace(/,$/, "");
  const place = (known.suburb || known.city).replace(/\s+/g, " ").trim();
  if (!street) return "";
  if (!place || street.toLowerCase().endsWith(place.toLowerCase())) return street;
  return `${street}, ${place}`;
}

// "07-5766311" and "(07) 576 6311" as "07 576 6311", the way the info sheets
// write a landline. Anything else (mobiles, 0800) only has its spacing tidied.
export function formatOnePagerPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^0[34679]\d{7}$/.test(digits)) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return phone.replace(/\s+/g, " ").trim();
}

export function contactFromKnown(known: KnownCentreContact | null): OnePagerContact {
  if (!known) return { address: "", phone: "", email: "" };
  return {
    address: formatOnePagerAddress(known),
    phone: formatOnePagerPhone(known.phone),
    email: known.email.trim().toLowerCase(),
  };
}

// Fills in only what is empty: anything the user has typed stays.
export function fillEmptyFields<T extends Record<string, string>>(current: T, known: Partial<T>): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(known) as Array<keyof T>) {
    const value = known[key];
    if (value && !current[key]?.trim()) changes[key] = value;
  }
  return changes;
}
