# Metric Contracts

These rules define the meaning of core dashboard metrics. Treat any change here as a data contract change, not a UI or refactor change.

## Infocare Waitlist Age

- Waitlist age means days since the child joined the waitlist.
- The source field for waitlist age is `application_date`.
- `starting_date` is not equivalent to `application_date` for waitlist records.
- `starting_date` may only be used as an explicit fallback when `application_date` is absent and the code/report states that fallback clearly.
- Oldest waitlist entry, median wait, average wait, and short/typical/long/very-long threshold counts all use the waitlist-age basis above.

## Infocare Enrolment Dates

- Current enrolment start and recent-enrolment metrics may use enrolled-child `starting_date`.
- Do not reuse enrolled-child date semantics for waitlist age without verifying the Infocare source field.

## Completeness

- A waitlist report must cover every open, non-ignored centre selected for the pull.
- If any centre/API segment fails, the refresh must fail and must not overwrite `INFOCARE/INFOCARE-WAITLIST.md`.
- Dashboard readers must reject reports that disclose skipped centres or API errors.
- Partial source data must not be presented as the truth.
