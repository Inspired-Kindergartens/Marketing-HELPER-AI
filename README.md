# Marketing Helper AI

```text
                                                                                                                         
                          ^.                                                   nwwmmmZZC_   :nUUYYYn !vUUYYYUJUUUYvi     
                          ;]                                                   0$$$$$$$$$U }%$$$$$$ax@$$$$$$$$$$$$$$Q.   
                           j|                                                  0$$$$$$$$$%<&$$$$$$$W%$$$$$$$$$$$$$$$$X   
                            n?                                                 0$$$$$$$$$$W$$$$$$$$$$$$$$$$$$$$$$$$$$Wl  
                            >b<                                                0$$%?  u@$$$$$Bt^^""a$$8?^^""b$$&,<#$$$\  
                            .cb_        '>vZC"',I!il:^'.                       0$$%?  ^B$$$$$ol    k$$w`    d$$&. +@$$Y  
                             :hbt{jz0##MMkbcQm###o##**a*#M&hUx<.               0$$B0cco$$@c@$@pXXXcr$$@0XXXnb$$&. ;B$$J  
                            .fM8&&&a*bQu/k*o#*&&W&WW&M&&W&WW#kddqn:            O$$$$$$$$$0.d@$$$$$8'*$$$$$$*k$$&. t$$$v  
                          !p%&*#dwwuLaW&WMW&&M8&&8888%%&zl^                    O$$$$$$$$$Q.X@$$$$$&'m@$$$$$*k$$@*#@$$@]  
                      .{Q*#booOQLa&&&8&&888&888888WJ1^                         O$$$$$$$$$@X@$$$$$$&\@$$$$$$*k$$$$$$$$b,  
                    lwho*00udW88%%%8%%%%%%%%8&#O[.                l<i"         O$$%?  .#$$$$$Bt""""o$$8]""""b$$$$$$$@}   
                   "mQrb*W88%%%BBB%%8%%%%%&q<.                   ~pB@%O>       O$$%-   Q$$$$$oI   '8$$m`    b$$$$$$#!    
                 iZa&W&&8%BBBBBBBB%8%%&w("                       +#$Mmbqj ^    O$$BX//f%$$$$$@0rrrr%$$BYrrrj#$$&:"`      
               ;wWMM&88%%B%B%%%%%88*UI                           iLwdB$@Wr]`   O$$$$$$$$$$@$$$$$$$$$$$$$$$$$$$$W.        
             .U##WW&%%%%%%%%%%%8W('                               [W@$$$@m_?   O$$$$$$$$$@_8$$$$$$$#B$$$$$$$$$$W.        
            _a**M8%%%88%%%888a\"                                  ^w@@@@8p+'   O$$$$$$$$$j -W$$$$$$k\B$$$$$$$$$W.        
           t#**M8%%8888&&&#X,                                       tOZZwL`i   ;!ii>><<!     +11))([ .-11))(){{}         
         .C###W8%8888&&Wb>                                           .[n~ ?<                                             
         cah*W8888&W&Wv"                                                ILU.   ^,,""""^'                    ..           
       .z**#W8&&W&W*\                                                 ~m#k`    0$$$$$$$$8> ,q$$$$$$wi#$$$$$$$$$$$$$dI    
       {a*MWW8W&&#1                                               .lUMM*L      0$$$$$$$$$a^h$$$$$$$w#$$$$$$$$$$$$$$$$~   
       Lb#W&&88Wr                   ';(vjn|>                   `>Jo&MM&f.      0$$$$$$$$$@w@$$$$$$$@$$$$$$$$$$$$$$$$$q^  
      ;ok*&888b!                 ljk@&Ovj}]<               ',{C#&&knoai        0$$@p00&$$$$$$@MkhhhB$$@*khhhB$$Bk*@$$B~  
      [kh#M8&q^                ^COX!                    ^~\a88&WC.n&1          0$$%?  "B$$$$$a;    M$$Z'    o$$*  X$$$f  
      \oaa#&wl<                "<"                  "[xmM&88Wv!{p&f'           0$$%?  )@$$%$$W+    p$$h,    o$$*  <@$$c  
      ]oha*a?`"[[        ";`                    .;tO#888&wj;1mJ_1              O$$$$$$$$$*~B$$$$$$#~B$$$$$$bo$$*  }$$$n  
      ^kdoop~    .`i-<nvL0cz?>.            .'`}a&8888#x',JkC'}l                O$$$$$$$$$) /@$$$$$# U@$$$$$bo$$#`IW$$@{  
       )-ca#Lt/ucrzUYULJUXzuXc|'        '(LoW&88Wv+^+Cap{+J}`                  O$$$$$$$$$&~8$$$$$$#lB$$$$$$bo$$$$$$$$*;  
       "]_v*L|XuvXvcncu()<-,      "_|Z#88&888%88cdWmLtXQJ?                     O$$@qQQO@$$@$$@Whhhwb$$@#hhhQo$$$$$$$$c   
        '|1mam".".       .'`"}Z*&888&W&8888&W&W&WWWMqo0J`                      O$$%-   0$$$$$a;   ^%$$Z'    *$$$$$$@0    
         '}*M#aqYvzUQqbh*MMMWW&W&W&&WWWWMMMWMMWhh*ppkY:                        O$$%-   k$$$$$M>   ,B$$b^    *$$%OOv!     
            <Y#WW##M*#*M#M#MM#*#WoM####WM*oaqbdphOCr`                          O$$$@@@@$$$$$$$$$$$$$$$$$$$$$$$$o         
                lnd*MMWM#WMMMMWWWMohmn~:>}()?>:'                               O$$$$$$$$$@h@$$$$$$$@@$$$$$$$$$$o         
                      .`^",""^`.                                               O$$$$$$$$$b^O@$$$$$$Ob$$$$$$$$$$o         
                                                                               Xhhhaaaahc` 'r#888%%L^YM888%%8&8k         
                                                                                                                         
```

Marketing Helper AI is a local Fastify dashboard for reading childcare centre demand, capacity, waitlist quality, Meta advertising coverage, and Google Analytics traffic in one place.

The app is designed to answer practical marketing and enrolment questions:

- Which centres have space that needs attention?
- Which centres have demand but may not need more advertising?
- Which waitlists are healthy, stale, or distorted by older children?
- Which Meta ads are active, learning, blocked, or no longer needed?
- Which website pages are getting attention from families?

The dashboard is local-only. `src/server.ts` refuses to start on a non-local host, so it is intended for internal analysis rather than public hosting.

## Main Data Sources

- **Infocare** supplies open centres, enrolled children, waiting list children, licence capacities, bookings, starting dates, leaving dates, birth dates, and waitlist application dates where available.
- **Manual capacity overrides** fill missing Infocare licence capacity values, including optional under-2 and over-2 capacity splits.
- **Meta Ads** supplies campaign/ad/ad set status, spend, results, impressions, budgets, and end dates.
- **Google Analytics** supplies site totals and page-level traffic for the selected range.

## Running The App

Install dependencies and generate the Prisma client:

```bash
npm install
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

Start the local server:

```bash
npm run dev
```

Beep Beep works out of the box with the built-in dashboard reasoning engine. To add an optional local language model runtime:

```bash
npm run ai:setup
```

Check whether the local model runtime is installed, reachable, and has the configured model:

```bash
npm run ai:doctor
```

Build and run the compiled server:

```bash
npm run build
npm start
```

Run the compiled server persistently, with automatic restart after failures:

```bash
npm run run:build
```

Start the compiled server in a background supervisor:

```bash
npm run server:background
```

By default the app runs on `http://127.0.0.1:3000`.

Useful checks:

```bash
npm test
npm run typecheck
```

## Environment

The app reads `.env` through `dotenv`. Required core values are:

- `DATABASE_URL` - PostgreSQL connection string.
- `INFOCAREUSER` and `INFOCAREPASS` - Infocare credentials.
- `INFOCARE_BASE_URL` - Infocare API URL, with a default in the server config.

Optional integrations:

- `META_USER_ID`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`. Generate the token via Graph API Explorer (`developers.facebook.com/tools/explorer`, scopes `ads_read` and `business_management`), then extend it to 60 days in the Access Token Debugger.
- `GOOGLE_ANALYTICS_PROPERTY_ID`.
- `GOOGLE_ANALYTICS_OAUTH_PATH`, `GOOGLE_ANALYTICS_TOKEN_PATH`, or `GOOGLE_ANALYTICS_REFRESH_TOKEN`.
- `POSTMARK_SERVER_TOKEN`, `POSTMARK_WEBHOOK_BASIC_AUTH` - Postmark email send token and the basic-auth password Postmark presents to the live webhook endpoint.
- `CLOUDFLARE_SYNC_URL`, `CLOUDFLARE_SYNC_TOKEN` - Cloudflare Worker that buffers Postmark webhook events while the app is offline, and the `X-Sync-Token` used to read from it. See [Postmark Event Sync](#postmark-event-sync).

## Postmark Event Sync

Postmark delivery, open, click, and bounce events are captured two ways:

- **Live webhook** - Postmark posts events to `/webhooks/postmark/events` whenever the app is running and reachable. These are authenticated by basic auth (`POSTMARK_WEBHOOK_BASIC_AUTH`) and a source-IP allowlist, then stored in the `PostmarkMessageEvent` table.
- **Cloudflare Worker buffer** - a Cloudflare Worker receives the same webhooks and stores them in its own database continuously, including while this app is turned off. This guarantees no events are lost during downtime.

When the app starts, and then **once every hour** while it runs, it pulls any new events from the Worker and ingests them into the local database. The flow is:

1. Read the persisted cursor (`SyncCursor` table, key `postmark:cloudflare`) holding the highest Worker event id already ingested.
2. `GET {CLOUDFLARE_SYNC_URL}/api/postmark/events?after_id={lastSeenId}` with header `X-Sync-Token: {CLOUDFLARE_SYNC_TOKEN}`.
3. For each returned row, parse its `payload` (the raw Postmark webhook body) and ingest it through the same path the live webhook uses, so centre matching and de-duplication behave identically.
4. Advance the cursor to the highest id seen.

The sync is safe to run repeatedly: ingestion de-duplicates against the existing `PostmarkMessageEvent` rows, and the cursor only moves forward, so an overlapping pull stores nothing twice. A failed pull is logged and retried on the next hourly tick; the cursor means nothing is missed in the meantime. If `CLOUDFLARE_SYNC_URL` or `CLOUDFLARE_SYNC_TOKEN` is unset, the loop logs a warning and stays idle.

A one-off CSV export from Postmark can also be imported via `importPostmarkActivityCsv` in `src/postmark/csv-import.ts`, which writes through the same de-duplicated storage path.

## Dashboard Panels

The app is split into five panels:

- **Infocare Analytics** - the main centre-by-centre operational table.
- **Waitlist Quality** - waitlist age, staleness, and age-profile checks.
- **META Ads** - active and recent advertising coverage, delivery state, spend, and recommendations.
- **Google Analytics** - website traffic totals and page-level interest.
- **AI Chat** - currently a generated plain-language summary for the selected centre. The prompt box is present but disabled.

## Infocare Analytics

This is the primary table. Each row is one centre. The default sort is the app's urgency ranking, with the highest-priority centres first. You can also sort the service name A-Z or Z-A.

The window buttons (`1W`, `2W`, `3W`, `1M`, `2M`, `3M`, `6M`, `12M`) change the time horizon used for forward-looking counts such as children leaving and children turning five. The default is `3M`.

### Service

The centre name from Infocare. Clicking a row selects that centre and updates the AI summary panel.

### ENROL/MAX

Format:

```text
enrolled children / licensed capacity utilisation%
```

Example:

```text
42/50 84%
```

The first number is **enrolled headcount**, not FTE. It is the number of currently enrolled children returned by Infocare.

The second number is the centre's **licensed maximum child capacity**. The app uses Infocare licence `max_children` when available. If Infocare does not provide a usable capacity, the app can use the manual capacity table.

The percentage after `ENROL/MAX` is **booked daily utilisation**, not enrolled FTE. It is calculated as:

```text
average booked children per day / licensed capacity
```

`average booked children per day` is built from booking records. If 45 child-days are booked across 5 distinct booking dates, the average booked children per day is `9`.

Interpretation:

- `42/50 84%` means 42 enrolled children, 50 licensed places, and average booked daily attendance equal to about 84% of licensed capacity.
- The percentage can differ from `42 / 50` because enrolled children may attend different day patterns.
- This percentage is **not FTE**. FTE is calculated separately as weekly booked minutes divided by a 50-hour full-time week.
- A centre can look full by headcount while still having usable gaps on specific days, or look below max by headcount while booked utilisation is high.

### EST

Estimated open places based on bookings, not just enrolled headcount.

Calculation:

```text
licensed capacity - average booked children per day
```

The result is rounded and never shown below zero. `-` means the app does not have enough booking/capacity data to estimate this.

Interpretation:

- A higher `EST` suggests there may be practical room in the weekly booking pattern.
- Treat this as a planning signal, not a promise of available licence places on every day.
- `EST` is also used as a small factor in the default priority listing, but it is weighted below known Leaving pressure.

### U2

Under-2 enrolment against under-2 capacity.

Format:

```text
enrolled under-2 children / licensed under-2 capacity
```

Example:

```text
8/10
```

The enrolled count is based on each enrolled child's birth date at the snapshot date. The capacity comes from Infocare licence `max_u2` or a manual capacity override. If capacity is unknown, the table shows the enrolled count against `-`.

Interpretation:

- `8/10` means two apparent under-2 places remain by headcount.
- Age-band capacity should be checked operationally because staffing, ratios, rooms, and booked days can still constrain availability.

### O2

Over-2 enrolment against over-2 capacity.

Format and interpretation match `U2`, but for children aged two or older.

### Waitlist

Format:

```text
estimated actionable waitlist / total waitlist
```

Example:

```text
12/30
```

The total is the raw Infocare waiting list count for the centre.

The first number estimates entries in the short-to-typical wait range. The current estimate uses the observed waitlist profile constants in `src/analytics/waitlist-profile.ts`: 212 short-or-typical entries out of 549 dated entries. That is about 38.6% of the eligible waitlist. For centres with no under-2 (`U2`) capacity, under-two waitlist children are first removed from the eligible count before this estimate is applied, because those children are not currently serviceable by that centre.

Interpretation:

- `12/30` means 30 total waitlist records, with roughly 12 estimated to be more actionable based on the wait-age distribution and age-band eligibility.
- A big raw waitlist is not automatically strong demand. Older, stale, duplicated, or no-longer-relevant entries can inflate it.
- The Waitlist Quality panel gives more detail about whether the queue looks fresh or stale.

### Age 5+

Number of currently enrolled children who are already five or older at the snapshot date.

Interpretation:

- These children may create near-term replacement pressure, because they are at or past the age where transition to school is expected.
- This is not window-based. It is a current count.
- This column is independent of `Leaving`, so the same child can appear in both `Age 5+` and `Leaving`.

### Near 5

Number of enrolled children who will turn five within the selected time window.

Example: if `3M` is selected, `Near 5` counts children whose fifth birthday falls within the next 90 days.

Interpretation:

- Higher values mean future vacancies may be coming even if the centre looks full now.
- Read this with `Leaving` and `Waitlist`; high near-five pressure plus low actionable waitlist is a warning sign.
- This column is independent of `Leaving`, so the same child can appear in both `Near 5` and `Leaving`.

### Leaving

Number of enrolled children with a known future leaving date inside the selected time window.

Interpretation:

- This is based on explicit Infocare `leaving_date` values.
- It only counts future leaving dates. Past leaving dates are ignored.
- A high value means the centre may need follow-up or marketing before spaces open.
- This column is independent of `Age 5+` and `Near 5`, so a child can appear in `Leaving` as well as one of the age columns.

### Replacement Pressure Overlap

The `Age 5+`, `Near 5`, and `Leaving` table columns are source-signal counts, not mutually exclusive child lists. They are useful for seeing why pressure exists, but they can overlap.

The AI Chat panel and Meta recommendation detail use **replacement pressure**, which deduplicates those signals by child for the selected window. For example, one enrolled child who is turning five soon and has a known future leaving date counts once in replacement pressure, even though they can appear in both `Near 5` and `Leaving` in the table.

### Email

Shows an email action when the centre can be matched to a contact from the centre contact list. It is intended for quickly emailing the centre about Facebook advertising or enrolment follow-up.

## Urgency Ranking

The default table order is not alphabetical. The Infocare Analytics priority listing is weighted toward centres with known children leaving and low actionable waitlist cover. The current priority-listing weights are:

- **65%** - Leaving vs actionable waitlist gap. This is the number of selected-window `Leaving` children not covered by the estimated actionable waitlist.
- **20%** - Raw selected-window `Leaving` count.
- **10%** - `EST`, the estimated booked-day open places. This is capped at 20 estimated places so it can influence the list without dominating it.
- **5%** - Low waitlist signal. The estimated actionable waitlist is the main input, with total raw waitlist also considered when it is low.

The selected window (`1W` through `12M`) changes the Leaving count used in this priority listing.

Separately, the app stores an urgency band for each snapshot. That stored band is calculated from:

- available headcount places,
- waitlist count,
- known leaving pressure,
- children already aged five or older,
- children approaching five,
- whether waitlist cover is low,
- whether both under-2 and over-2 capacity paths are available.

Those stored snapshot scores are converted into a scaled score from 0 to 100. Bands are:

- **Critical** - 75 or above.
- **High** - 50 to 74.
- **Moderate** - 25 to 49.
- **Stable** - below 25.

This means urgency is relative to the current set of centres. A centre can move up or down because its own data changed, or because other centres changed.

## FTE Meaning

FTE is used in the centre narrative, not directly displayed as the `ENROL/MAX` percentage.

The app defines one full-time equivalent child place as:

```text
50 hours per week
```

Calculation:

```text
sum of enrolled children's booked weekly minutes / 3,000 minutes
```

Example:

- A child booked 25 hours per week counts as `0.5` FTE.
- A child booked 50 hours per week counts as `1.0` FTE.
- Two children booked 25 hours each count as `1.0` FTE.

Use FTE to understand booked-hours load. Use `ENROL/MAX` to understand headcount and daily booked utilisation.

## Waitlist Quality

The Waitlist Quality panel checks whether raw waitlist totals are reliable demand signals.

For centres that do not offer under-2 (`U2`) places, under-two waitlist children are excluded from the actionable waitlist estimate before the short-plus-typical wait profile is applied. The raw total remains visible as the denominator.

### `<163d/Total`

Estimated or reported count of entries under 163 days old, shown against total waitlist.

The 163-day threshold comes from the short-plus-typical wait profile. Entries below this threshold are treated as more likely to be current/actionable.

### `163+d/Total`

Estimated or reported count of entries 163 days or older, shown against total waitlist.

Interpretation:

- A high `163+d` share can mean the waitlist is stale or needs cleaning.
- It does not mean every older entry is invalid, but it makes the raw total less reliable.

### Starting Date

When a full waitlist report is available, this shows how many waitlist records had usable starting-date information. In snapshot fallback mode it shows `snapshot`, meaning the panel is using stored analytics snapshots rather than the full waitlist discovery report.

For waitlist age, the preferred source is `application_date`. `starting_date` is only a fallback when `application_date` is unavailable.

### Oldest

The oldest waitlist entry age in days.

Interpretation:

- Very high values suggest stale records or families that may no longer be active prospects.
- Use this with the long-running wait table, not as a standalone decision.

### Median

Median waitlist age in days when a full waitlist report is available. A lower median means the list is generally fresher.

### Waitlist By Distribution Days

Chart of short, typical, long-running, and very-long-running waitlist entries.

When the full report is not available, the app falls back to an estimated split using the observed short-plus-typical share.

### Waitlist Quality Hierarchy

Ranks centres by long-running and very-long-running waitlist pressure.

Columns:

- **Centre** - centre name.
- **Long-running wait** - older waitlist entries.
- **Very long-running wait** - the oldest/stalest waitlist category where report data is available.
- **Max days** - age of the oldest waitlist entry for that centre.

### DOB Profile By Wait Category

Shows the age profile of waitlist records by wait category:

- **Under 5** - likely still age-relevant for early childhood enrolment.
- **Turning 5** - turns five in the current calendar year.
- **Aged 5+** - already five or older.
- **Unknown DOB** - no usable birth date.
- **Total** - all records in that wait category.

Interpretation:

- A waitlist with many aged-five-plus children may overstate real younger-child demand.
- Unknown DOB counts reduce confidence because age relevance cannot be checked.

### Recent Demand

Compares recent new enrolments with new waitlist entries over one, two, and three-month views when the report data is available.

Interpretation:

- More new waitlist entries than enrolments can signal rising demand.
- More enrolments than waitlist entries can signal the centre is filling places but may need future pipeline building.

## META Ads

The Meta Ads panel compares advertising activity with centre demand.

### Summary Cards

- **Active** - ads considered healthy and currently delivering.
- **Learning** - active ads still in Meta's optimisation period or with insufficient lead volume.
- **Learning Limited** - delivery is constrained and usually needs review.
- **Completed** - ads/ad sets that have ended.
- **Not Delivering** - something is preventing spend or delivery.
- **Rejected** - policy/disapproval issue.
- **Amount spent** - spend for the selected dashboard period.

### Ads In Period

Columns:

- **Centre** - matched centre name. If no centre match exists, the app falls back to ad set, campaign, or ad name.
- **Advert** - ad name plus optimisation/ad type where available.
- **Delivery** - normalised Meta delivery state.
- **Results** - primary result count, preferring landing page views, link clicks, leads, website leads, or pixel leads depending on what Meta returns.
- **Impressions** - number of times ads were shown.
- **Amount spent** - spend in NZD for the selected period.
- **CPR** - cost per result, calculated as spend divided by result count.
- **Budget** - daily or lifetime ad set budget, converted from Meta's minor units.
- **Ends** - ad set end date.

Interpretation:

- `Learning` is not automatically bad, especially for newer ads.
- `Learning Limited`, `Not Delivering`, and `Rejected` are stronger review signals.
- High spend with strong waitlist coverage may mean spend should be reviewed.
- No active ads with open places and low actionable waitlist may mean a campaign is needed.

### Recommendations

Recommendations combine Infocare demand with matched Meta coverage.

Labels include:

- **Needs ads** - open places, very low actionable waitlist, and no active campaign.
- **Ads active, monitor** - open places and active spending are present.
- **Review spend** - demand appears covered while ads are still active.
- **Prepare campaign** - upcoming replacement pressure exists but no active campaign is present.
- **Demand covered** - low open places and enough waitlist.
- **Covered by ads** or **Watch** - lower-priority states.

Recommendation detail shows:

```text
open places, actionable waitlist / total waitlist, replacement pressure, active campaigns, spend
```

Replacement pressure is:

```text
deduplicated count of children in Age 5+, Near 5 in selected window, or Leaving in selected window
```

The visible table columns can overlap; replacement pressure counts each child once.

### Notification History

Stores generated recommendation notifications and their status. Notes can be added to recommendations, and dismissed recommendations are retained in history.

## Google Analytics

The Google Analytics panel reports website traffic for the selected date range. The default range is the current month to today.

### Summary Cards

- **Active users** - distinct active users in the selected range.
- **Sessions** - visits/sessions in the selected range.
- **Engaged sessions** - sessions that met Google Analytics engaged-session criteria.
- **Views** - page/screen views.
- **Conversions** - configured conversion events.
- **Revenue** - total revenue reported by GA, if any.
- **Engagement rate** - engaged sessions divided by sessions.
- **Avg session** - average session duration.

When multiple stored snapshots are aggregated, counts are summed and rate/duration metrics are weighted by sessions.

### Most Visited Pages

Columns:

- **Page** - page title/path.
- **Views** - page views.
- **Users** - active users for the page.
- **Sessions** - sessions for the page.
- **Volume** - a visual bar showing relative traffic compared with other listed pages.

Interpretation:

- High views on centre pages can indicate family interest.
- Low users with high views may mean repeated viewing by a smaller audience.

### Meta Ad Centre Pages

Matches active Meta ad centres to Google Analytics pages using centre/ad text tokens.

Columns:

- **Centre** - centre matched from Infocare/Meta.
- **Ads** - count of active/relevant ads.
- **Delivery** - delivery states for those ads.
- **Matched page** - GA page matched to the centre/ad.
- **Views** - page views.
- **Users** - active users.
- **Engagement** - page engagement rate.

Interpretation:

- Ads with matched page traffic suggest families are reaching relevant pages.
- Active ads with little matched traffic may need creative, link, targeting, or landing-page review.

## AI Chat Panel

The panel shows a generated summary for the selected centre and includes an interactive local AI composer named Beep Beep. The summary combines:

- urgency band,
- open places,
- booked-hours/FTE guidance,
- waitlist strength,
- waitlist age quality,
- selected-window leaving and near-five pressure,
- annual/centre history when available,
- manual capacity notes,
- latest stored Meta Ads notes for the selected centre.

The composer posts to `/api/ai/chat`, sends the selected centre and selected window, and keeps a short in-browser history so follow-up questions have conversational context. Answers are grounded in a fresh dashboard context built on each request from Infocare analytics, Meta Ads, Google Analytics, and centre-level recommendation data.

Local AI configuration is controlled through `.env`:

- `AI_PROVIDER=builtin`
- `AI_BASE_URL=http://127.0.0.1:11434`
- `AI_CHAT_MODEL=llama3.1:8b`
- `AI_TIMEOUT_MS=60000`

Leave `AI_PROVIDER` unset, or set it to `builtin`, when you want Beep Beep to run with no external model dependency. Set `AI_PROVIDER=ollama` only when you want the optional local LLM path. `npm run ai:setup` downloads Ollama's standalone Windows runtime into `.local/ollama`, stores model files under `.local/ollama-models`, starts the local runtime, and pulls the configured model. Use `npm run ai:doctor` if the Ollama-backed chat path reports that the local AI is unavailable.

## Important Interpretation Rules

- **Do not treat raw waitlist as clean demand.** Use actionable waitlist, waitlist age, DOB profile, and oldest/median wait.
- **Do not treat `ENROL/MAX` percentage as FTE.** It is booked daily utilisation. FTE is weekly booked minutes divided by 50 hours.
- **Do not treat estimated places as a booking guarantee.** It is a mathematical estimate from average booked child-days and licence capacity.
- **Use the selected window deliberately.** `Near 5` and `Leaving` change when the selected window changes.
- **Read advertising against demand.** An ad is not good or bad by itself; it matters whether the centre has open places, future pressure, and enough waitlist cover.
- **Check data freshness.** Each panel shows pull/snapshot timestamps. Old snapshots can make the recommendations stale.

## Data Quality Notes

- Waitlist age should use `application_date` where available.
- Waitlist `starting_date` is only a fallback and should not be treated as equivalent without saying so.
- The waitlist report is intended to cover every open, non-ignored centre. Partial source data should not be treated as complete truth.
- Centres with missing licence capacity may require manual capacity overrides before they appear correctly in analytics.

## Development Map

- `src/server.ts` - Fastify server, routes, refresh actions, local-host safety.
- `src/analytics/compute.ts` - Infocare analytics calculations.
- `src/analytics/waitlist-profile.ts` - actionable waitlist estimate constants.
- `src/analytics/windows.ts` - selectable time windows.
- `src/ui/app-shell.ts` - dashboard HTML rendering and panel logic.
- `src/storage/*` - Prisma-backed persistence and view models.
- `src/infocare/*` - Infocare client, extraction, sync, and waitlist reports.
- `src/meta/*` - Meta API config, refresh, and centre matching.
- `src/google-analytics/*` - GA config, refresh, and client.
- `docs/metric-contracts.md` - metric rules that should be treated as data contracts.
