import { createCentreReferenceStore } from "../storage/analytics-store.js";
import { syncCentreReferences, type SyncCentreReferencesOptions } from "./sync.js";

type SyncStoredCentreReferencesOptions = Omit<SyncCentreReferencesOptions, "store">;

export async function syncStoredCentreReferences(
  options: SyncStoredCentreReferencesOptions = {},
) {
  return syncCentreReferences({
    ...options,
    store: createCentreReferenceStore(),
  });
}
