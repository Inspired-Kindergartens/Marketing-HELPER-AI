// What the marketing budget is spent to achieve, per month, for the Budget
// page's Year Over Year panel. Read-only: the stored Infocare roll (Enrolment
// Quality's CentreMonthlyRoll) and the stored Meta results. Nothing is
// fetched or written here.
import { Prisma } from "../../generated/prisma/client.js";
import type { BudgetOutcomeMonth } from "../analytics/budget.js";
import { prisma as db } from "../db.js";

export async function readBudgetOutcomeMonths(): Promise<BudgetOutcomeMonth[]> {
  const [roll, meta] = await Promise.all([
    // Children enrolled: every centre's average placements for the month,
    // added up. A month only counts once every centre's figure is complete.
    db.$queryRaw<Array<{ month: string; roll: number; complete: boolean }>>`
      SELECT "month", SUM("avgPlacements")::float AS roll, BOOL_AND("complete") AS complete
      FROM "CentreMonthlyRoll"
      GROUP BY "month"
    `,
    // Each pull stores the last 30 days again, so take the newest pull per
    // campaign per day (as budget/meta-sync.ts), then add the days up by month.
    db.$queryRaw<Array<{ month: string; spend: Prisma.Decimal | null; views: number | null; leads: number | null }>>`
      WITH latest AS (
        SELECT DISTINCT ON ("metaAdAccountId", "metaCampaignId", "insightDate")
          "insightDate", "spend", "rawActions"
        FROM "MetaInsightSnapshot"
        WHERE "level" = 'campaign'
        ORDER BY "metaAdAccountId", "metaCampaignId", "insightDate", "pulledAt" DESC
      ),
      days AS (
        SELECT to_char("insightDate", 'YYYY-MM') AS month, "spend",
          CASE WHEN jsonb_typeof("rawActions"::jsonb) = 'array' THEN "rawActions"::jsonb ELSE '[]'::jsonb END AS actions
        FROM latest
      )
      SELECT month, SUM("spend") AS spend,
        SUM((SELECT SUM((action->>'value')::numeric) FROM jsonb_array_elements(actions) AS action WHERE action->>'action_type' = 'landing_page_view'))::float AS views,
        SUM((SELECT SUM((action->>'value')::numeric) FROM jsonb_array_elements(actions) AS action WHERE action->>'action_type' = 'lead'))::float AS leads
      FROM days
      GROUP BY month
    `,
  ]);
  const months = new Map<string, BudgetOutcomeMonth>();
  const entry = (month: string) => {
    const existing = months.get(month) ?? { month, roll: null, metaSpend: 0, metaLandingViews: 0, metaLeads: 0 };
    months.set(month, existing);
    return existing;
  };
  for (const row of roll) if (row.complete) entry(row.month).roll = row.roll;
  for (const row of meta) {
    const target = entry(row.month);
    target.metaSpend = row.spend == null ? 0 : Number(row.spend.toString());
    target.metaLandingViews = row.views ?? 0;
    target.metaLeads = row.leads ?? 0;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
