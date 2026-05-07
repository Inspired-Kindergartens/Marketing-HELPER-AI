# PLAN

## Goal

Build a useful `META Ads` panel that connects read-only Meta Ads API data to Infocare analytics, so advertising activity can be compared against enrolment, waitlist, available places, and demand pressure.

## Ground Rules

- [x] Follow `META/META-API-SETUP.md`.
- [x] Use read-only Meta Ads API access only.
- [x] Use `ads_read` only.
- [x] Allow only `GET` requests to Meta.
- [x] Do not add campaign, ad set, ad, budget, audience, creative, billing, or business asset write operations.
- [x] Do not request or depend on `ads_management`.
- [ ] Keep unmatched Meta campaigns visible for review instead of hiding them.

## Phase 1: Replace The Placeholder Panel

- [x] Remove the current Meta setup/status metadata from the `META Ads` panel.
- [x] Keep the route/focus id as `panel=meta-ads`.
- [x] Add a static dashboard layout for the future data:
  - [x] Summary strip.
  - [x] Centre-level marketing coverage table.
  - [x] Recent ads section.
  - [x] Recommendation section.
  - [x] Empty-state copy for when Meta data has not been pulled yet.
- [x] Add a refresh action button placeholder for `/actions/refresh-meta-ads`.
- [x] Keep layout consistent with the existing dashboard panels.
- [x] Run `npm.cmd run typecheck`.
- [x] Start the dev server and confirm the `META Ads` panel renders without setup metadata.

## Phase 2: Add Meta Environment Config

- [x] Add env validation for:
  - [x] `META_USER_ID`.
  - [x] `META_ACCESS_TOKEN`.
  - [x] Optional `META_AD_ACCOUNT_ID`.
- [x] Keep `META_ACCESS_TOKEN` out of rendered HTML.
- [x] Add a small config helper for Meta settings.
- [x] Surface missing config as a server-side error for refresh actions.
- [x] Surface missing config as a non-sensitive UI empty state in the panel.
- [x] Run `npm.cmd run typecheck`.

## Phase 3: Add Read-Only Meta Ads Client

- [x] Create `src/meta/client.ts`.
- [x] Set the Graph API base URL to `https://graph.facebook.com/v23.0`.
- [x] Add a single safe GET helper that:
  - [x] Accepts an endpoint path.
  - [x] Accepts query params.
  - [x] Adds the access token server-side.
  - [x] Rejects non-GET behavior by design.
  - [x] Throws clear errors for non-2xx responses.
- [x] Add `listAdAccounts()`.
- [x] Add `listCampaigns(adAccountId)`.
- [x] Add `listAdSets(adAccountId)`.
- [x] Add `listAds(adAccountId)`.
- [x] Add `listInsights(adAccountId, level)`.
- [x] Use only fields allowed in `META/META-API-SETUP.md`.
- [x] Use recommended insights params:
  - [x] `date_preset=last_30d`.
  - [x] `time_increment=1`.
  - [x] `level=campaign | adset | ad`.
- [x] Run `npm.cmd run typecheck`.

## Phase 4: Add Meta Storage

- [x] Update `prisma/schema.prisma` with Meta storage tables.
- [x] Add `MetaAdAccount`.
- [x] Add `MetaCampaign`.
- [x] Add `MetaAdSet`.
- [x] Add `MetaAd`.
- [x] Add `MetaInsightSnapshot`.
- [x] Include timestamps for:
  - [x] Pull time.
  - [x] Meta object create/update time where available.
  - [x] Insight date.
- [x] Store raw IDs from Meta as strings.
- [x] Store spend and rate metrics as decimal/string-safe values rather than lossy integers.
- [x] Add useful indexes:
  - [x] Meta ad account id.
  - [x] Campaign id.
  - [x] Ad set id.
  - [x] Ad id.
  - [x] Pull date.
  - [x] Linked `centreKey` once centre matching exists.
- [x] Run Prisma migration.
- [x] Run `npm.cmd run prisma:generate`.
- [x] Run `npm.cmd run typecheck`.

## Phase 5: Add Refresh Workflow

- [x] Add `/actions/refresh-meta-ads`.
- [x] Read Meta config server-side.
- [x] If `META_AD_ACCOUNT_ID` is set, pull that account only.
- [x] If `META_AD_ACCOUNT_ID` is not set, pull accounts from `/me/adaccounts`.
- [x] Pull campaigns for each selected account.
- [x] Pull ad sets for each selected account.
- [x] Pull ads for each selected account.
- [x] Pull insights for each selected account at:
  - [x] Campaign level.
  - [x] Ad set level.
  - [x] Ad level.
