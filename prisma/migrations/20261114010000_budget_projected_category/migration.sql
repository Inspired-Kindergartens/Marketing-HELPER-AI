-- Budget: purchase categories ticked "In predictions". Only these carry on
-- at the same monthly rate in the predicted spend (opt-in); the rest count
-- what was spent. By category name, for every year.
CREATE TABLE "BudgetProjectedCategory" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetProjectedCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetProjectedCategory_category_key" ON "BudgetProjectedCategory"("category");
