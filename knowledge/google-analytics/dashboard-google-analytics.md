# Google Analytics on the Marketing dashboard

How the Online Marketing dashboard (/app) reads the website's Google Analytics 4 (GA4) property. The app reads GA4 through the Data API with read-only access.

## Where the numbers come from

- The app stores one snapshot per calendar month, from the first of the month to its last day (or to today for the current month). The Google Analytics panel defaults to the current month.
- Each snapshot holds the property's totals and the top 100 pages by views.
- Figures are GA4's own; the app does not adjust them.

## Metrics shown

- Active users: people who engaged with the site in the period. GA4's main "users" figure.
- Sessions: visits. A session ends after 30 minutes of inactivity.
- Engaged sessions: sessions that lasted longer than 10 seconds, had a key event (conversion), or had at least 2 page views.
- Engagement rate: engaged sessions divided by sessions. GA4's opposite of bounce rate.
- Views (screenPageViews): pages viewed, counting repeat views of the same page.
- Average session duration: average length of a session, in seconds.
- Key events / conversions: actions marked as important in GA4, such as an enquiry or enrolment form submission. They only appear if the key event is set up in the GA4 property.
- Total revenue: only relevant if e-commerce is set up; usually zero for the kindergarten site.

## Pages

- Pages are grouped by page path (the part of the address after the domain, such as /enrol). The page title is the title GA4 recorded for that path.
- A page's engagement rate is averaged across its rows.

## Reading the website figures

- Compare enrolment-page views and key events with Meta link clicks over the same window: Meta link clicks that never show up as GA4 sessions usually mean people leave before the page loads.
- A drop in engagement rate on a page that ads point to suggests the page does not match what the ad promised.
- GA4 numbers will not exactly match Meta's: they count differently, and ad blockers or declined cookie consent stop GA4 recording some visits.
