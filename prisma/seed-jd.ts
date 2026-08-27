// One-off seed for the Job Descriptions feature: KTCA pay scales, Teacher /
// Head Teacher / Part-time Teacher / Administrator title profiles, and the
// centre profiles with values already known from the current PD PDFs.
// Run with: npx tsx prisma/seed-jd.ts

import { prisma } from "../src/db.js";

const K1_STEPS_APR2026 = [
  62862, 65685, 68251, 72548, 77224, 82230, 88276, 93234, 100368, 105686,
];
const K1_STEPS_JAN2027 = [
  64119, 66999, 69616, 73999, 78768, 83874, 90042, 95099, 102475, 107886,
];

async function seedPayScales() {
  const rows: { scaleKey: string; step: number | null; effectiveFrom: Date; annualRate: number; sourceDocument: string }[] = [];
  const sourceDocument = "Kindergarten Teachers' Collective Agreement 2026-2028.pdf";

  K1_STEPS_APR2026.forEach((rate, index) => {
    rows.push({ scaleKey: "K1", step: index + 1, effectiveFrom: new Date("2026-04-02"), annualRate: rate, sourceDocument });
  });
  K1_STEPS_JAN2027.forEach((rate, index) => {
    rows.push({ scaleKey: "K1", step: index + 1, effectiveFrom: new Date("2027-01-28"), annualRate: rate, sourceDocument });
  });

  const flatScales: { scaleKey: string; rates: { effectiveFrom: string; rate: number }[] }[] = [
    {
      scaleKey: "K2",
      rates: [
        { effectiveFrom: "2026-04-02", rate: 110356 },
        { effectiveFrom: "2026-06-29", rate: 113356 },
        { effectiveFrom: "2027-01-28", rate: 115736 },
        { effectiveFrom: "2027-06-29", rate: 116736 },
      ],
    },
    {
      scaleKey: "K2R",
      rates: [
        { effectiveFrom: "2026-04-02", rate: 108356 },
        { effectiveFrom: "2026-06-29", rate: 111356 },
        { effectiveFrom: "2027-01-28", rate: 113736 },
        { effectiveFrom: "2027-06-29", rate: 114736 },
      ],
    },
  ];

  for (const scale of flatScales) {
    for (const entry of scale.rates) {
      rows.push({
        scaleKey: scale.scaleKey,
        step: null,
        effectiveFrom: new Date(entry.effectiveFrom),
        annualRate: entry.rate,
        sourceDocument,
      });
    }
  }

  // Prisma's compound @@unique can't match a null `step` (flat scales), so
  // upsert manually via findFirst instead of the generated composite key.
  for (const row of rows) {
    const existing = await prisma.jdPayScale.findFirst({
      where: { scaleKey: row.scaleKey, step: row.step, effectiveFrom: row.effectiveFrom },
      select: { id: true },
    });
    if (existing) {
      await prisma.jdPayScale.update({
        where: { id: existing.id },
        data: { annualRate: row.annualRate, sourceDocument: row.sourceDocument },
      });
    } else {
      await prisma.jdPayScale.create({ data: row });
    }
  }

  await prisma.jdAgreement.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Kindergarten Teachers' Collective Agreement 2026-2028",
      fileName: sourceDocument,
      effectiveFrom: new Date("2026-04-02"),
      expiresOn: new Date("2028-12-28"),
    },
  });

  console.log(`Seeded ${rows.length} pay-scale rows + 1 agreement.`);
}

