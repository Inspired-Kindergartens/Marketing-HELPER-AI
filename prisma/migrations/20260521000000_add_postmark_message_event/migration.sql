-- CreateTable
CREATE TABLE "PostmarkMessageEvent" (
    "id" SERIAL NOT NULL,
    "serverToken" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipient" TEXT,
    "tag" TEXT,
    "centreKey" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostmarkMessageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostmarkMessageEvent_serverToken_messageId_eventType_occurredAt_key"
    ON "PostmarkMessageEvent"("serverToken", "messageId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "PostmarkMessageEvent_serverToken_occurredAt_idx"
    ON "PostmarkMessageEvent"("serverToken", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "PostmarkMessageEvent_centreKey_occurredAt_idx"
    ON "PostmarkMessageEvent"("centreKey", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "PostmarkMessageEvent_tag_occurredAt_idx"
    ON "PostmarkMessageEvent"("tag", "occurredAt" DESC);

-- AddForeignKey: CentreReference may not exist as a table named exactly that;
-- check name and add the FK only if the parent table is present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'CentreReference') THEN
        ALTER TABLE "PostmarkMessageEvent"
            ADD CONSTRAINT "PostmarkMessageEvent_centreKey_fkey"
            FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;
