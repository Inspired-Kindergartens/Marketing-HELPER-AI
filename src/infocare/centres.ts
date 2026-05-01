import { createInfocareClient } from "./client.js";
import {
  type CentreReference,
  type InfocareCentre,
  parseInfocareCentreListResponse,
} from "./models.js";

export const OPEN_CENTRE_STATUS = "Open";
export const EXCLUDED_CENTRE_NAMES = new Set(["other staff", "opeys oscar"]);

type InfocareClientLike = ReturnType<typeof createInfocareClient>;

function normalizeCentreName(name: string) {
  return name.trim().toLowerCase();
}

export function isExcludedCentreName(name: string) {
  return EXCLUDED_CENTRE_NAMES.has(normalizeCentreName(name));
}

export function isOpenCentre(centre: InfocareCentre) {
  return centre.open_status.trim() === OPEN_CENTRE_STATUS;
}

export function isRealOpenCentre(centre: InfocareCentre) {
  return isOpenCentre(centre) && !isExcludedCentreName(centre.name);
}

export function toCentreReference(
  centre: InfocareCentre,
  syncedAt: Date = new Date(),
): CentreReference {
  return {
    centreKey: centre.centre_key,
    name: centre.name.trim(),
    openStatus: centre.open_status.trim(),
    licenseNumber: centre.license_number,
    regionName: centre.region_name?.trim() || undefined,
    areaName: centre.area_name?.trim() || undefined,
    subgroupName: centre.subgroup_name?.trim() || undefined,
    ignored: false,
    lastSyncedAt: syncedAt.toISOString(),
  };
}

export function mapCentreReferences(
  centres: readonly InfocareCentre[],
  syncedAt: Date = new Date(),
) {
  return centres
    .filter(isRealOpenCentre)
    .map((centre) => toCentreReference(centre, syncedAt));
}

export async function fetchCentreReferences(
  client: InfocareClientLike = createInfocareClient(),
  syncedAt: Date = new Date(),
) {
  const response = await client.request("get_centre_list", {});
  const parsedResponse = parseInfocareCentreListResponse(response);

  return mapCentreReferences(parsedResponse.centre_list, syncedAt);
}
