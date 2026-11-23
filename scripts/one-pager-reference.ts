// Reviewed originals in docs/One Pager: the original two references plus
// 24 imports in one-pager-import-data.json. OPEYS comes from its "1 Pager v2
// 18.2.21" file; the "OPEYS ... Infosheet A4_PRINT" file is not used, because
// it actually describes Matua. OPEYS's team photo there is a placeholder
// (another kindergarten's team, "Team photo to come!"), so it is not taken. Used by one-pager-seed.ts (into the database) and
// one-pager-sample.ts (a PDF to compare with the original).
//
// Spelling slips in the originals are corrected here: "Resililence",
// "enviroment" (twice) and "enroll".
import { join } from "node:path";
import importData from "./one-pager-import-data.json";

import type { OnePagerFields, OnePagerSlot } from "../src/one-pager/template.js";

export type OnePagerReference = {
  // Matches CentreReference.name (case-insensitive, "starts with").
  centreName: string;
  pdf: string;
  // 0-based index into the PDF's pictures, in drawing order.
  slots?: Record<OnePagerSlot, number>;
  // Visible photo rectangles in PDF points, including the source's clipping.
  photoBoxes?: Partial<Record<OnePagerSlot, number[]>>;
  fields: OnePagerFields;
};

const DIR = join("docs", "One Pager");
const SLOTS: Record<OnePagerSlot, number> = { photo1: 1, photo2: 2, photo3: 3, team: 4 };

export const ONE_PAGER_REFERENCES: OnePagerReference[] = [
  ...importData.map((entry) => ({ ...entry, pdf: join(DIR, entry.pdf) })),
  {
    centreName: "Avenues Kindergarten",
    pdf: join(DIR, "Avenues Kindergarten 1 Pager v10 Aug 2023.pdf"),
    slots: SLOTS,
    fields: {
      aboutUs: [
        "Avenues Kindergarten is a place of aroha / love, learning and enjoyment, a place where diversity is celebrated. Our kindergarten has an extra large, natural outdoor environment and is situated in a quiet central Tauranga location - ideal for children to play and learn in.",
        "We are committed to providing high quality early childhood education, placing a strong emphasis on the whanaungatanga / relationships we foster with children and families.",
        "We support children to develop a sense of themselves as learners through having fun, building confidence and growing their self-esteem. Children’s learning is nurtured through courage, curiosity, learner agency, resilience and auahatanga (creativity).",
        "We believe children are creative thinkers and active learners who should be listened to and given opportunities to share their thoughts, knowledge and ideas.",
      ].join("\n\n"),
      address: "27 Botanical Road, Tauranga",
      phone: "07 578 4481",
      email: "avenues@ikindergartens.nz",
      hours: "Part time: 8:30am - 12:30pm\nFull Day: 8:30am - 2:30pm\nExtended hours: 8:15am - 3:30pm\nMonday to Friday. Holiday programme available.",
      // Avenues charges for extended hours, so it keeps its own cost and
      // enrolment wording rather than the shared text.
      costOverride:
        "We receive government funding that meets some of our ongoing costs. The donations requested are based on the following scale: $6 per part day session or $8 for a full day. A separate fee of $10 is charged for extended hours. Donations help to maintain the buildings, purchase resources and equipment and pay ongoing expenses. All children receive up to 30 hours ECE free per week.",
      teachersOverride: "",
      enrolOverride:
        "Children can be enrolled from 2 years of age. You are welcome to come and visit, and fill in an enrolment form. Please bring a copy of your child’s birth certificate and immunisation record.",
      teamCaption: "Back Row: Jacqui Pritchard, Fran Drummond, Catherine Geddes and Shavaurn Bennett.\nFront Row: Sheree Morrow and Charlotte Quin.",
    },
  },
  {
    centreName: "Arataki Kindergarten",
    pdf: join(DIR, "Arataki Kindergarten 1 Pager v4_Aug 2023.pdf"),
    slots: SLOTS,
    fields: {
      aboutUs: [
        "Here in our place, relationships are at the heart of everything we do. Our children’s learning is supported through sharing local stories/pūrākau to weave our learning values. These values are:",
        "- Resilience - Manawarotanga\n- Creativity – Auahatanga\n- Collaboration – Kotahitanga\n- Leadership – Rangatiritanga\n- Guardianship - Kaitiakitanga",
        "Our kindergarten is a community based, not for profit learning environment. We are a proud Enviroschool and are committed to promoting kaitiakitanga (guardianship) of the environment and the wider community.",
        "We have an extensive outdoor environment that provides children with rich opportunities to engage in hands on, active exploration of Papatuanuku (natural environment).",
        "Our learning program is a synergy of children’s interests and teacher led opportunities. We recognise and value children’s individuality and learning styles and see diversity as a strength to be celebrated.",
        "Visitors are always welcome. So feel free to come in and see us, we look forward to meeting you.",
      ].join("\n\n"),
      address: "31 Hawea Street, Mount Maunganui",
      phone: "07 575 5340",
      email: "arataki@ikindergartens.nz",
      hours: "8:30am - 12:30pm or 8:30am - 2:30pm, Monday to Friday. Holiday programmes are available.",
      costOverride: "",
      teachersOverride: "",
      enrolOverride: "",
      teamCaption: "Back row: Andi Peat, Amy Garrity, Debbie Fitzgerald\nFront row: Caroline Darby, Roxanne Wright, Caroline Dawson",
    },
  },
];
