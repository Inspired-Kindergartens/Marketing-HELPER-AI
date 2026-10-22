import { splitPromotions } from "./promotions.js";

// Reads the BOP competitor spreadsheet export
// (docs/Bay_of_Plenty_ECE_Competitor_Promotions_*.csv): one row per centre with
// operator, promotions ("a; b"), meals, transport, city/suburb and source URLs.

export type SectorCsvRow = {
  name: string;
  operator: string; // "" when the sheet says "Unverified"
  verified: boolean;
  promotions: string[];
  meals: string;
  providesMeals: boolean | null;
  transport: string;
  providesTransport: boolean | null;
  city: string;
  suburb: string;
  operatorUrl: string;
  promotionUrl: string;
};

// Windows-1252's 0x80-0x9F block (en dash, curly quotes …). Node's
// TextDecoder("windows-1252") decodes these as Latin-1 control characters, so
// the block is mapped here; 0x81, 0x8D, 0x8F, 0x90 and 0x9D are unassigned.
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

// Excel saves CSV as Windows-1252 unless told otherwise; UTF-8 is used when the
// bytes are valid UTF-8, so a re-saved sheet works either way.
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    let text = "";
    for (const byte of bytes) text += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte);
    return text;
  }
}

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// "Yes", "Yes - food included (official group site)" and "Lunches" say the
// centre provides it. Anything else ("Lunch Box": families bring one) is kept
// as text but left unknown rather than guessed.
export function readProvided(value: string): boolean | null {
  const text = value.trim();
  if (!text) return null;
  if (/^(yes|lunches)\b/i.test(text)) return true;
  if (/^no\b/i.test(text)) return false;
  return null;
}

export function readSectorCsv(text: string): SectorCsvRow[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const column = (pattern: RegExp) => header.findIndex((cell) => pattern.test(cell.trim()));
  const at = {
    name: column(/^centre$/i),
    operator: column(/^operator/i),
    promotion: column(/^promotion category/i),
    meals: column(/^meals$/i),
    transport: column(/^transport$/i),
    city: column(/^city$/i),
    suburb: column(/^suburb$/i),
    operatorUrl: column(/^operator source url/i),
    promotionUrl: column(/^promotion source url/i),
  };
  const read = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");

  return rows
    .map((row) => {
      const operator = read(row, at.operator);
      const verified = operator !== "" && !/^unverified$/i.test(operator);
      const meals = read(row, at.meals);
      const transport = read(row, at.transport);
      return {
        name: read(row, at.name),
        operator: verified ? operator : "",
        verified,
        promotions: splitPromotions(read(row, at.promotion)),
        meals,
        providesMeals: readProvided(meals),
        transport,
        providesTransport: readProvided(transport),
        city: read(row, at.city),
        suburb: read(row, at.suburb),
        operatorUrl: read(row, at.operatorUrl),
        promotionUrl: read(row, at.promotionUrl),
      };
    })
    .filter((row) => row.name.length > 0);
}
