# BUGS & AMENDMENTS

## Infocare Analytics

## AI Chat

## Waitlist Quality

[x] The panel needs an overflow visible

[x] Rename "Largest Waitlists" to "Waitlist by Good vs 163+ Days"

- Include all centres in the graph
- Only show the top 8 offenders with the option to breakout this panel into it's own window for ALL centres
- each bar is a culmination of time on waitlist as per the "Suggested Thresholds" in INFOCARE-WAITLIST
- Color "Short" with green; "Typical" with blue #4bc2c3; "Long-running" with orange #eeaf38; and "Very long-running" with #Fb3640FF and apply these colors to global css styles
- Do not hard code the value of each of the "Suggested Thresholds" but use the names instead as these values may change in the future
- remove the list of centres and the numbers section of the panel `waitlist-chart__summary`

[x] `Oldest Waitlist Entries` does not need a graph for the oldest as these just might be outliers. We need a table to show the hierarchy of greatest number of members on waitlist. The columns are:

- Number of Long-running wait
- Number of Very long-running wait
- Maximum days the longest member has been on the waitlist
- Include all centres in the table
- Only show the top 8 offenders with the option to breakout this panel into it's own window for ALL centres

[x] `Waitlist Age Distribution` half page grid size
[x] Change "Avg Wait" to "Median" and use the median value from INFOCARE-WAITLIST
[x] Include a panel for "Recent Demand Activity" from INFOCARE-WAITLIST with all three sections for graphs
[x] Use the colors mentioned earlier and add colors that are gradients of the colors currently being used with green being the lower values then blue then orange then red

Note: the current checked-in `INFOCARE-WAITLIST.md` does not yet include per-centre Short/Typical/Long-running/Very long-running counts. The app and parser are wired for those columns, and `scripts/waitlist-report.mjs` now emits them for the next report refresh.
