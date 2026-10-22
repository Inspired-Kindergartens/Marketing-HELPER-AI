import { helpHtmlToText } from "../help-kb/parse.js";
import { namesMatch, normaliseName } from "./names.js";

// Turns a competitor's web page into the short excerpt the local model reads.
// Many ECE sites render their offers with JavaScript (BestStart's promotions
// page is blank as plain HTML), so the data payload Nuxt/Next embed in the
// page is decoded too. Pure, so it is unit-tested.

// Words that mark a line worth the model's attention.
const RELEVANT = /\b(free|fees?|off|%|discount|special|offer|promo|promotion|deal|half[- ]price|waive|gift|voucher|incentive|meals?|lunch|morning tea|afternoon tea|breakfast|food|kai|menu|chef|cook|catered|nappies|nappy|transport|van|bus|pick[- ]?up|drop[- ]?off|shuttle|20 hours|30 hours|hours free|enrol)\b/i;

// --- Embedded payloads -------------------------------------------------------

const DEVALUE_WRAPPERS = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError", "Island"]);

// Nuxt 3 serialises its state with devalue: one flat array where objects and
// arrays hold indexes into it. Rebuilds the object graph (cycles reuse the
// same node).
export function unflattenDevalue(flat: unknown[]): unknown {
  const built = new Map<number, unknown>();
  const build = (index: unknown, depth: number): unknown => {
    if (typeof index !== "number" || index < 0 || index >= flat.length || depth > 80) return undefined;
    if (built.has(index)) return built.get(index);
    const value = flat[index];
    if (Array.isArray(value)) {
      if (typeof value[0] === "string" && DEVALUE_WRAPPERS.has(value[0])) {
        const inner = value.length > 1 ? build(value[1], depth + 1) : undefined;
        built.set(index, inner);
        return inner;
      }
      if (typeof value[0] === "string" && ["Date", "BigInt", "RegExp", "Set", "Map"].includes(value[0])) {
        built.set(index, undefined);
        return undefined;
      }
      const array: unknown[] = [];
      built.set(index, array);
      for (const item of value) array.push(build(item, depth + 1));
      return array;
    }
    if (value && typeof value === "object") {
      const object: Record<string, unknown> = {};
      built.set(index, object);
      for (const [key, item] of Object.entries(value)) object[key] = build(item, depth + 1);
      return object;
    }
    built.set(index, value);
    return value;
  };
  return build(0, 0);
}

// Names inside a nested value (an offer's list of participating centres),
// whatever the key: name, title, center_name …
function collectNames(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || out.length > 400) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectNames(item, depth + 1, out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && /(^|_)(name|title)$/i.test(key) && item.length < 120) out.push(item.trim());
      else if (item && typeof item === "object") collectNames(item, depth + 1, out);
    }
  }
  return out;
}

export type PayloadRecord = {
  text: string; // the record's prose fields joined
  status: string; // a short status field if it has one ("published", "draft")
  relatedNames: string[]; // e.g. the centres an offer applies to
};

// Every object in the payload with a relevant prose field becomes one record.
export function payloadRecords(root: unknown): PayloadRecord[] {
  const records: PayloadRecord[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 60) return;
    seen.add(value);
    if (!Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      const prose = entries
        .filter(([, item]) => typeof item === "string" && item.length >= 8 && item.length <= 1200 && /\s/.test(item) && !/^https?:/.test(item))
        .map(([, item]) => (item as string).trim());
      // Short fragments ("Enrol Online Link", image alt text) are not statements.
      if (prose.some((text) => text.length >= 30 && RELEVANT.test(text))) {
        const status = entries.find(([key, item]) => /^status$/i.test(key) && typeof item === "string");
        records.push({
          text: prose.join(" — "),
          status: status ? String(status[1]) : "",
          relatedNames: entries
            .filter(([, item]) => item && typeof item === "object")
            .flatMap(([, item]) => collectNames(item)),
        });
      }
    }
    for (const item of Object.values(value as object)) visit(item, depth + 1);
  };
  visit(root, 0);
  return records;
}

export function embeddedPayloadRecords(html: string): PayloadRecord[] {
  const records: PayloadRecord[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    if (!/type="application\/(ld\+)?json"/i.test(attributes)) continue;
    try {
      const parsed = JSON.parse(match[2]);
      const root = /id="__NUXT_DATA__"/i.test(attributes) && Array.isArray(parsed) ? unflattenDevalue(parsed) : parsed;
      records.push(...payloadRecords(root));
    } catch {
      // A malformed payload is just skipped; the visible text still counts.
    }
  }
  return records;
}

