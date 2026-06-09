-- CreateTable
CREATE TABLE "SyncCursor" (
    "key" TEXT NOT NULL,
    "lastId" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("key")
);
