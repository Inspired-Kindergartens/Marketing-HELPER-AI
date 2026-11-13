-- Budget: the year-end report (generated from the figures, editable) and
-- additional budget tied to a purchase category (a one-off, part of the
-- year's budget, not expected again the next year).
ALTER TABLE "BudgetYear" ADD COLUMN "report" TEXT NOT NULL DEFAULT '';

-- The finished years' notes were written by hand as their year-end reports.
UPDATE "BudgetYear" SET "report" = "notes" WHERE "startYear" < 2026;

CREATE TABLE "BudgetAdditional" (
    "id" SERIAL NOT NULL,
    "budgetYearId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAdditional_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetAdditional_budgetYearId_idx" ON "BudgetAdditional"("budgetYearId");

ALTER TABLE "BudgetAdditional" ADD CONSTRAINT "BudgetAdditional_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "BudgetYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