const TEACHER_ROLE_SECTIONS = [
  {
    heading: "FUNDAMENTALS",
    bullets: [
      { text: "Embody Inspired Kindergarten values" },
      { text: "Commitment through Te Tiriti o Waitangi partnership." },
      { text: "Value learner identities, language and culture." },
      { text: "Understand diverse needs of learners." },
      { text: "Build respectful relationships." },
      { text: "Partner with whānau and communities." },
      { text: "Act with professional integrity." },
    ],
  },
  {
    heading: "LEARNING",
    bullets: [
      { text: "Know curriculum and content." },
      { text: "Understand how learners learn." },
      { text: "Plan purposeful learning." },
      { text: "Teach using evidence-informed practice." },
      { text: "Differentiate for learner needs." },
      { text: "Foster literacy and numeracy." },
      { text: "Support learner agency." },
      { text: "Assess for learning." },
      { text: "Use feedback to improve outcomes." },
    ],
  },
  {
    heading: "OPERATIONS",
    bullets: [
      { text: "Create safe learning environments." },
      { text: "Promote positive behaviour." },
      { text: "Use technology responsibly." },
      { text: "Maintain effective learning environments." },
      { text: "Respond to learner progress." },
      { text: "Collaborate to support learners." },
      { text: "Support quality practice." },
    ],
  },
  {
    heading: "DISPOSITIONS",
    bullets: [
      { text: "Reflect on professional practice." },
      { text: "Engage in ongoing learning." },
      { text: "Seek and apply feedback." },
      { text: "Share professional expertise." },
      { text: "Communicate professionally." },
      { text: "Commit to continuous improvement." },
    ],
  },
];

const HEAD_TEACHER_ROLE_SECTIONS = [
  {
    heading: "FUNDAMENTALS",
    bullets: [
      { text: "Embody Inspired Kindergarten values." },
      { text: "Lead with integrity and empathy." },
      { text: "Champion Te Tiriti o Waitangi." },
      { text: "Foster culturally responsive practice." },
    ],
  },
  {
    heading: "LEARNING",
    bullets: [
      { text: "Promote equitable learner outcomes." },
      { text: "Inspire continuous improvement." },
      { text: "Make evidence-informed decisions." },
      { text: "Evaluate practice for impact." },
      { text: "Develop leadership in others." },
      { text: "Model reflective practice." },
    ],
  },
  {
    heading: "RELATIONAL LEADERSHIP",
    bullets: [
      { text: "Build high-trust relationships." },
      { text: "Strengthen whānau and community partnerships." },
      { text: "Build collaborative professional teams." },
      { text: "Contribute to the wider education community." },
    ],
  },
  {
    heading: "OPERATIONS",
    bullets: [
      { text: "Lead strategically with vision." },
      { text: "Manage resources effectively." },
      { text: "Ensure quality and compliance." },
      { text: "Support staff growth and wellbeing." },
    ],
  },
  {
    heading: "DISPOSITIONS",
    bullets: [
      { text: "Encourage innovation and initiative." },
      { text: "Demonstrate resilience and optimism." },
      { text: "Show professional courage." },
      { text: "Commit to lifelong learning." },
    ],
  },
];

