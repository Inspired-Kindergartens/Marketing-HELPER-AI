-- AI images: one row per image made with the OpenAI image model. The picture
-- is a file under uploads/ai-images (storagePath).
CREATE TABLE "AiImage" (
    "id" SERIAL NOT NULL,
    "prompt" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'typed',
    "model" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiImage_storedName_key" ON "AiImage"("storedName");

CREATE INDEX "AiImage_createdAt_idx" ON "AiImage"("createdAt" DESC);