- [x] Store the pull in the Meta snapshot tables.
- [x] Redirect back to the dashboard with the current centre/window/sort preserved.
- [x] Add clear server logging for pull counts and API failures.
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd test`.

## Phase 6: Match Meta Objects To Infocare Centres

- [ ] Create `src/meta/centre-match.ts`.
- [ ] Normalise centre names and campaign/ad/ad set names.
- [ ] Match by exact centre name first.
- [ ] Add conservative fuzzy matching only when confidence is high.
- [ ] Link matched Meta objects to `centreKey`.
- [ ] Keep unmatched campaigns in a review list.
- [ ] Add a future manual override table or config option for inconsistent campaign names.
- [ ] Add tests for:
  - [ ] Exact name matches.
  - [ ] Common punctuation/case differences.
  - [ ] Non-matches that should remain unmatched.
- [ ] Run `npm.cmd test`.

## Phase 7: Build Joined Meta + Infocare Metrics

- [ ] Create a metrics module, for example `src/meta/analytics.ts`.
- [ ] For each centre, compute:
  - [ ] Active ads count.
  - [ ] Active campaigns count.
  - [ ] Recent campaigns count.
  - [ ] Spend in the last 30 days.
  - [ ] Impressions.
  - [ ] Reach.
  - [ ] Clicks.
  - [ ] Inline link clicks.
  - [ ] CTR.
  - [ ] CPC.
  - [ ] CPM.
  - [ ] Frequency.
  - [ ] Enrolment change.
  - [ ] Waitlist change.
  - [ ] Available-place change.
  - [ ] Known leaving pressure.
  - [ ] Aged-out pressure.
- [ ] Define active/recent Meta windows.
- [ ] Join against existing Infocare snapshot history.
- [ ] Handle missing Meta data without crashing the dashboard.
- [ ] Run `npm.cmd run typecheck`.

## Phase 8: Implement First Useful Panel Features

- [ ] Render `Recent Ads Running`.
  - [ ] Centre.
  - [x] Campaign.
  - [ ] Ad set.
  - [x] Ad.
  - [x] Status.
  - [x] Spend.
  - [x] Clicks.
  - [x] CTR.
  - [x] CPC.
  - [ ] Linked Infocare status.
- [ ] Render `Low Enrolment + No Ads`.
  - [ ] Enrolment below licensed capacity.
  - [ ] Weak or moderate waitlist cover.
  - [ ] No active/recent Meta campaign.
- [ ] Render `Low Enrolment + Active Ads`.
  - [ ] Ads are active/recent.
  - [ ] Enrolment remains below target.
  - [ ] Show whether ad activity may be too recent to judge.
- [ ] Add empty states for each section.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Start the dev server and inspect the panel.

## Phase 9: Add Spend Review And Impact Features

- [ ] Render `High Waitlist + Active Ads`.
  - [ ] Strong waitlist demand.
  - [ ] Active ad spend.
  - [ ] Recommendation to review or reduce spend.
- [ ] Render `Campaign Impact vs Enrolment`.
  - [ ] Before campaign.
  - [ ] During campaign.
  - [ ] After campaign.
  - [ ] Enrolment delta.
  - [ ] Waitlist delta.
  - [ ] Available-place delta.
  - [ ] Cost per movement.
- [ ] Render `Waitlist Uptake After Ads`.
  - [ ] 7-day window.
  - [ ] 14-day window.
  - [ ] 30-day window.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.

## Phase 10: Add Lag, Efficiency, And Recommendations

- [ ] Render `Lead Lag Analysis`.
  - [ ] First waitlist increase after campaign start.
  - [ ] First enrolment increase after campaign start.
  - [ ] Average lag by centre.
  - [ ] Average lag by campaign.
- [ ] Render `Ad Spend Efficiency`.
  - [ ] Cost per click.
  - [ ] Cost per waitlist increase.
  - [ ] Cost per enrolment increase.
  - [ ] Cost per available-place reduction.
  - [ ] Spend with no measurable movement.
- [ ] Add rule-based recommendations:
  - [ ] `Needs ads`.
  - [ ] `Ads active, monitor`.
  - [ ] `Ads active, weak response`.
  - [ ] `Reduce ads`.
  - [ ] `Strong demand, no ads needed`.
  - [ ] `High leaving pressure, prepare campaign`.
- [ ] Add a `Marketing Coverage Score`.
  - [ ] Capacity gap.
  - [ ] Waitlist strength.
  - [ ] Leaving pressure.
  - [ ] Active Meta coverage.
  - [ ] Recent Meta performance.
  - [ ] Recent Infocare movement.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.

## Phase 11: Add Focused Timeline View

- [ ] Add a focused `panel=meta-ads` layout if the compact panel becomes too dense.
- [ ] Add a campaign timeline overlay with:
  - [ ] Enrolment trend.
  - [ ] Waitlist trend.
  - [ ] Available places.
  - [ ] Campaign active periods.
  - [ ] Ad set active periods.
  - [ ] Daily spend.
- [ ] Reuse Chart.js if suitable.
- [ ] Check desktop and mobile layout.
- [ ] Run `npm.cmd run typecheck`.

## Final Verification

- [ ] `npm.cmd run typecheck` passes.
- [ ] `npm.cmd test` passes.
- [ ] Dev server starts.
- [ ] Root dashboard renders.
- [ ] `/?panel=meta-ads` renders.
- [ ] The `META Ads` panel no longer shows setup metadata.
- [ ] Meta access token is never rendered into HTML.
- [ ] No non-GET Meta API operations exist.
- [ ] No `ads_management` permission is required.
- [ ] Empty state works when no Meta data has been pulled.
- [ ] Data state works after a Meta refresh.

## Notes

- Best first value comes from:
  - [ ] `Recent Ads Running`.
  - [ ] `Low Enrolment + No Ads`.
  - [ ] `Low Enrolment + Active Ads`.
- More advanced value comes after enough daily Meta and Infocare history exists:
  - [ ] Campaign impact.
  - [ ] Lead lag.
  - [ ] Spend efficiency.
  - [ ] Timeline overlay.
