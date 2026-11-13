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

- [x] 1. Storage (migration `20261112010000_add_budget` applied, `src/storage/budget-store.ts`, `test/budget-store.test.ts`; checked against the live database 2026-11-12)
  - [x] `BudgetYear`: `startYear` (unique, 2026 = 2026-27), `operatingBudget`, `thresholdPercent` (2), `notes`, timestamps
  - [x] `BudgetSubscription`: one subscription across years (`name`, `category`), so renames like
        "OpenAI Chatgpt" → "Anthropic Claude" and "Enlighten Blacksheep" → "Blacksheep" stay linked
  - [x] `BudgetSubscriptionYear`: subscription × year → `amount`, `frequency`, `status` (active/ended), `tally`, `note`, `createdAt`
  - [x] `BudgetExpense`: year, `supplier`, `group` (Facebook, Kale Print, MediaWorks, Office Signage…, replaces the side tallies),
        `amount`, `note`, `spentOn` (null for imported history, which has no dates), `source` (manual/import/meta), `createdAt`
  - [x] Meta rows unique per (`source`, month), so a refresh updates rather than duplicates
  - [x] `BudgetFutureSpend`: year, `project`, `supplier`, `amount`, `qty`, `note`, `status` (planned/TBC/bought)
  - [x] `BudgetReminderDismissal`: `month` (YYYY-MM, unique), `dismissedAt`
  - [x] confirm the new tables are in the pg_dump backup; no new env vars, so the transfer check is unchanged
- [x] 2. Calculations (`src/analytics/budget.ts`), pure functions + tests (`test/budget.test.ts`, 13 tests)
  - [x] yearly cost per frequency, ÷1.15, inc % vs last year, ended totals
  - [x] actual / remaining / predicted / deficit-surplus / threshold flag, checked against each workbook's own figures
        (2026-27 predicted spend 60,634.93 and -1.05% match the sheet exactly; status = on track within ±threshold, else surplus / deficit)
  - [x] closed-year prediction uses 12 months elapsed (regression test for the $203k bug)
- [x] 3. History import (applied to the live database 2026-11-12; a second run changes nothing)
  - [x] extract the three workbooks once into `data/budget-history.json` (openpyxl, run once outside the app; no xlsx library added)
  - [x] `scripts/budget-import.ts`: idempotent; dry-run prints per-year totals to compare with each Totals sheet before saving
  - [x] 2024-25: Prints tab → expenses in group "Kale Print"; Future Savings (negative) and Future Projects (Photography $6,000) → future spends
  - [x] sub-tallies (Facebook, Kale Print, MediaWorks, Mailchimp, Office Signage, Warehouse Stationery) → one expense each, by group
  - [x] year notes (+ the Subscriptions sheet note), budgets ($24k, $30k, $60k) and ended subscriptions imported
  - [x] subscriptions, purchases, future spends, ended totals match all three workbooks. Known difference: 2024-25 actual spend
        16,336.17 vs the sheet's 18,896.17, because that sheet counted ended subscriptions (Unbound 2,560); the plan leaves them out
  - [x] Google Ads listed as active $0 and ended in 2025-26 / 2026-27 → one ended row (totals unchanged)
- [x] 4. Meta spend sync (`src/budget/meta-sync.ts`): campaign-level daily results, newest pull per day, summed by month
      for months after `BUDGET_IMPORTED_THROUGH` = 2026-09 (the 2026-27 workbook was last saved 1 Oct 2026);
      runs after both Meta refreshes and at startup. Live: Oct 2026 $810.97, Nov 2026 $278.85 (to date)
