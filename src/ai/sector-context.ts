import type { AiChatMessage } from "./client.js";
import { sanitizeChatHistory, type AiChatHistoryMessageInput } from "./chat.js";
import type { SectorCentreView } from "../storage/sector-store.js";
import {
  applySectorFilters,
  buildSectorVocabulary,
  parseSectorQuestion,
  summariseSector,
  type SectorQuestion,
} from "../sector/query.js";

// The Sector Insight chat. The app, not the model, decides which centres
// answer a question (src/sector/query.ts); the model is given those exact rows
// and only words the reply. The full matching list is shown under the reply,
// so the answer never depends on the model listing ~100 names correctly.

// The model runs with a 4,096-token window: the matching rows get ~6,000
// characters, the sector overview ~2,000.
const MATCH_ROWS_CHAR_BUDGET = 6000;
const LISTED_RESULTS_MAX = 200;
const SUMMARISE_ABOVE = 8;

export type SectorChatResultRow = { id: number; name: string; town: string; detail: string };

export type SectorChatPlan = {
  question: SectorQuestion;
  matches: SectorCentreView[];
  // What the page lists under the reply; null for an overview question.
  results: { description: string; total: number; rows: SectorChatResultRow[] } | null;
};

const FOLLOW_UP = /\b(those|them|these|they|ones|of which|that list|same)\b/i;

// "Which of those are in Rotorua?" narrows the previous question, so a
// follow-up is read together with the user's last question.
export function sectorQuestionText(prompt: string, history: AiChatHistoryMessageInput[] | undefined): string {
  if (!FOLLOW_UP.test(prompt)) return prompt;
  const previous = [...(history ?? [])].reverse().find((message) => message?.role === "user");
  return typeof previous?.content === "string" ? `${previous.content.slice(0, 500)} ${prompt}` : prompt;
}

// "Yes – fresh seasonal meals (official group site)" → "fresh seasonal meals (official group site)".
function featureDetail(label: string, detail: string): string {
  const text = detail.replace(/^yes\b\s*[-–—:]?\s*/i, "").trim();
  if (!text || new RegExp(`^${label}( provided)?$`, "i").test(text)) return `${label} provided`;
  return `${label}: ${text}`;
}

function rowDetail(centre: SectorCentreView, question: SectorQuestion): string {
  const { filters } = question;
  const parts: string[] = [];
  if (filters.promotion === true || filters.promotionCategories.length) {
    parts.push(centre.promotions.map((promotion) => promotion.text).join("; "));
  }
  if (filters.meals === true) parts.push(featureDetail("Meals", centre.meals));
  if (filters.transport === true) parts.push(featureDetail("Transport", centre.transport));
  if (question.sort !== "name" && centre.licensedPlaces != null) parts.push(`${centre.licensedPlaces} places`);
  if (parts.filter(Boolean).length === 0) parts.push(centre.operator || centre.serviceType);
  return parts.filter(Boolean).join(" · ");
}

export function planSectorAnswer(
  centres: SectorCentreView[],
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
  openCentreId: number | null,
): SectorChatPlan {
  const question = parseSectorQuestion(sectorQuestionText(prompt, history), buildSectorVocabulary(centres));
  // On a centre's own page, a question about "it", or one that names nothing
  // ("what do you know?"), is about that centre.
  const aboutOpenCentre =
    openCentreId != null &&
    question.filters.centreIds.length === 0 &&
    question.filters.places.length === 0 &&
    question.filters.operators.length === 0 &&
    (!question.narrowed || /\b(it|its|this centre|this one|this service|here|they|their)\b/i.test(prompt));
  if (aboutOpenCentre) {
    question.filters.centreIds = [openCentreId];
    question.filters.own = "include";
    question.narrowed = true;
    const open = centres.find((centre) => centre.id === openCentreId);
    if (open) question.description.unshift(`the centre you have open: ${open.name}`);
    question.description = question.description.filter((part) => !part.startsWith("competitors only"));
  }
  if (!question.narrowed) return { question, matches: [], results: null };

  const matches = applySectorFilters(centres, question);
  return {
    question,
    matches,
    results: {
      description: question.description.join(" · "),
      total: matches.length,
      rows: matches.slice(0, LISTED_RESULTS_MAX).map((centre) => ({
        id: centre.id,
        name: centre.name,
        town: [centre.suburb !== centre.city ? centre.suburb : "", centre.city].filter(Boolean).join(", "),
        detail: rowDetail(centre, question),
      })),
    },
  };
}

