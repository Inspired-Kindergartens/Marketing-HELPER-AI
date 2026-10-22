# Meta Ads on the Marketing dashboard

How the Online Marketing dashboard (/app) reads Meta (Facebook and Instagram) advertising, plus the standard Meta Ads Manager terms it uses. The app reads Meta through the Marketing API with read-only (ads_read) access; it never changes campaigns, budgets or ads.

## Where the numbers come from

- Ad accounts, campaigns, ad sets, ads and their insights are pulled from Meta and stored. The dashboard shows the latest pull; the "last pulled" time says how fresh it is.
- Spend, clicks and results on the dashboard cover the time window selected on screen.
- Budgets come from Meta in cents and are shown in dollars.

## Matching campaigns to centres

- Each campaign is matched to a kindergarten by its name. Generic words such as "ad", "campaign", "centre", "enrolment" and month names are ignored, so "Te Puke Enrolment Campaign March" matches Te Puke.
- A campaign whose name names no centre is unmatched and does not count towards any centre's coverage. Putting the centre name in the campaign name fixes this.
- Centre coverage shows, per centre: campaigns, active campaigns, ads, spend and clicks over the last 30 days, and when its last campaign ran.

## Meta action labels: Needs ads, Ads active monitor, Review spend, Prepare campaign, Covered by ads, Watch

The dashboard gives each centre one Meta action label by combining its Infocare figures with its Meta coverage. Open places are licensed capacity minus enrolled children; replacement pressure is for the time window on screen. The rules are checked in this order and the first that fits wins:

- Needs ads: 5 or more open places, an actionable waitlist of 3 or fewer, and no active Meta campaign. Empty places, little realistic waitlist and nothing advertising the centre: start a campaign.
- Ads active, monitor: 5 or more open places and an active campaign that has spent money in the last 30 days. Watch its leads and cost per lead.
- Review spend: the waitlist already covers the open places plus the replacement pressure, yet an active campaign is still spending. The centre may not need the ads; the money may be better used at another centre.
- Prepare campaign: 3 or more children to replace in the window and no active campaign. Have a campaign ready before the places open.
- Covered by ads: none of the above apply and the centre has an active campaign.
- Watch: none of the above apply and there is no active campaign. Nothing needs doing yet.

## Result and cost per result

- The result shown for an ad is the first of these Meta actions it recorded: landing page views, link clicks, leads, website leads, pixel leads.
- Cost per result (CPR) is spend divided by that result count.
- Lead counts add Meta leads, on-site website leads and Meta Pixel leads together.

## Delivery status as the dashboard shows it

The dashboard takes the strictest status across the campaign, ad set and ad:

- Rejected: the ad, ad set or campaign was rejected or disapproved by Meta's ad review.
- Not Delivering: something is stopping delivery (Meta reports "with issues" or "not delivering").
- Learning Limited: Meta says the ad set is unlikely to exit learning, because it is not getting enough optimisation events (Meta generally needs about 50 a week). Usual fixes: combine ad sets, widen the audience, raise the budget, or optimise for a more frequent event such as landing page views instead of leads.
- Learning: Meta says the ad set is learning. The dashboard also treats an active ad set that has spent money but recorded fewer than 10 leads as still learning, because it has not yet had enough results to optimise.
- Completed: the ad set's end date has passed.
- Active: delivering normally.

## Standard Meta Ads terms

These are Meta's general definitions, as used in Ads Manager.

### Impressions, reach and frequency

- Impressions: the number of times ads were shown on screen. One person can see an ad more than once.
- Reach: the number of different people who saw the ads at least once.
- Frequency: impressions divided by reach, the average number of times each person saw the ad. Rising frequency with falling click-through rate often means the audience is tired of the ad.

### Clicks, CTR, CPC and CPM

- Clicks (all): every click on the ad, including likes, profile clicks and expanding the image.
- Link clicks: clicks that go to the destination, such as the enrolment page. A better measure of interest than all clicks.
- CTR (click-through rate): clicks divided by impressions, as a percentage. On the dashboard CTR is calculated from all clicks.
- CPC (cost per click): spend divided by clicks.
- CPM (cost per 1,000 impressions): spend divided by impressions, times 1,000. Reflects how expensive the audience is to reach.

### Landing page views, leads and the Meta Pixel

- Landing page views: link clicks where the destination page actually finished loading. Fewer than link clicks usually means a slow page or people bouncing before it loads.
- Leads: form submissions recorded by Meta lead forms or by the Meta Pixel on the website.
- Meta Pixel: a snippet of code on the website that reports visits and conversions (such as an enquiry form submission) back to Meta, so it can optimise and report results.

### Learning phase and Learning Limited

- Learning phase: after an ad set starts or is significantly edited, Meta's delivery system explores who responds best. Performance is less stable during learning. Meta generally needs about 50 optimisation events in a week to exit learning. Large edits to budget, audience, creative or optimisation goal restart learning.
- Learning Limited: the ad set is not getting enough optimisation events to exit learning, often because the budget is small, the audience is narrow or the optimisation goal is too rare. Common fixes are combining ad sets, widening the audience, raising the budget, or optimising for a more frequent event (for example landing page views instead of leads).

### Campaigns, ad sets, objectives and budgets

- Campaign, ad set, ad: the campaign holds the objective; ad sets hold the audience, budget, schedule and placements; ads hold the creative and text.
- Objective: what the campaign asks Meta to get, such as Traffic, Leads or Awareness. It decides what Meta optimises for.
- Daily and lifetime budget: a daily budget is the average spend per day; a lifetime budget is spread across the whole schedule.

## Reading Meta performance for a centre

- Compare the centre's Meta coverage with its Infocare urgency: a Critical or High centre with no active campaign is the clearest gap.
- Judge an enrolment campaign on leads and cost per lead rather than clicks alone.
- A low CTR with a normal CPM points at the creative or message; a high CPM points at the audience or competition for it.
