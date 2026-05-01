import { readOpenCentreReferences, upsertManualCentreCapacities } from "../storage/analytics-store.js";
import { buildManualCapacityOverrides } from "./manual-capacity.js";

export async function syncManualCentreCapacitiesFromSeedData() {
  const centres = await readOpenCentreReferences();
  const overrides = buildManualCapacityOverrides(centres);
  const saved = await upsertManualCentreCapacities(overrides);

  return {
    centresConsidered: centres.length,
    overridesPrepared: overrides.length,
    savedCount: saved.length,
    saved,
  };
}
