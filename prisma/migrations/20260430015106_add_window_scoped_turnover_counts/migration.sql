-- AlterTable
ALTER TABLE "ServiceAnalyticsSnapshot" ADD COLUMN     "approachingFiveCountsByWindow" JSONB NOT NULL DEFAULT '{"1W":0,"2W":0,"3W":0,"1M":0,"2M":0,"3M":0,"6M":0,"12M":0}',
ADD COLUMN     "knownLeavingCountsByWindow" JSONB NOT NULL DEFAULT '{"1W":0,"2W":0,"3W":0,"1M":0,"2M":0,"3M":0,"6M":0,"12M":0}';