// --- Visible text and links --------------------------------------------------

export function pageVisibleText(html: string): string {
  return helpHtmlToText(html.replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " "));
}

export function pageTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? helpHtmlToText(match[1]).replace(/\s+/g, " ").trim() : "";
}

const FOLLOW_LINK = /promo|offer|special|deal|fee|enrol|free|hours|meal|food|menu|nutrition|transport|cost|pricing|our-centre|locations?\b/i;
const SKIP_LINK = /\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|zip|mp4)(\?|$)|^mailto:|^tel:|#|\/(wp-admin|login|cart|careers?|jobs?)\b/i;

// Same-site links whose address or text suggests fees, offers, food or
// transport, best first, for the crawler to read after the home page.
export function pickFollowLinks(html: string, pageUrl: string, max: number): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const picked = new Map<string, number>();
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].trim();
    if (SKIP_LINK.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    url.hash = "";
    const key = url.toString();
    if (key === base.toString() || picked.has(key)) continue;
    const text = helpHtmlToText(match[2]);
    const score = (FOLLOW_LINK.test(url.pathname) ? 2 : 0) + (FOLLOW_LINK.test(text) ? 1 : 0) + (/promo|offer|special/i.test(url.pathname + text) ? 2 : 0);
    if (score > 0) picked.set(key, score);
  }
  return [...picked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([url]) => url);
}

// --- The excerpt the model reads --------------------------------------------

export type PageExcerptInput = {
  text: string; // visible text
  records: PayloadRecord[];
  centreNames: string[]; // the centres this page is being read for
};

function lineMentionsCentre(line: string, centreName: string): boolean {
  const normalisedLine = ` ${normaliseName(line)} `;
  const normalisedName = normaliseName(centreName);
  return normalisedName.length >= 6 && (normalisedLine.includes(` ${normalisedName} `) || namesMatch(line, centreName));
}

const WINDOW_LINES = 6;

// On a group's "find a centre" page, each of our centres' own lines: its name
// and the badges after it, up to the next centre of the same group
// ("Busy Bees Katikati / 20 Hours ECE / Storypark / Meals provided"). Empty
// when the page names none of them (a single centre's own site).
export function centreWindows(text: string, centreNames: string[]): Map<string, string> {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const windows = new Map<string, string>();
  lines.forEach((line, index) => {
    const centre = centreNames.find((name) => !windows.has(name) && lineMentionsCentre(line, name));
    if (!centre) return;
    const groupStart = normaliseName(centre).split(" ").slice(0, 2).join(" ");
    const window = [line];
    for (const next of lines.slice(index + 1, index + 1 + WINDOW_LINES)) {
      if (normaliseName(next).startsWith(groupStart)) break;
      window.push(next);
    }
    windows.set(centre, window.join(" / "));
  });
  return windows;
}

// Three parts, deduplicated, in a fixed budget:
//  1. offers from the embedded payload: ones listing participating centres
//     are kept only when one of ours is listed, and say which;
//  2. lines naming one of our centres plus the two after it (a group's
//     "find a centre" list: "Busy Bees Katikati / Meals provided");
//  3. every other relevant line once, with the line before it for context.
export function buildPageExcerpt(input: PageExcerptInput, maxChars: number): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (line: string) => {
    const key = line.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    parts.push(key);
  };

  for (const record of input.records) {
    if (record.status && !/^(published|active|live|current)$/i.test(record.status)) continue;
    if (record.relatedNames.length >= 3) {
      const ours = input.centreNames.filter((centre) => record.relatedNames.some((name) => namesMatch(name, centre)));
      if (ours.length === 0) continue;
      add(`OFFER: ${record.text.slice(0, 900)}\n  Participating centres (of yours): ${ours.join(", ")}`);
    } else {
      add(`OFFER: ${record.text.slice(0, 900)}`);
    }
  }

  const lines = input.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const windows = centreWindows(input.text, input.centreNames);
  const anchored = windows.size > 0;
  for (const window of windows.values()) add(window);
  lines.forEach((line, index) => {
    if (RELEVANT.test(line) && line.length <= 600) {
      // On a list of centres the line before is another centre's name, which
      // would pin the statement on the wrong centre; there the line stands alone.
      const previous = lines[index - 1];
      add(!anchored && previous && previous.length < 120 && !RELEVANT.test(previous) ? `${previous}: ${line}` : line);
    }
  });

  let excerpt = "";
  for (const part of parts) {
    if (excerpt.length + part.length + 1 > maxChars) break;
    excerpt += `${part}\n`;
  }
  return excerpt.trim();
}
