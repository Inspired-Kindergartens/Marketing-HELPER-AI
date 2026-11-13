-- Budget: financial years, subscriptions, purchases, future spends and landing reminder dismissals.
-- CreateTable
CREATE TABLE "BudgetYear" (
    "id" SERIAL NOT NULL,
    "startYear" INTEGER NOT NULL,
    "operatingBudget" DECIMAL(12,2),
    "thresholdPercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSubscription" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSubscriptionYear" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "budgetYearId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tally" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetSubscriptionYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetExpense" (
    "id" SERIAL NOT NULL,
    "budgetYearId" INTEGER NOT NULL,
    "supplier" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "spentOn" DATE,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetFutureSpend" (
    "id" SERIAL NOT NULL,
    "budgetYearId" INTEGER NOT NULL,
    "project" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "expenseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetFutureSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReminderDismissal" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetReminderDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetYear_startYear_key" ON "BudgetYear"("startYear");

-- CreateIndex
CREATE INDEX "BudgetSubscriptionYear_budgetYearId_idx" ON "BudgetSubscriptionYear"("budgetYearId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSubscriptionYear_subscriptionId_budgetYearId_key" ON "BudgetSubscriptionYear"("subscriptionId", "budgetYearId");

-- CreateIndex
CREATE INDEX "BudgetExpense_budgetYearId_idx" ON "BudgetExpense"("budgetYearId");

-- CreateIndex
CREATE INDEX "BudgetExpense_createdAt_idx" ON "BudgetExpense"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetExpense_source_sourceMonth_key" ON "BudgetExpense"("source", "sourceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetFutureSpend_expenseId_key" ON "BudgetFutureSpend"("expenseId");

-- CreateIndex
CREATE INDEX "BudgetFutureSpend_budgetYearId_idx" ON "BudgetFutureSpend"("budgetYearId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReminderDismissal_month_key" ON "BudgetReminderDismissal"("month");

-- AddForeignKey
ALTER TABLE "BudgetSubscriptionYear" ADD CONSTRAINT "BudgetSubscriptionYear_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BudgetSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubscriptionYear" ADD CONSTRAINT "BudgetSubscriptionYear_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "BudgetYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetExpense" ADD CONSTRAINT "BudgetExpense_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "BudgetYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetFutureSpend" ADD CONSTRAINT "BudgetFutureSpend_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "BudgetYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetFutureSpend" ADD CONSTRAINT "BudgetFutureSpend_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "BudgetExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

