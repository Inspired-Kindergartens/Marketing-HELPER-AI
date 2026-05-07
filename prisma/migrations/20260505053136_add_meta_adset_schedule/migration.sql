-- AlterTable
ALTER TABLE "MetaAdSet" ADD COLUMN     "dailyBudget" TEXT,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "lifetimeBudget" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3);
