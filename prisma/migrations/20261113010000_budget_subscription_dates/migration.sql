-- Budget subscriptions: when the subscription started and when it ended.
ALTER TABLE "BudgetSubscription" ADD COLUMN "startedOn" DATE;
ALTER TABLE "BudgetSubscription" ADD COLUMN "endedOn" DATE;
