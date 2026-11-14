-- Budget: the type of financial year, chosen by the user in Year Over Year:
-- 'bullish', 'bearish' or '' (not set).
ALTER TABLE "BudgetYear" ADD COLUMN "outlook" TEXT NOT NULL DEFAULT '';
