import { prisma } from "../db.js";

export type MetaEmailContentView = {
  centreKey: number;
  headingText: string;
  primaryText: string;
  updatedAt: string;
};

function mapMetaEmailContent(row: {
  centreKey: number;
  headingText: string;
  primaryText: string;
  updatedAt: Date;
}): MetaEmailContentView {
  return {
    centreKey: row.centreKey,
    headingText: row.headingText,
    primaryText: row.primaryText,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readMetaEmailContent(centreKey: number) {
  const row = await prisma.metaEmailContent.findUnique({
    where: { centreKey },
  });

  return row ? mapMetaEmailContent(row) : null;
}

export async function upsertMetaEmailContent(input: {
  centreKey: number;
  headingText: string;
  primaryText: string;
}) {
  const row = await prisma.metaEmailContent.upsert({
    where: { centreKey: input.centreKey },
    create: {
      centreKey: input.centreKey,
      headingText: input.headingText,
      primaryText: input.primaryText,
    },
    update: {
      headingText: input.headingText,
      primaryText: input.primaryText,
    },
  });

  return mapMetaEmailContent(row);
}