const ADMINISTRATOR_ROLE_SECTIONS = [
  {
    heading: "Core duties",
    intro:
      "The Administrator is primarily responsible for ensuring that INFOCARE is kept up to date with all roll, staff and other requirements for the respective Kindergarten. The core duties of the role are as follows:",
    bullets: [
      { text: "Ensuring INFOCARE is up-to-date and information is loaded correctly", boldLeadIn: "" },
      {
        boldLeadIn: "Liaising with Parents and Head Teacher on enrolments / roll and donations -",
        text: "Communication skills need to be at a consistently high level to ensure clear understanding is in place.",
      },
      {
        boldLeadIn: "Donations, Fees and Statements -",
        text: "Monthly review with Head Teacher to review donations. Sending Donation and/or Fee Statements on a fortnightly basis to families.",
      },
      {
        boldLeadIn: "Enrolment Form -",
        text: "Ensuring all enrolments are completed and loaded, and parents have attested their 20 hours ECE to the Kindergarten.",
      },
      {
        boldLeadIn: "Waiting List Management -",
        text: "Managing and following up on waiting list on a fortnightly basis, updating Head Teacher on a minimum monthly basis.",
      },
    ],
  },
  {
    heading: "Other duties",
    bullets: [
      {
        boldLeadIn: "First Point of Contact -",
        text: "Often an Administrator will be the first point of contact for families, so a professional and friendly manner is important.",
      },
      { boldLeadIn: "Key Teacher Lists", text: "are maintained" },
      { boldLeadIn: "Children Portfolios -", text: "Administrative set-up of portfolio's" },
      { boldLeadIn: "Purchasing/ Ordering and reconciliation -", text: "On instructions from Head Teacher." },
      {
        boldLeadIn: "Invoices –",
        text: "Where required, ensuring all invoices are returned to the iOffice before the 20th of the month to ensure prompt payment.",
      },
      {
        boldLeadIn: "Newsletter -",
        text: "Assist collating the newsletter with content provided by the Teaching Team, and approved by the Head Teacher.",
      },
    ],
  },
  {
    heading: "REQUIRED SKILLS",
    bullets: [
      { text: "Ability to learn and use INFOCARE" },
      { text: "High level of attention to detail" },
      { text: "Strong Computer Skills (including Word and Excel)" },
      { text: "Ability to relate to a variety of people" },
      { text: "Excellent Communication Skills" },
      { text: "Excellent Organisational skills" },
      { text: "Problem solving" },
    ],
  },
];

async function seedTitleProfiles() {
  await prisma.jdTitleProfile.upsert({
    where: { jobTitle: "Teacher" },
    update: {},
    create: {
      jobTitle: "Teacher",
      sortOrder: 1,
      jobCategory: "K1",
      payScaleKey: "K1",
      layoutVariant: "standard",
      defaultPositionType: "Full Time",
      agreementText: "Kindergarten Teachers Collective Agreement",
      qualificationsText:
        "A Diploma of Teaching ECE (or equivalent) is a minimum, but a Bachelors Degree of Education or higher is desirable together with Full or Provisional Teacher Registration.",
      roleSections: TEACHER_ROLE_SECTIONS,
    },
  });

  await prisma.jdTitleProfile.upsert({
    where: { jobTitle: "Head Teacher" },
    update: {},
    create: {
      jobTitle: "Head Teacher",
      sortOrder: 2,
      jobCategory: "K2",
      payScaleKey: "K2",
      layoutVariant: "standard",
      defaultPositionType: "Head Teacher Full Time",
      agreementText: "Kindergarten Teachers Collective Agreement",
      qualificationsText:
        "Preferably a Masters of Education (ECE) or equivalent. A lesser ECE qualification may be acceptable. Full Teacher Registration. A current First Aid Certificate.",
      roleSections: HEAD_TEACHER_ROLE_SECTIONS,
    },
  });

  await prisma.jdTitleProfile.upsert({
    where: { jobTitle: "Administrator" },
    update: {},
    create: {
      jobTitle: "Administrator",
      sortOrder: 3,
      jobCategory: "Administration",
      payScaleKey: null,
      layoutVariant: "administrator",
      defaultPositionType: "Part-time",
      agreementText: "",
      qualificationsText: "",
      roleSections: ADMINISTRATOR_ROLE_SECTIONS,
      extras: { positionHours: "12 Hours (as per Employment Agreement)", reportsTo: "Head Teacher" },
    },
  });

  // Part-time Teacher reuses the Teacher qualifications/role sections (K1,
  // Position Type defaults to Part-time with FTE) per PLAN.md open inputs.
  await prisma.jdTitleProfile.upsert({
    where: { jobTitle: "Part-time Teacher" },
    update: {},
    create: {
      jobTitle: "Part-time Teacher",
      sortOrder: 4,
      jobCategory: "K1",
      payScaleKey: "K1",
      layoutVariant: "standard",
      defaultPositionType: "Part-time",
      agreementText: "Kindergarten Teachers Collective Agreement",
      qualificationsText:
        "A Diploma of Teaching ECE (or equivalent) is a minimum, but a Bachelors Degree of Education or higher is desirable together with Full or Provisional Teacher Registration.",
      roleSections: TEACHER_ROLE_SECTIONS,
    },
  });

  console.log("Seeded 4 title profiles.");
}

