// The "Draft with AI" button on an info sheet's About us: a draft written only
// from what is in the About us box (the user's notes or pasted website text)
// and what the app holds about that kindergarten (its website text and Job
// Description intro). The draft goes into the editor; nothing is saved until
// the user saves it.
import type { AiChatMessage } from "./client.js";

export type OnePagerAboutInput = {
  centreName: string;
  // Factual flag from the centre's Job Description profile, never inferred.
  isEnviroschool: boolean;
  introParagraph: string;
  currentWebsiteHtml: string | null;
  oldWebsiteHtml: string | null;
  // What is in the About us box when the button is pressed: the user's own
  // notes or pasted website text, to be written up.
  notes: string;
};

// No other kindergarten's About us is given as an example: when it was, the
// model carried their values and lists into this one (seen 2026-11-15).

const REFERENCE_MAX_CHARS = 5000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function hasOnePagerAboutSource(input: OnePagerAboutInput): boolean {
  return Boolean(input.notes.trim() || input.currentWebsiteHtml?.trim() || input.oldWebsiteHtml?.trim() || input.introParagraph.trim());
}

export function buildOnePagerAboutSystemPrompt(isEnviroschool: boolean): string {
  return [
    "You write the 'About us' section of a one-page flyer for a kindergarten of Inspired Kindergartens (community kindergartens in the Bay of Plenty, New Zealand). Parents choosing a kindergarten read it.",
    "Write only from the reference material supplied for this kindergarten. Never invent a fact, value, programme, award, accreditation, affiliation, place name or number. If the material does not say it, leave it out.",
    "Copy any te reo Māori words exactly as the reference material writes them. Do not add te reo Māori words, values or sayings that are not in it.",
    isEnviroschool
      ? "FACT: this kindergarten IS a registered Enviroschool. You may say so."
      : "FACT: this kindergarten is NOT a registered Enviroschool. Do not mention Enviroschools or any environmental accreditation.",
    "Do not write about hours, costs, donations, free hours, teacher qualifications, enrolment or contact details: the flyer has its own sections for those.",
    "Write in the first person plural ('we', 'our'), warm and plain. New Zealand English.",
    "Every sentence must come from the reference material. Do not add values, qualities, beliefs or general statements about children or learning that the material does not state. If the material is short, write a short section; never pad it out.",
    "Length: at most 160 words in 2 to 4 short paragraphs, with a blank line between paragraphs. Use a list (one item per line starting with '- ') only when the material itself lists things such as values.",
    "Output the text only. No heading, no title, no quotation marks, no markdown, no HTML.",
  ].join("\n");
}

export function buildOnePagerAboutUserPrompt(input: OnePagerAboutInput): string {
  const parts: string[] = [`Write the About us section for ${input.centreName}.`];

  if (input.notes.trim()) {
    parts.push("", `Notes about ${input.centreName} from the marketing team (main source; keep every fact in them that fits):`, input.notes.trim().slice(0, REFERENCE_MAX_CHARS));
  }
  if (input.currentWebsiteHtml?.trim()) {
    parts.push("", `${input.centreName} current website text (main source):`, stripHtml(input.currentWebsiteHtml).slice(0, REFERENCE_MAX_CHARS));
  }
  if (input.oldWebsiteHtml?.trim()) {
    parts.push("", `${input.centreName} older website text (secondary source):`, stripHtml(input.oldWebsiteHtml).slice(0, REFERENCE_MAX_CHARS));
  }
  if (input.introParagraph.trim()) {
    parts.push("", `${input.centreName} job description intro (secondary source):`, input.introParagraph.trim());
  }

  parts.push(
    "",
    "Write the About us section now. Say only what the sources above say, in better words. When the sources are used up, stop: do not add a closing paragraph about values, philosophy, partnership or commitment unless the sources state it.",
  );
  return parts.join("\n");
}

export function buildOnePagerAboutMessages(input: OnePagerAboutInput): AiChatMessage[] {
  return [
    { role: "system", content: buildOnePagerAboutSystemPrompt(input.isEnviroschool) },
    { role: "user", content: buildOnePagerAboutUserPrompt(input) },
  ];
}

// The model's reply as editor text: no heading line, markdown marks or
// wrapping quotes; bullets as "- ".
export function cleanOnePagerAboutDraft(reply: string): string {
  return reply
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*#{1,6}\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[•*]\s+/, "- ").trimEnd())
    .filter((line, index) => !(index === 0 && /^about us:?$/i.test(line.trim())))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .trim();
}
