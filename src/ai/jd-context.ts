import type { AiChatMessage } from "./client.js";
import type {
  JdKnowledgeDocView,
  JdBlurbVersion,
  JdIntroParagraphExample,
  JobDescriptionView,
} from "../storage/jd-store.js";
import { formatNzClosingDate } from "../ui/jd/jd-date.js";
import { formatJdLocationDisplay } from "../ui/jd/jd-email.js";

// AI blurb generation for a Job Description's website vacancy blurb. The
// prompt asks for the variable editorial section only. The immovable
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
  fallbackBlurbs: JdBlurbVersion[]; // other-centre examples, style only
  isEnviroschool: boolean; // factual per-centre flag from JdCentreProfile, never inferred by the AI
};

export type JdIntroInfocareFacts = {
  snapshotDate: string;
  enrolledCount: number;
  enrolledFteCount: number;
  licensedCapacity: number;
  licensedUnder2Capacity: number | null;
  licensedOver2Capacity: number | null;
};

export type JdIntroContextInput = {
  jobDescription: JobDescriptionView;
  centreName: string;
  currentServiceDoc: JdKnowledgeDocView | null;
  oldServiceDoc: JdKnowledgeDocView | null;
  infocareFacts: JdIntroInfocareFacts | null;
  centreExamples: JdIntroParagraphExample[];
  fallbackExamples: JdIntroParagraphExample[];
};

