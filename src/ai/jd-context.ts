import type { AiChatMessage } from "./client.js";
import type { JdKnowledgeDocView, JdBlurbVersion, JobDescriptionView } from "../storage/jd-store.js";

// AI blurb generation for a Job Description's website vacancy blurb. The
// prompt asks for the *variable, editorial* section only — the immovable
// boilerplate (KTCA sentence, JD/apply links, dates, tagline) is appended
// verbatim afterwards by buildImmovableBoilerplateHtml, never sent through
// the AI, so the model can't paraphrase or duplicate it.

export type JdBlurbContextInput = {
  jobDescription: JobDescriptionView;
  centreName: string;
  genericDoc: JdKnowledgeDocView | null;
  currentServiceDoc: JdKnowledgeDocView | null;
  oldServiceDoc: JdKnowledgeDocView | null;
  priorBlurbs: JdBlurbVersion[]; // most recent first
  isEnviroschool: boolean; // factual per-centre flag from JdCentreProfile — never inferred by the AI
};

function formatClosingDate(closingAt: string | null): string {
  if (!closingAt) return "";
  const date = new Date(closingAt);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timePart =
    minute === 0
      ? `${hour % 12 === 0 ? 12 : hour % 12}${hour >= 12 ? "pm" : "am"}`
      : `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
  return `${datePart} at ${timePart}`;
}

// The fixed closing sentences appended below the AI-generated editorial
// section — captured verbatim from the live vacancy pages (see PLAN.md §4).
// Rendered as a locked block in the blurb editor; included in copy-to-clipboard.
export function buildImmovableBoilerplateHtml(jobDescription: JobDescriptionView, jdPdfUrl: string): string {
  const closing = formatClosingDate(jobDescription.closingAt);
  return [
    "<p><em>The terms and conditions of the Kindergarten Teachers Collective Agreement will apply. Inspired Kindergartens offers excellent employment conditions, supportive colleagues and a wide range of professional learning opportunities.</em></p>",
    `<p><a href="${jdPdfUrl}">Job Description - Full time - Teacher / Kaiako ${jobDescription.locationDisplay}</a></p>`,
    `<p><a href="https://inspiredkindergartens.nz/employment-and-careers/how-to-apply/how-to-apply-kindergarten">Please apply online here</a></p>`,
    `<p><strong>Start Date: ${jobDescription.startDateText}</strong></p>`,
    closing ? `<p><strong>Closing Date: ${closing}</strong></p>` : "",
    "<p><strong><em>Be at the cutting edge &ndash; come work for Inspired Kindergartens</em></strong></p>",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildJdBlurbSystemPrompt(isEnviroschool: boolean): string {
  return [
    "You write website vacancy blurbs for Inspired Kindergartens (a New Zealand ECE kindergarten association).",
    "You write only the variable, editorial section: a short headline plus a service-specific body in that centre's own established voice.",
    "Keep the centre's established taglines, pou/values, whakataukī, and factual claims (e.g. operating hours, free-hours offer) verbatim unless the job description fields explicitly contradict them.",
    "Never invent facts about the centre that are not present in the supplied reference material. This includes accreditations, awards, and affiliations — do not assume or guess them, even if they are common among similar kindergartens.",
    isEnviroschool
      ? "FACT: this centre IS a registered Enviroschool. You may mention this if it fits naturally."
      : "FACT: this centre is NOT a registered Enviroschool. Do NOT mention Enviroschools, sustainability accreditation, or any similar environmental affiliation under any circumstances, even if reference material for another centre or the generic text mentions it.",
    "Do NOT write any of the following — they are appended separately, verbatim, after your text: the KTCA terms/conditions sentence, the Job Description PDF link, the 'apply online' link, Start Date, Closing Date, or the 'Be at the cutting edge' tagline.",
    "Output clean HTML using only: h1, h2, h3, p, strong, em, ul, ol, li, a, br. No inline styles, no scripts, no other tags.",
  ].join("\n");
}

export function buildJdBlurbUserPrompt(input: JdBlurbContextInput): string {
  const jd = input.jobDescription;
  const parts: string[] = [];

  parts.push(
    `Generate a website vacancy blurb (editorial section only) for this role:`,
    `Job Title: ${jd.jobTitle}`,
    `Centre: ${input.centreName} (${jd.locationDisplay})`,
    `Position Type: ${jd.positionType}${jd.fte ? ` (${jd.fte} FTE)` : ""}`,
    jd.introParagraph ? `Operating hours / roll: ${jd.introParagraph}` : "",
  );

  if (input.genericDoc) {
    parts.push("", "Inspired Kindergartens generic base text (tone/style reference):", stripHtml(input.genericDoc.contentHtml));
  }

  if (input.currentServiceDoc) {
    parts.push("", `${input.centreName} current website blurb (primary voice reference — match this centre's established voice):`, stripHtml(input.currentServiceDoc.contentHtml));
  }

  if (input.oldServiceDoc) {
    parts.push("", `${input.centreName} older website blurb (secondary reference):`, stripHtml(input.oldServiceDoc.contentHtml));
  }

  if (input.priorBlurbs.length > 0) {
    parts.push(
      "",
      "Previously generated/saved blurbs for this centre (for style consistency — vary the wording, don't repeat verbatim):",
      ...input.priorBlurbs.slice(0, 3).map((blurb, index) => `Version ${index + 1}:\n${stripHtml(blurb.contentHtml)}`),
    );
  }

  parts.push(
    "",
    "Write a short headline (e.g. an <h2>) plus 2-4 short paragraphs or a bulleted 'you will' / 'we are looking for' list, in this centre's own voice. Do not include the boilerplate closing sentences listed in your instructions.",
  );

  return parts.filter(Boolean).join("\n");
}

export function buildJdBlurbChatMessages(input: JdBlurbContextInput): AiChatMessage[] {
  return [
    { role: "system", content: buildJdBlurbSystemPrompt(input.isEnviroschool) },
    { role: "user", content: buildJdBlurbUserPrompt(input) },
  ];
}
