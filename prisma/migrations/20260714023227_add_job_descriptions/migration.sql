-- CreateTable
CREATE TABLE "JdPayScale" (
    "id" SERIAL NOT NULL,
    "scaleKey" TEXT NOT NULL,
    "step" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "annualRate" DECIMAL(10,2) NOT NULL,
    "sourceDocument" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JdPayScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdAgreement" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JdAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdTitleProfile" (
    "id" SERIAL NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "jobCategory" TEXT NOT NULL,
    "payScaleKey" TEXT,
    "layoutVariant" TEXT NOT NULL DEFAULT 'standard',
    "defaultPositionType" TEXT NOT NULL DEFAULT 'Full Time',
    "agreementText" TEXT NOT NULL DEFAULT 'Kindergarten Teachers Collective Agreement',
    "qualificationsText" TEXT NOT NULL,
    "roleSections" JSONB NOT NULL,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JdTitleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdCentreProfile" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "locationDisplay" TEXT NOT NULL,
    "introParagraph" TEXT NOT NULL DEFAULT '',
    "seniorTeacherName" TEXT NOT NULL DEFAULT '',
    "seniorTeacherAcronym" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JdCentreProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" SERIAL NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "titleProfileId" INTEGER,
    "centreKey" INTEGER,
    "locationDisplay" TEXT NOT NULL,
    "positionType" TEXT NOT NULL,
    "fte" DECIMAL(4,2),
    "jobCategory" TEXT NOT NULL,
    "layoutVariant" TEXT NOT NULL DEFAULT 'standard',
    "agreementText" TEXT NOT NULL DEFAULT '',
    "salaryRangeText" TEXT NOT NULL DEFAULT '',
    "dateAdvertised" TIMESTAMP(3),
    "closingAt" TIMESTAMP(3),
    "startDateText" TEXT NOT NULL DEFAULT 'To be negotiated',
    "qualificationsText" TEXT NOT NULL DEFAULT '',
    "introParagraph" TEXT NOT NULL DEFAULT '',
    "roleSections" JSONB NOT NULL,
    "extras" JSONB,
    "seniorTeacherName" TEXT NOT NULL DEFAULT '',
    "blurbHtml" TEXT,
    "reviewedByAcronym" TEXT NOT NULL DEFAULT '',
    "approvedByAcronym" TEXT NOT NULL DEFAULT 'PM',
    "lastUpdatedByAcronym" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdBlurb" (
    "id" SERIAL NOT NULL,
    "centreKey" INTEGER NOT NULL,
    "jobDescriptionId" INTEGER,
    "contentHtml" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JdBlurb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdKnowledgeDoc" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "centreKey" INTEGER,
    "label" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JdKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JdPayScale_scaleKey_effectiveFrom_idx" ON "JdPayScale"("scaleKey", "effectiveFrom" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "JdPayScale_scaleKey_step_effectiveFrom_key" ON "JdPayScale"("scaleKey", "step", "effectiveFrom");

-- CreateIndex
CREATE INDEX "JdAgreement_expiresOn_idx" ON "JdAgreement"("expiresOn" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "JdTitleProfile_jobTitle_key" ON "JdTitleProfile"("jobTitle");

-- CreateIndex
CREATE INDEX "JdTitleProfile_sortOrder_idx" ON "JdTitleProfile"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "JdCentreProfile_centreKey_key" ON "JdCentreProfile"("centreKey");

-- CreateIndex
CREATE INDEX "JobDescription_centreKey_createdAt_idx" ON "JobDescription"("centreKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobDescription_titleProfileId_idx" ON "JobDescription"("titleProfileId");

-- CreateIndex
CREATE INDEX "JdBlurb_centreKey_savedAt_idx" ON "JdBlurb"("centreKey", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "JdBlurb_jobDescriptionId_savedAt_idx" ON "JdBlurb"("jobDescriptionId", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "JdKnowledgeDoc_kind_centreKey_idx" ON "JdKnowledgeDoc"("kind", "centreKey");

-- CreateIndex
CREATE UNIQUE INDEX "JdKnowledgeDoc_kind_centreKey_label_key" ON "JdKnowledgeDoc"("kind", "centreKey", "label");

-- AddForeignKey
ALTER TABLE "JdCentreProfile" ADD CONSTRAINT "JdCentreProfile_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_titleProfileId_fkey" FOREIGN KEY ("titleProfileId") REFERENCES "JdTitleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JdBlurb" ADD CONSTRAINT "JdBlurb_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JdBlurb" ADD CONSTRAINT "JdBlurb_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JdKnowledgeDoc" ADD CONSTRAINT "JdKnowledgeDoc_centreKey_fkey" FOREIGN KEY ("centreKey") REFERENCES "CentreReference"("centreKey") ON DELETE CASCADE ON UPDATE CASCADE;
