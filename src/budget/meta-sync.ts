// Meta spend on the Budget page: one purchase per month, summed from the
// stored Meta results (read-only), for months after the imported workbooks.
// Runs after each Meta refresh and once at startup; no scheduled task of its own.
import { Prisma } from "../../generated/prisma/client.js";
import { BUDGET_IMPORTED_THROUGH } from "../analytics/budget.js";
import { prisma as db } from "../db.js";
import { upsertMetaBudgetExpense } from "../storage/budget-store.js";

type Log = { info(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void };

// Each pull stores the last 30 days again, so take the newest pull per
// campaign per day, then add the days up by month.
export async function readMetaMonthlySpend(afterMonth: string): Promise<Array<{ month: string; spend: number }>> {
  const rows = await db.$queryRaw<Array<{ month: string; spend: Prisma.Decimal | null }>>`
    WITH latest AS (
      SELECT DISTINCT ON ("metaAdAccountId", "metaCampaignId", "insightDate")
        "insightDate", "spend"
      FROM "MetaInsightSnapshot"
      WHERE "level" = 'campaign'
      ORDER BY "metaAdAccountId", "metaCampaignId", "insightDate", "pulledAt" DESC
    )
    SELECT month, SUM("spend") AS spend
    FROM (SELECT to_char("insightDate", 'YYYY-MM') AS month, "spend" FROM latest) AS days
    WHERE month > ${afterMonth}
    GROUP BY month
    ORDER BY month
  `;
  return rows.map((row) => ({ month: row.month, spend: row.spend == null ? 0 : Number(row.spend.toString()) }));
}

export async function syncBudgetMetaSpend(log?: Log): Promise<number> {
  try {
    const months = await readMetaMonthlySpend(BUDGET_IMPORTED_THROUGH);
    for (const { month, spend } of months) await upsertMetaBudgetExpense(month, spend);
    log?.info({ months: months.length }, "Budget Meta spend synced");
    return months.length;
  } catch (error) {
    // The budget must never break a Meta refresh.
    log?.error({ error }, "Budget Meta spend sync failed");
    return 0;
  }
}