async function seedCentreProfiles() {
  const known: {
    centreKey: number;
    locationDisplay: string;
    introParagraph: string;
    seniorTeacherName: string;
    seniorTeacherAcronym: string;
  }[] = [
    {
      centreKey: 115, // Paengaroa
      locationDisplay: "PAENGAROA Kindergarten",
      introParagraph:
        "This kindergarten currently operates Monday to Friday 8:30am to 2:30pm. The kindergarten's current maximum roll is 43 over two.",
      seniorTeacherName: "Vilna Van Rensburg",
      seniorTeacherAcronym: "VVR",
    },
    {
      centreKey: 113, // Maungatapu
      locationDisplay: "MAUNGATAPU Kindergarten",
      introParagraph: "",
      seniorTeacherName: "Vilna Van Rensburg",
      seniorTeacherAcronym: "VVR",
    },
    {
      centreKey: 6200000, // OPEYS
      locationDisplay: "OPEYS Kindergarten",
      introParagraph: "",
      seniorTeacherName: "Haylee Dumbar",
      seniorTeacherAcronym: "HD",
    },
  ];

  for (const centre of known) {
    await prisma.jdCentreProfile.upsert({
      where: { centreKey: centre.centreKey },
      update: {},
      create: centre,
    });
  }

  console.log(`Seeded ${known.length} known centre profiles.`);
}

// Confirmed by name against "Current/OLD Kindergarten Website Blurbs.pdf" — only
// centres whose own live blurb text explicitly claims Enviroschools/Enviro-Kindergarten
// status. Paengaroa and others were checked and do NOT mention it; leave unlisted
// centres at the isEnviroschool schema default (false) rather than guessing.
const ENVIROSCHOOL_CENTRE_NAMES = [
  "Arataki  Kindergarten", // "proud Enviroschool"
  "Gwen Rogers  Kindergarten", // Enviro Schools Green Gold award
  "Karamuramu Kindergarten", // Bronze Enviroschools Kindergarten
  "Katikati  Kindergarten", // "Beyond Green-Gold" Enviro-Kindergarten
  "Papamoa Coast Kindergarten", // Green Gold Enviro School
  "Papamoa Kindergarten", // Green-Gold EnviroSchools status
  "Waihi Kindergarten", // Silver Enviroschools Reflection
  "Welcome Bay Kindergarten", // Green Gold EnviroKindergarten
];

// Centre names already end in "Kindergarten"; appending another (and
// upper-casing) produced e.g. "GWEN ROGERS  KINDERGARTEN Kindergarten".
function seedLocationDisplay(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  return /\s*kindergarten$/i.test(cleaned) ? cleaned : `${cleaned} Kindergarten`;
}

async function seedEnviroschoolFlags() {
  const rows = await prisma.centreReference.findMany({
    where: { name: { in: ENVIROSCHOOL_CENTRE_NAMES } },
    select: { centreKey: true, name: true },
  });
  const foundNames = new Set(rows.map((r) => r.name));
  const missing = ENVIROSCHOOL_CENTRE_NAMES.filter((n) => !foundNames.has(n));
  if (missing.length > 0) {
    console.warn(`Enviroschool seed: no CentreReference match for: ${missing.join(", ")}`);
  }
  for (const row of rows) {
    await prisma.jdCentreProfile.upsert({
      where: { centreKey: row.centreKey },
      update: { isEnviroschool: true },
      create: { centreKey: row.centreKey, locationDisplay: seedLocationDisplay(row.name), isEnviroschool: true },
    });
  }
  console.log(`Seeded isEnviroschool=true for ${rows.length} centres.`);
}

async function main() {
  await seedPayScales();
  await seedTitleProfiles();
  await seedCentreProfiles();
  await seedEnviroschoolFlags();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