- [x] 5. Budget page (`/budget`, `src/ui/budget-app-shell.ts`, routes in `src/server.ts`)
  - [x] year picker + **New year** button (copies active subscriptions forward); `?panel=` opens a panel
  - [x] Totals panel (right-hand column): budget, actual, remaining, predicted, deficit/surplus, threshold, year notes (editable)
  - [x] Subscriptions panel: add / edit / end / delete; yearly cost and inc % columns; ended list underneath;
        adding a name used in another year links to it (renames stay linked); duplicate in the same year refused
  - [x] Purchases panel: add / edit / delete, grouped with group subtotals and % of spend; Meta rows read-only;
        a purchase goes in the financial year of its date
  - [x] Future Spends panel: add / edit / delete; **Bought** turns it into a purchase (amount × qty)
  - [x] Year-over-year panel: totals, each subscription's yearly cost and purchase groups by year with % change
  - [x] fragments swapped in place (no reload); standard buttons; only CSS added: `.data-table__total-row`
        (existing `--color-row-total` token) and a 2-column tile grid; deficit/surplus reuse the Enrolment Quality band colours
  - [x] Budget added to every nav rail after Things To Know
  - [x] print icon downloads a PDF (`src/ui/budget-pdf.ts`) — returns 200, 159 KB
  - [x] PDF read page by page (2026-11-13): ended-only subscriptions (META & Google Ads Provider, Unbound) showed as
        empty year-over-year rows → left out (page and PDF, test added); PDF year over year now matches the page
        (Remaining, Ended subscriptions, purchase groups by year)
  - [x] checked in headless Chrome: Default on the live server; Light and Dark from a saved copy (icons can't load from a copy)
  - [x] API checked end to end on the live server (add / edit / delete purchase, duplicate subscription refused, Bought); test rows removed
- [x] 6. Landing page (`src/ui/landing-page.ts`)
  - [x] Budget tile replaces Things To Know; Things To Know added to the secondary row after Sector Insight
  - [x] reminder card: "No expenses added for <month>", last expense added (date + time), **Add expense** (opens Purchases) and **Dismiss**
  - [x] `readLandingReminders` includes it (fails soft); the heading counts it
  - [x] `POST /actions/dismiss-budget-reminder` stores the dismissal with its timestamp and returns the strip HTML
  - [x] tests: last 3 days only, carries into the next month, hides after dismiss or an expense added in / dated in that month; tile order
  - [x] live now: shows "No expenses added for October" (no expense was typed in by hand in October); Dismiss clears it
- [x] 7. AI chat grounding
  - [x] `buildBudgetGrounding`: current year totals, subscriptions with inc %, group totals, future spends, year notes, every year's totals and subscription costs by year
  - [x] `findBudgetGrounding(prompt)` in `src/server.ts`, only for budget-shaped prompts, fails soft
  - [x] passed through `joinGrounding` in `/api/ai/chat`, `/api/ai/chat/stream` and the General Chat stream
  - [x] tests (`test/budget-page.test.ts`): grounding text from fixed data; a non-budget prompt adds nothing; no model named
- [x] 8. Docs: `docs/USER-GUIDE.md` (Budget section, landing buttons and reminder) and `README.md`
      (Main Pages, Budget: calculations, routes, Meta spend, import script, reminder, AI chat; PDF reports list)
- [x] 9. Build, restart the server (kill :3000), check `/budget` and the landing strip — done 2026-11-12; full suite 439/439 before the page tests were added, the 7 page tests pass on their own
  - [x] re-run `npm test` after the CSS fixes and the PDF fix: 447/447 (2026-11-13); rebuilt and restarted, new PDF checked live
- [x] 10. Report and additional budget (2026-11-13)
  - [x] migration `20261113020000_budget_report_additional` applied: `BudgetYear.report`, `BudgetAdditional`; 2024-25 and 2025-26 notes copied in as their reports
  - [x] `buildBudgetReport` (`src/analytics/budget.ts`): written from the figures, no AI
  - [x] additional budget: part of the year's budget, tied to a purchase category, a one-off (not carried forward in the prediction, left out of next year)
  - [x] page: Year notes box removed; **Generate report** opens the report for editing (Save / Generate again); **Additional budget** on a purchase category
  - [x] PDF: named `Marketing Budget <year>`; saved report, or one generated when printing
  - [x] tests (`test/budget.test.ts`, `test/budget-page.test.ts`): 461/461; both readmes updated
  - [ ] the user sets $20,000 additional budget on Office Signage for 2026-27
- [x] 11. Commit and push (2026-11-13; build clean, 464/464 tests)