// The fixed closing sentences appended below the AI-generated editorial
// section. Rendered as a locked block in the blurb editor; included in
// copy-to-clipboard.
export function buildImmovableBoilerplateHtml(jobDescription: JobDescriptionView, jdPdfUrl: string): string {
  const closing = formatNzClosingDate(jobDescription.closingAt);
  const location = formatJdLocationDisplay(jobDescription.locationDisplay);
  return [
    "<p><em>The terms and conditions of the Kindergarten Teachers Collective Agreement will apply. Inspired Kindergartens offers excellent employment conditions, supportive colleagues and a wide range of professional learning opportunities. By applying for this role you acknowledge that you are eligible to work in New Zealand. If you are not eligible to work in New Zealand then do not apply.</em></p>",
    `<p><a href="${jdPdfUrl}">Job Description - Full time - Teacher / Kaiako ${location}</a></p>`,
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

export function buildJdIntroSystemPrompt(): string {
  return [
    "You write the intro paragraph for Inspired Kindergartens job description PDFs.",
    "Output one plain-text paragraph only. No HTML, markdown, heading, bullets, or quotation marks.",
    "The paragraph should be concise and suitable for a formal job description, normally one or two sentences.",
    "Never invent centre operating data such as FTE, opening hours, licensed roll/capacity, age ranges, session times, or fee/free-hours claims.",
    "Use FTE only from the selected job description fields. Use roll/capacity/enrolment only from Infocare facts. Use opening hours/session times/free-hours claims only from the selected centre's current or old website reference.",
    "Historical examples from other centres are style examples only. Do not copy their centre facts, hours, roll, FTE, affiliations, names, or local claims.",
    "If no sourced centre operating facts are available, write a generic centre-specific intro using only the centre name and role context.",
  ].join("\n");
}

function formatIntroExample(example: JdIntroParagraphExample, index: number): string {
  const centre = example.centreName ? ` (${example.centreName})` : "";
  return `Example ${index + 1}${centre}: ${example.introParagraph}`;
}

export function buildJdIntroUserPrompt(input: JdIntroContextInput): string {
  const jd = input.jobDescription;
  const parts: string[] = [
    "Write the Job Description intro paragraph for this role.",
    `Job Title: ${jd.jobTitle}`,
    `Centre: ${input.centreName} (${jd.locationDisplay})`,
    `Position Type sourced from this JD: ${jd.positionType}${jd.fte ? ` (${jd.fte} FTE)` : ""}`,
  ];

  if (input.infocareFacts) {
    parts.push(
      "",
      "Infocare facts for this centre (allowed source for roll/capacity/enrolment only):",
      `Snapshot date: ${input.infocareFacts.snapshotDate}`,
      `Enrolled headcount: ${input.infocareFacts.enrolledCount}`,
      `Enrolled FTE: ${input.infocareFacts.enrolledFteCount}`,
      `Licensed capacity: ${input.infocareFacts.licensedCapacity}`,
      input.infocareFacts.licensedUnder2Capacity != null
        ? `Licensed under-2 capacity: ${input.infocareFacts.licensedUnder2Capacity}`
        : "",
      input.infocareFacts.licensedOver2Capacity != null
        ? `Licensed over-2 capacity: ${input.infocareFacts.licensedOver2Capacity}`
        : "",
    );
  } else {
    parts.push("", "No Infocare facts were available. Do not mention roll, capacity, enrolled count, or enrolled FTE.");
  }

  if (input.currentServiceDoc) {
    parts.push("", "Selected centre current website reference (allowed source for opening hours/session/free-hours claims):", stripHtml(input.currentServiceDoc.contentHtml));
  }

  if (input.oldServiceDoc) {
    parts.push("", "Selected centre older website reference (secondary source for opening hours/session/free-hours claims):", stripHtml(input.oldServiceDoc.contentHtml));
  }

  if (!input.currentServiceDoc && !input.oldServiceDoc) {
    parts.push("", "No selected-centre website reference was supplied. Do not mention opening hours, session times, age ranges, or fee/free-hours claims.");
  }

  if (input.centreExamples.length > 0) {
    parts.push(
      "",
      "Historical intro paragraphs for this centre (primary style/reference examples):",
      ...input.centreExamples.slice(0, 3).map(formatIntroExample),
    );
  } else if (input.fallbackExamples.length > 0) {
    parts.push(
      "",
      "No historical intro exists for this centre. Use these other-centre intro paragraphs for structure and tone only, not facts:",
      ...input.fallbackExamples.slice(0, 4).map(formatIntroExample),
    );
  }

  parts.push(
    "",
    "Write a polished intro paragraph now. Include only facts that are explicitly sourced above.",
  );

  return parts.filter(Boolean).join("\n");
}

export function buildJdIntroChatMessages(input: JdIntroContextInput): AiChatMessage[] {
  return [
    { role: "system", content: buildJdIntroSystemPrompt() },
    { role: "user", content: buildJdIntroUserPrompt(input) },
  ];
}

export function buildJdBlurbSystemPrompt(isEnviroschool: boolean): string {
  return [
    "You write website vacancy blurbs for Inspired Kindergartens (a New Zealand ECE kindergarten association).",
    "You write only the variable, editorial section: a short headline plus a service-specific body in that centre's own established voice.",
    "Keep the centre's established taglines, pou/values, whakatauki, and factual claims (for example operating hours or free-hours offers) verbatim unless the job description fields explicitly contradict them.",
    "Never invent facts about the centre that are not present in the supplied reference material. This includes accreditations, awards, and affiliations; do not assume or guess them, even if they are common among similar kindergartens.",
    "Never invent centre operating data such as FTE, opening hours, licensed roll/capacity, age ranges, session times, or fee/free-hours claims. Use those details only when they are explicitly present in the selected job description fields or that centre's own current/old website reference. If they are absent, omit them.",
    "When examples from other centres are supplied, use them only for structure, tone, and level of detail. Do not copy their centre facts, hours, roll, FTE, affiliations, names, or local claims into the selected centre's blurb.",
    isEnviroschool
      ? "FACT: this centre IS a registered Enviroschool. You may mention this if it fits naturally."
      : "FACT: this centre is NOT a registered Enviroschool. Do NOT mention Enviroschools, sustainability accreditation, or any similar environmental affiliation under any circumstances, even if reference material for another centre or the generic text mentions it.",
    "Do NOT write any of the following; they are appended separately, verbatim, after your text: the KTCA terms/conditions sentence, the Job Description PDF link, the 'apply online' link, Start Date, Closing Date, or the 'Be at the cutting edge' tagline.",
    "Output clean HTML using only: h1, h2, h3, p, strong, em, ul, ol, li, a, br. No inline styles, no scripts, no other tags.",
  ].join("\n");
}

export function buildJdBlurbUserPrompt(input: JdBlurbContextInput): string {
  const jd = input.jobDescription;
  const parts: string[] = [];

  parts.push(
    "Generate a website vacancy blurb (editorial section only) for this role:",
    `Job Title: ${jd.jobTitle}`,
    `Centre: ${input.centreName} (${jd.locationDisplay})`,
    `Position Type sourced from this JD: ${jd.positionType}${jd.fte ? ` (${jd.fte} FTE)` : ""}`,
    jd.introParagraph
      ? `Selected-centre operating hours / roll source: ${jd.introParagraph}`
      : "Selected-centre operating hours / roll source: not supplied; do not mention hours, roll, capacity, or free-hours claims unless they appear in this centre's website references below.",
  );

  if (input.genericDoc) {
    parts.push("", "Inspired Kindergartens generic base text (tone/style reference):", stripHtml(input.genericDoc.contentHtml));
  }

  if (input.currentServiceDoc) {
    parts.push("", `${input.centreName} current website blurb (primary voice reference; match this centre's established voice):`, stripHtml(input.currentServiceDoc.contentHtml));
  }

  if (input.oldServiceDoc) {
    parts.push("", `${input.centreName} older website blurb (secondary reference):`, stripHtml(input.oldServiceDoc.contentHtml));
  }

  if (input.priorBlurbs.length > 0) {
    parts.push(
      "",
      "Previously generated/saved blurbs for this centre (for style consistency; vary the wording, don't repeat verbatim):",
      ...input.priorBlurbs.slice(0, 3).map((blurb, index) => `Version ${index + 1}:\n${stripHtml(blurb.contentHtml)}`),
    );
  } else if (input.fallbackBlurbs.length > 0) {
    parts.push(
      "",
      "No previously saved blurb exists for this centre. Use these other Inspired Kindergartens vacancy blurbs only as style/structure examples. Do not reuse their centre-specific facts:",
      ...input.fallbackBlurbs.slice(0, 4).map((blurb, index) => `Other-centre example ${index + 1}:\n${stripHtml(blurb.contentHtml)}`),
    );
  }

  parts.push(
    "",
    "Write a short headline (for example an <h2>) plus 2-4 short paragraphs or a bulleted 'you will' / 'we are looking for' list, in this centre's own voice. Do not include the boilerplate closing sentences listed in your instructions.",
  );

  return parts.filter(Boolean).join("\n");
}

export function buildJdBlurbChatMessages(input: JdBlurbContextInput): AiChatMessage[] {
  return [
    { role: "system", content: buildJdBlurbSystemPrompt(input.isEnviroschool) },
    { role: "user", content: buildJdBlurbUserPrompt(input) },
  ];
}
