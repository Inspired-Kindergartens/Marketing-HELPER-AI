// AI images: one row per generated image. The picture itself is a file under
// uploads/ai-images (storagePath), the same layout as task attachments.
import { prisma } from "../db.js";

export type AiImageRecord = {
  id: number;
  prompt: string;
  source: string;
  model: string;
  size: string;
  quality: string;
  storedName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

export type AiImageInput = Omit<AiImageRecord, "id" | "createdAt">;

export type AiImageStore = {
  create(input: AiImageInput): Promise<AiImageRecord>;
  get(id: number): Promise<AiImageRecord | null>;
  list(limit: number): Promise<AiImageRecord[]>;
  delete(id: number): Promise<AiImageRecord | null>;
};

export const aiImageStore: AiImageStore = {
  create: (input) => prisma.aiImage.create({ data: input }),
  get: (id) => prisma.aiImage.findUnique({ where: { id } }),
  list: (limit) => prisma.aiImage.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
  async delete(id) {
    const image = await prisma.aiImage.findUnique({ where: { id } });
    if (!image) return null;
    await prisma.aiImage.delete({ where: { id } });
    return image;
  },
};