function compactCentre(centre: SectorCentreView, full: boolean) {
  const row: Record<string, unknown> = {
    name: centre.name,
    operator: centre.operator || "not verified",
    type: centre.serviceType,
    town: centre.city,
    suburb: centre.suburb || undefined,
    places: centre.licensedPlaces ?? undefined,
    under2Places: centre.under2Places || undefined,
    meals: centre.providesMeals === true ? centre.meals || "yes" : centre.providesMeals === false ? "no" : "unknown",
    transport: centre.providesTransport === true ? centre.transport || "yes" : centre.providesTransport === false ? "no" : "unknown",
    promotions: centre.promotions.length ? centre.promotions.map((promotion) => promotion.text) : undefined,
    inspiredCentre: centre.isOwn || undefined,
  };
  if (full) {
    Object.assign(row, {
      address: [centre.address, centre.suburb, centre.city].filter(Boolean).join(", ") || undefined,
      ownership: centre.authority || undefined,
      roll: centre.roll ?? undefined,
      phone: centre.phone || undefined,
      website: centre.website || undefined,
      notes: centre.notes ? centre.notes.slice(0, 600) : undefined,
      endedPromotions: centre.pastPromotions.length ? centre.pastPromotions.slice(0, 5).map((promotion) => promotion.text) : undefined,
    });
  } else if (centre.notes) {
    row.notes = centre.notes.slice(0, 160);
  }
  return row;
}

function countBy(centres: SectorCentreView[], key: (centre: SectorCentreView) => string) {
  const counts = new Map<string, number>();
  for (const centre of centres) {
    const value = key(centre);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
}

export function buildSectorAiContext(centres: SectorCentreView[], plan: SectorChatPlan, today: string) {
  const context: Record<string, unknown> = {
    today,
    sectorOverview: summariseSector(centres),
  };
  if (plan.results) {
    const full = plan.matches.length <= 3;
    const rows: unknown[] = [];
    let used = 0;
    for (const centre of plan.matches) {
      const row = compactCentre(centre, full);
      const size = JSON.stringify(row).length;
      if (used + size > MATCH_ROWS_CHAR_BUDGET) break;
      rows.push(row);
      used += size;
    }
    // Past eight matches the reply summarises with these exact counts rather
    // than naming centres (a model listing 20 names drops some).
    const summarise = plan.matches.length > SUMMARISE_ABOVE;
    Object.assign(context, {
      questionReadAs: plan.results.description,
      matchCount: plan.matches.length,
      matchesByOperator: summarise ? countBy(plan.matches, (centre) => centre.operator || "operator not verified") : undefined,
      matchesByTown: summarise ? countBy(plan.matches, (centre) => centre.city) : undefined,
      matches: rows,
      matchesShown: rows.length < plan.matches.length ? `first ${rows.length} of ${plan.matches.length}` : undefined,
    });
  }
  return context;
}

export function buildSectorSystemPrompt() {
  return [
    "You are Beep Beep, the assistant on the Sector Insight page for the marketing team of Inspired Kindergartens, a group of community kindergartens in the Bay of Plenty, New Zealand.",
    "You answer questions about competitors and other early childhood services: childcare (education & care), kindergartens, home-based services, playcentres and kōhanga reo, and their promotions, incentives, meals, transport, size and location.",
    "Answer only from the JSON you are given: it is the complete, current Sector Insight database. Never use outside knowledge about centres, and never invent a centre, offer, price or number.",
    "matches are exactly the centres that answer the question, already filtered by the app, and matchCount is their true number. State that number exactly.",
    "The app shows the full matching list under your reply. With 8 matches or fewer you may name them. With more, do not list centres: summarise using the exact counts in matchesByOperator and matchesByTown (e.g. \"Busy Bees run 7 of them\") and any common offers.",
    "meals or transport of 'unknown' means not known, not 'no'. A centre marked inspiredCentre is one of ours, not a competitor.",
    "With no matches, say none were found and suggest checking the spelling or asking more broadly. If the data cannot answer, say what is missing.",
    "Write in New Zealand English: plain, direct, at most five short sentences or a short list with \"-\" bullets. Plain text only: no bold, headings or other markdown. Never show JSON, field names or code.",
  ].join("\n");
}

export function buildSectorAiChatMessages(
  context: ReturnType<typeof buildSectorAiContext>,
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
): AiChatMessage[] {
  return [
    { role: "system", content: buildSectorSystemPrompt() },
    { role: "user", content: `Sector Insight data JSON:\n${JSON.stringify(context)}` },
    ...sanitizeChatHistory(history).slice(-4),
    { role: "user", content: prompt },
  ];
}

// Without the local model the reply is the app's own reading of the question.
export function buildSectorFallbackAnswer(plan: SectorChatPlan, centres: SectorCentreView[]): string {
  if (!plan.results) {
    const overview = summariseSector(centres);
    return `The local AI isn't available right now. The database holds ${overview.competitorCount} competitor services: ${overview.withActivePromotion} running a promotion, ${overview.providingMeals} providing meals and ${overview.providingTransport} providing transport. Ask about a town, operator, meals, transport or promotions to see the list.`;
  }
  const total = plan.results.total;
  return total === 0
    ? `No centres match (${plan.results.description}).`
    : `${total} centre${total === 1 ? "" : "s"} match (${plan.results.description}). The list is below.`;
}
