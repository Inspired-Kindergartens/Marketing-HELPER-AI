CREATE TABLE "GeneralChatGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralChatGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneralChatConversation" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneralChatMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneralChatGroup_position_name_idx" ON "GeneralChatGroup"("position", "name");
CREATE INDEX "GeneralChatConversation_groupId_updatedAt_idx" ON "GeneralChatConversation"("groupId", "updatedAt" DESC);
CREATE INDEX "GeneralChatConversation_updatedAt_idx" ON "GeneralChatConversation"("updatedAt" DESC);
CREATE INDEX "GeneralChatMessage_conversationId_createdAt_idx" ON "GeneralChatMessage"("conversationId", "createdAt");

ALTER TABLE "GeneralChatConversation" ADD CONSTRAINT "GeneralChatConversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GeneralChatGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneralChatMessage" ADD CONSTRAINT "GeneralChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "GeneralChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
