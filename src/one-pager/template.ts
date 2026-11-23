// Info Sheets: the shared template's words and the rules that turn a
// kindergarten's stored fields into what goes on its page. Pure functions;
// the layout itself is in src/ui/one-pager-pdf.ts.

export const ONE_PAGER_SLOTS = ["photo1", "photo2", "photo3", "team"] as const;
export type OnePagerSlot = (typeof ONE_PAGER_SLOTS)[number];

export function isOnePagerSlot(value: unknown): value is OnePagerSlot {
  return (ONE_PAGER_SLOTS as readonly string[]).includes(String(value));
}

// Width / height of each photo slot, so a photo is cropped to fit before it
// is uploaded and the page never stretches one.
export const ONE_PAGER_SLOT_RATIO: Record<OnePagerSlot, number> = {
  photo1: 172.4 / 120.6,
  photo2: 172.4 / 120.6,
  photo3: 172.4 / 120.6,
  team: 4 / 3,
};

export const ONE_PAGER_SLOT_LABEL: Record<OnePagerSlot, string> = {
  photo1: "Photo 1",
  photo2: "Photo 2",
  photo3: "Photo 3",
  team: "Team photo",
};

// The two ways our services run. A kindergarten has sessions in school hours
// and asks for donations; an All Day service runs long days and charges fees.
// The model picks which shared cost and enrolment text a service uses. Hours
// differ from service to service whatever the model, so they are always its own.
export const ONE_PAGER_SERVICE_MODELS = ["kindergarten", "all-day"] as const;
export type OnePagerServiceModel = (typeof ONE_PAGER_SERVICE_MODELS)[number];

export const ONE_PAGER_SERVICE_MODEL_LABEL: Record<OnePagerServiceModel, string> = {
  kindergarten: "Kindergarten (donations)",
  "all-day": "All Day (fees)",
};

export function resolveOnePagerServiceModel(value: unknown): OnePagerServiceModel {
  return value === "all-day" ? "all-day" : "kindergarten";
}

// What a service starts as: the All Day ones say so in their name.
export function defaultOnePagerServiceModel(name: string): OnePagerServiceModel {
  return /\ball\s+day\b/i.test(name) ? "all-day" : "kindergarten";
}

export type OnePagerTemplateText = {
  tagline: string;
  website: string;
  costText: string;
  teachersText: string;
  enrolText: string;
  allDayCostText: string;
  allDayEnrolText: string;
};

// Which shared text a service of this model uses for the two sections that
// differ between the models.
export function sharedTextKeys(model: OnePagerServiceModel): { cost: keyof OnePagerTemplateText; enrol: keyof OnePagerTemplateText } {
  return model === "all-day" ? { cost: "allDayCostText", enrol: "allDayEnrolText" } : { cost: "costText", enrol: "enrolText" };
}

// The shared text a new install starts with, from the 2023 info sheets.
export const DEFAULT_ONE_PAGER_TEMPLATE: OnePagerTemplateText = {
  tagline: "Making the early years count",
  website: "www.inspiredkindergartens.nz",
  costText:
    "We receive government funding that meets some of our ongoing costs. Requested donations are based on the following scale: $6 per part day session or $8 for a full day. Donations help to maintain the buildings, purchase resources and equipment and pay ongoing expenses. All children receive up to 30 hours ECE free per week.",
  teachersText: "Yes. All of our teachers are 100% trained, registered and supported by senior teachers.",
  enrolText:
    "Children can enrol from two years of age, however the starting age will depend on the current waiting list. You are welcome to come and visit, and fill in an enrolment form. Please bring a copy of your child's birth certificate.",
  // From the Maunganui All Day Kindergarten sheet.
  allDayCostText:
    "• Our fees are $6.50 per hour\n• 3-5 year olds receive 20 hours free\n• Optional extra charge of $1 per hour\n• One off admin fee of $50 on enrolment\n• Daily and weekly rates available on application\n• WINZ subsidies available",
  allDayEnrolText:
    "We care for children from 1 year to school age. You are welcome to come and visit, and fill in an enrolment form. Please bring a copy of your child's birth certificate.",
};

// A kindergarten's own fields, as stored.
export type OnePagerFields = {
  aboutUs: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  costOverride: string;
  teachersOverride: string;
  enrolOverride: string;
  teamCaption: string;
};

export const EMPTY_ONE_PAGER_FIELDS: OnePagerFields = {
  aboutUs: "",
  address: "",
  phone: "",
  email: "",
  hours: "",
  costOverride: "",
  teachersOverride: "",
  enrolOverride: "",
  teamCaption: "",
};

