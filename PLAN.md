# PLAN

## Goal

Execute the remaining items in `FEATURES.md` with a first practical implementation that uses stored daily analytics history and improves the AI chat guidance.

## Decisions

- Use database-backed daily snapshots, not session storage, because the time-window filters need stable historical data across app restarts.
- Treat part-time/full-time equivalent as a separate estimate from the current headcount.
- Use Infocare booking data as the likely source for an FTE estimate because plain child list counts are not enough.

## Execution

1. Add a first-pass FTE data path
   - Allowlist booking reads from Infocare.
   - Parse booking rows and derive a simple FTE estimate from booked minutes across a standard full-time week.
   - Store both headcount and FTE estimate in analytics snapshots.

2. Make time-window filters affect the dashboard data
   - Read historical snapshots from the database for the selected window.
   - Build a windowed table view from the latest snapshot inside that window, rather than always using the absolute latest run.
   - Keep AI chat and summary panels aligned to the same selected window.

3. Improve interaction and copy
   - Change `ENROLLED / CAPACITY` to `ENROL/MAX`.
   - Make the full analytics row clickable.
   - Remove redundant hierarchy/score language.
   - Replace blunt numeric copy with shorter informal guidance and actionable phrases.
   - Reserve the AI Chat header meta area for future runtime metadata such as the active AI model name and the latest proprietary document/version identifier being used for retrieval.

4. Start daily snapshot collection
   - Add a server-side check on startup to ensure today has a snapshot.
   - If today is missing, collect one automatically and store it in the database.

5. Update checklist and verify
   - Mark completed `FEATURES.md` items as `[x]`.
   - Run typecheck and restart the local server.

## Next Panel Design

### Waitlist Quality Panel

- Add a dedicated panel fed by `INFOCARE-WAITLIST.md` style aggregated data.
- Pull this dataset monthly from Infocare and store the pull timestamp plus summary metrics in the database.
- Include an `Update now` button so a user can manually refresh the panel on demand.
- Show `last pulled` in days so users can judge how fresh the waitlist-quality analytics are.
- Keep the `INFOCARE ANALYTICS` table `Waitlist` column as an interim weighted `short+typical / total` view using the current report ratio until the panel can show centre-level wait-age detail directly.
- Panel content should focus on:
  - waitlist age bell curve
  - long-tail centres
  - centres with overwhelming demand
  - centres where the visible waitlist looks old enough to justify a quality-check warning
  - centres where older children on the waitlist may overstate younger-child demand
