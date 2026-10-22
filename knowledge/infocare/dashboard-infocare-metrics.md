# Infocare enrolment metrics on the Marketing dashboard

How the Online Marketing dashboard (/app) turns Infocare data into the numbers in the centre table and the AI chat. Infocare is the kindergarten management system that holds enrolments, bookings, waitlists and licences. The app reads it through the read-only Ruby API; it never writes to Infocare.

## Where the numbers come from

- A snapshot of every open centre is pulled from Infocare in the background each week (and can be refreshed by hand). The dashboard reads the latest snapshot, not live data.
- Ask the chat a "live" question (for example "how many children are enrolled at Te Puke right now?") and it reads Infocare directly instead, read-only.
- Centres with no usable licensed capacity are skipped from the snapshot rather than shown with made-up numbers.

## Licensed capacity

- Licensed capacity is the most children a centre is licensed for. Infocare returns one licence row per day and closed days read 0, so the dashboard takes the largest daily figure, not the first row.
- Capacity is split into under-2 places (max_u2) and over-2 places (max_o2). Not every centre has under-2 places.
- If Infocare has no licence for a centre, a manually entered capacity is used instead.

## Enrolment figures

- Enrolled: the number of children currently enrolled at the centre.
- Enrolled FTE: total weekly booked minutes divided by a 50-hour full-time week, so two half-time children count as 1.0 FTE.
- Booked average per day: total booked child-days divided by the number of days with bookings.
- Booked utilisation: booked average per day divided by licensed capacity.
- Enrolment ratio: enrolled divided by licensed capacity.
- Available places: licensed capacity minus enrolled (never below 0).
- Estimated open places: licensed capacity minus the booked average per day, rounded.
- Under 2 / over 2 enrolled: by each child's age today.

## Waitlist figures

- Waitlist: every child on the centre's Infocare waiting list.
- Waitlist age is the number of days since the child joined the waitlist, taken from application_date. starting_date (the hoped-for start) is only a fallback when application_date is missing.
- Oldest entry and average wait are based on that waitlist age.
- Wait bands: short is up to 30 days, typical is up to 162 days, long and very long are beyond that.
- Waitlist age groups: under 2, under 5, turning 5 this calendar year, already 5 or older, and unknown age (no birth date).
- Actionable waitlist: an estimate of how many waitlist entries are realistically likely to enrol. Children under 2 are excluded at centres with no under-2 licence. Of the rest, the historical share of entries that are short or typical waits (212 of 549 dated entries, about 39%) is applied. The full waitlist total is deliberately not used, because most long-waiting entries never enrol.

## Children leaving

- Known leavers: enrolled children with a leaving date inside the selected time window.
- Approaching five: children whose fifth birthday falls inside the window (they leave for school).
- Aged out: enrolled children who are already 5 or older.
- Replacement pressure: the number of distinct children who are leaving, approaching five, or aged out within the window. These places need refilling.
- Waitlist cover ratio: waitlist divided by replacement pressure.

## Time windows

The time filter (1W, 2W, 3W, 1M, 2M, 3M, 6M, 12M = 7, 14, 21, 30, 60, 90, 180, 365 days) changes the leaving, approaching-five and replacement-pressure counts, and therefore the urgency score. The default is 3M. Changing the window re-ranks the table because the score is recomputed for that window.

## Urgency score and band

The urgency score is an absolute 0-100 measure of a centre's enrolment pressure. It is not a ranking: every centre can be Stable in a good week or Critical in a bad one. It adds three parts:

- Uncovered leavers (up to 45 points): children leaving in the window minus the actionable waitlist, measured against 10% of the centre's licensed capacity. Reaching that 10% gives the full 45.
- Empty places (up to 40 points): available places as a share of licensed capacity. A quarter of places empty gives the full 40.
- No resilience (15 points): added when the actionable waitlist is zero, because nothing would absorb the next departure.

Bands: Critical is 70 or more, High is 45-69, Moderate is 20-44, Stable is under 20.

## Reading the urgency in plain terms

- Critical or High usually means children are leaving faster than the realistic waitlist can replace them, or the centre already has many empty places. That is the signal to put marketing (for example a Meta enrolment campaign) behind that centre.
- Stable means the centre is close to full and the realistic waitlist covers expected departures.
- A big waitlist with a high urgency is not a contradiction: urgency uses the actionable waitlist, not the total.