export const ONE_PAGER_FIELD_MAX: Record<keyof OnePagerFields, number> = {
  aboutUs: 3000,
  address: 200,
  phone: 60,
  email: 200,
  hours: 600,
  costOverride: 1200,
  teachersOverride: 600,
  enrolOverride: 1200,
  teamCaption: 400,
};

export const ONE_PAGER_TEMPLATE_MAX: Record<keyof OnePagerTemplateText, number> = {
  tagline: 60,
  website: 200,
  costText: 1200,
  teachersText: 600,
  enrolText: 1200,
  allDayCostText: 1200,
  allDayEnrolText: 1200,
};

// Typed text as stored: Windows line ends become \n, trailing spaces go, no
// more than one blank line in a row, cut to the field's limit.
export function cleanOnePagerText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// Only the fields present in `input` are returned, so a save of one section
// leaves the others alone.
export function cleanOnePagerFields(input: Record<string, unknown>): Partial<OnePagerFields> {
  const fields: Partial<OnePagerFields> = {};
  for (const key of Object.keys(ONE_PAGER_FIELD_MAX) as Array<keyof OnePagerFields>) {
    if (input[key] !== undefined) fields[key] = cleanOnePagerText(input[key], ONE_PAGER_FIELD_MAX[key]);
  }
  return fields;
}

export function cleanOnePagerTemplate(input: Record<string, unknown>): Partial<OnePagerTemplateText> {
  const fields: Partial<OnePagerTemplateText> = {};
  for (const key of Object.keys(ONE_PAGER_TEMPLATE_MAX) as Array<keyof OnePagerTemplateText>) {
    if (input[key] !== undefined) fields[key] = cleanOnePagerText(input[key], ONE_PAGER_TEMPLATE_MAX[key]);
  }
  return fields;
}

export type AboutBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };

const BULLET = /^\s*[-•*]\s+/;

// About us as typed: a blank line starts a new paragraph, and lines starting
// with "-", "•" or "*" are a bullet list.
export function parseAboutUs(text: string): AboutBlock[] {
  const blocks: AboutBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list.length) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (BULLET.test(line)) {
      if (paragraph.length) flush();
      list.push(line.replace(BULLET, ""));
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export type OnePagerSection = { heading: string; text: string };

// Everything the page shows as words, with shared text filled in wherever
// the kindergarten has no override.
export type OnePagerContent = {
  // The one exception to the shared design: Tai o Fenua's own artwork. Its
  // logo sits beside ours at the top and its hibiscus in the half-circle at
  // the foot. Everything else on its page is the template.
  ownLogo?: "tai-o-fenua";
  name: string;
  tagline: string;
  about: AboutBlock[];
  teamCaption: string;
  sections: OnePagerSection[];
};

export function resolveOnePagerContent(
  name: string,
  fields: OnePagerFields,
  template: OnePagerTemplateText,
  serviceModel: OnePagerServiceModel = defaultOnePagerServiceModel(name),
): OnePagerContent {
  const contact = [fields.address, fields.phone, fields.email, template.website].map((line) => line.trim()).filter(Boolean).join("\n");
  const shared = sharedTextKeys(serviceModel);
  const sections: OnePagerSection[] = [
    { heading: "Contact us", text: contact },
    { heading: "Hours", text: fields.hours },
    { heading: "How much does it cost?", text: fields.costOverride || template[shared.cost] },
    { heading: "Are the teachers trained?", text: fields.teachersOverride || template.teachersText },
    { heading: "How do I enrol my child?", text: fields.enrolOverride || template[shared.enrol] },
  ];
  return {
    ...(/^tai\s+o\s+fenua\b/i.test(name.trim()) ? { ownLogo: "tai-o-fenua" as const } : {}),
    name: name.trim(),
    tagline: template.tagline.trim(),
    about: parseAboutUs(fields.aboutUs),
    teamCaption: fields.teamCaption.trim(),
    // A section with nothing in it is left off the page, heading and all.
    sections: sections.filter((section) => section.text.trim().length > 0),
  };
}

// Downloads use the Info Sheet name and date.
export function onePagerFilename(name: string, date: Date): string {
  const month = date.toLocaleDateString("en-NZ", { month: "short", timeZone: "Pacific/Auckland" }).replace(".", "");
  const year = date.toLocaleDateString("en-NZ", { year: "numeric", timeZone: "Pacific/Auckland" });
  const safeName = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Kindergarten";
  return `${safeName} Info Sheet ${month} ${year}.pdf`;
}
