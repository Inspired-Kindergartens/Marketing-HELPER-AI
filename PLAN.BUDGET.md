# PLAN — Budget Calculator

## Goal
A **Budget** page (`/budget`) that replaces the yearly `Budget Calculator 20xx-xx.xlsx` workbooks
(`D:\iK\Documents\`). It records subscriptions, purchases and future spends per financial year
(1 July - 30 June) in Postgres, so year-over-year changes in ongoing costs can be seen.
The landing page reminds the user near the end of each month if no expense has been added that month.

## Agreed (2026-11-11)
- **Landing:** a **Budget** tile replaces **Things To Know** in the main button row. **Things To Know** moves
  to the secondary row, next to **Sector Insight**.
- **Reminder:** shows from the 3rd-to-last day of a month when no expense was *added* that month
  (by its `createdAt` timestamp). It stays into the next month until an expense is added for that month
  or the user presses **Dismiss**. A dismissal is stored with its timestamp and covers that month only.
  It uses the same `landing-reminder` card as the task and AI model reminders.
- **Meta spend:** filled in automatically from the stored Meta results (read-only), one row per month.
  Imported figures stay the record for months up to the import; Meta fills later months only, so
  nothing is counted twice.
- **GST:** matches the sheet exactly. Subscription yearly totals ÷ 1.15; purchases and future spends used as entered.
- **History:** 2024-25, 2025-26 and 2026-27 are imported as-is, including the 2026-27 Purchases tab.
- **User-defined per year:** operating budget, threshold % (default 2%), year notes (the "Subscriptions /
  Purchases / Future Spends / Budget" summary), future spends. Next year's budget is never calculated,
  only typed in. Nothing else is user-defined (confirmed 2026-11-11).
- **AI chat:** Beep Beep (dashboard chat) and General Chat can see the budget through the existing
  `extraGrounding` seam. No new model or AI calls.

## Calculations (from the workbook)
- **Subscription yearly cost** = amount × {week 52, fortnight 26, month 12, quarter 4, year 1}; total ÷ 1.15.
- **Inc %** = this year's yearly cost vs the same subscription last year. This is calculated, where the sheet typed it in by hand.
- **Ended subscriptions** = amount × payments made (tally). Shown, not included in totals.
- **Actual spend** = subscriptions (yearly, ÷1.15) + purchases YTD.
- **Remaining** = budget − actual spend; also shown as % of the budget.
- **Predicted purchases** = YTD + YTD ÷ months elapsed × months remaining. Months are counted inside
  *that* financial year, which fixes the sheet's bug where a closed year predicted $203k because it used `TODAY()`.
- **Predicted spend** = subscriptions + predicted purchases + future spends;
  **deficit/surplus** = budget − predicted; flagged when beyond the threshold %.

## Build order

- [ ] 1. Storage (Prisma migration + `src/storage/budget-store.ts`)
  - [ ] `BudgetYear`: `startYear` (unique, 2026 = 2026-27), `operatingBudget`, `thresholdPercent` (2), `notes`, timestamps
  - [ ] `BudgetSubscription`: one subscription across years (`name`, `category`), so renames like
        "OpenAI Chatgpt" → "Anthropic Claude" and "Enlighten Blacksheep" → "Blacksheep" stay linked
  - [ ] `BudgetSubscriptionYear`: subscription × year → `amount`, `frequency`, `status` (active/ended), `tally`, `note`, `createdAt`
  - [ ] `BudgetExpense`: year, `supplier`, `group` (Facebook, Kale Print, MediaWorks, Office Signage…, replaces the side tallies),
        `amount`, `note`, `spentOn` (null for imported history, which has no dates), `source` (manual/import/meta), `createdAt`
  - [ ] Meta rows unique per (`source`, month), so a refresh updates rather than duplicates
  - [ ] `BudgetFutureSpend`: year, `project`, `supplier`, `amount`, `qty`, `note`, `status` (planned/TBC/bought)
  - [ ] `BudgetReminderDismissal`: `month` (YYYY-MM, unique), `dismissedAt`
  - [ ] confirm the new tables are in the pg_dump backup; no new env vars, so the transfer check is unchanged
- [ ] 2. Calculations (`src/analytics/budget.ts`), pure functions + tests (`test/budget.test.ts`)
  - [ ] yearly cost per frequency, ÷1.15, inc % vs last year, ended totals
  - [ ] actual / remaining / predicted / deficit-surplus / threshold flag, checked against each workbook's own figures
  - [ ] closed-year prediction uses 12 months elapsed (regression test for the $203k bug)
- [ ] 3. History import
  - [ ] extract the three workbooks once into `data/budget-history.json` (no xlsx library added to the app)
  - [ ] `scripts/budget-import.ts`: idempotent; dry-run prints per-year totals to compare with each Totals sheet before saving
  - [ ] 2024-25: Prints tab → expenses in group "Kale Print"; Future Savings and Future Projects (Photography $6,000) → future spends
  - [ ] sub-tallies (Facebook, Kale Print, MediaWorks, Mailchimp, Office Signage, Warehouse Stationery) → one expense each, by group
  - [ ] year notes, budgets ($24k, $30k, $60k) and ended subscriptions imported
- [ ] 4. Meta spend sync: monthly spend from the stored Meta results → `BudgetExpense` (source meta, group Facebook)
      for months after the import; runs after each Meta refresh (no new scheduled task)
- [ ] 5. Budget page (`/budget`, own app shell like Sector Insight, `THEME_HEAD_SCRIPT` in the head)
  - [ ] year picker (2024-25 … current; a **New year** button copies active subscriptions forward)
  - [ ] Totals panel: budget (editable), actual, remaining, predicted, deficit/surplus, threshold (editable), year notes (editable)
  - [ ] Subscriptions panel: add / edit / end; yearly cost and inc % columns; ended list underneath
  - [ ] Purchases panel: add / edit / delete, grouped with group subtotals and % of spend; Meta rows read-only
  - [ ] Future Spends panel: add / edit; **Bought** turns it into a purchase
  - [ ] Year-over-year panel: each subscription's yearly cost across years with % change; group totals by year
  - [ ] fragments swapped in place (no reload); standard green buttons, no custom colours, no explainer text
  - [ ] print icon downloads a PDF (`report-pdf.ts`)
  - [ ] checked in headless Chrome in Default, Light and Dark
- [ ] 6. Landing page (`src/ui/landing-page.ts`)
  - [ ] Budget tile replaces Things To Know; Things To Know added to the secondary row after Sector Insight
  - [ ] `renderBudgetReminderItem`: "No expenses added for November", last expense added at (date + time),
        **Add expense** link to `/budget` and **Dismiss** button, same card and strip as the AI model reminder
  - [ ] `readLandingReminders` includes it; the heading counts it
  - [ ] `POST /actions/dismiss-budget-reminder` stores the dismissal with its timestamp and returns the strip HTML
  - [ ] tests: shows in the last 3 days only when nothing was added that month, carries into the next month,
        hides after dismiss or a new expense; tile order
- [ ] 7. AI chat grounding
  - [ ] `buildBudgetGrounding` in `src/analytics/budget.ts`: current year totals (budget, actual, remaining,
        predicted, deficit/surplus), subscriptions with inc %, group totals, future spends,
        and a year-over-year summary for every imported year
  - [ ] `findBudgetGrounding(prompt)` in `src/server.ts`, only for budget-shaped prompts (budget, spend, cost,
        subscription, purchase, expense, forecast…), fails soft like `findEnrolmentQualityGrounding`
  - [ ] passed through `joinGrounding` in `/api/ai/chat`, `/api/ai/chat/stream` and the General Chat stream
  - [ ] tests: grounding text from fixed data; a non-budget prompt adds nothing
- [ ] 8. Docs: `docs/USER-GUIDE.md` (plain language, page link) and `README.md` (tables, import script, calculations)
- [ ] 9. Build, restart the server (kill :3000), check `/budget` and the landing strip in the browser
