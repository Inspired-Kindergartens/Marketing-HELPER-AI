# PLAN

## Goal

Recover the intended Waitlist Quality panel design without removing any newer functionality added since the last repo commit.

## Recovery Rules

- Do not revert broad files or discard current work; keep the new waitlist report parser, Chart.js rendering, breakout buttons, refresh action, daily snapshot work, and time-window behavior.
- Restore the three missing design surfaces in both report-backed and fallback rendering paths:
  - `Waitlist by Good vs 163+ Days`
  - `Waitlist Quality Hierarchy`
  - `Recent Demand Activity`
- Remove the fallback `Oldest Waitlist Entries` graph from the Waitlist Quality panel. Oldest wait age is a hierarchy table column, not a standalone graph.

## Implementation

1. Normalize the Waitlist Quality sections
   - Keep the report-backed `Waitlist by Good vs 163+ Days` stacked bar.
   - Keep the report-backed `Waitlist Quality Hierarchy` table with long-running, very long-running, and maximum-days columns.
   - Keep `Recent Demand Activity` with Last Month, Last Two Months, and Last Three Months charts.

2. Fix fallback rendering
   - When `INFOCARE-WAITLIST.md` is unavailable, rejected, or missing richer columns, render the same section names and layout from stored snapshot data.
   - Use the stored actionable/total waitlist counts for the fallback Good vs 163+ split.
   - Use a fallback hierarchy table instead of the removed `Oldest Waitlist Entries` graph.
   - Render `Recent Demand Activity` as an empty report-backed section rather than dropping the section.

3. Preserve newer functionality
   - Keep panel breakout behavior for the threshold and hierarchy sections.
   - Keep current refresh links and Chart.js asset loading.
   - Keep median/oldest/topline stats and report freshness metadata.

4. Verify
   - Run typecheck.
   - Restart the local dev server and check the Waitlist Quality HTML contains all restored section names and no `Oldest Waitlist Entries` panel.
