import { z } from "zod";

const windowScopedCountsSchema = z.object({
  "1W": z.number().int(),
  "2W": z.number().int(),
  "3W": z.number().int(),
  "1M": z.number().int(),
  "2M": z.number().int(),
  "3M": z.number().int(),
  "6M": z.number().int(),
  "12M": z.number().int(),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date.");

const nullableIsoDateSchema = z.union([isoDateSchema, z.literal(""), z.null()]).optional();

export const infocareEnvelopeSchema = z
  .object({
    msg_status: z.string(),
    message: z.string().optional(),
  })
  .passthrough();

export const infocareCentreSchema = z
  .object({
    centre_key: z.coerce.number().int(),
    name: z.string(),
    open_status: z.string(),
    license_number: z.coerce.number().int().optional(),
    region_name: z.string().optional(),
    area_name: z.string().optional(),
    subgroup_name: z.string().optional(),
    postal_city: z.string().optional(),
  })
  .passthrough();

export const infocareCentreListResponseSchema = infocareEnvelopeSchema.extend({
  centre_list: z.array(infocareCentreSchema),
});

export const infocareChildSchema = z
  .object({
    child_key: z.coerce.number().int(),
    centre_key: z.coerce.number().int().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    birth_date: nullableIsoDateSchema,
    starting_date: nullableIsoDateSchema,
    leaving_date: nullableIsoDateSchema,
  })
  .passthrough();

export const infocareChildListResponseSchema = infocareEnvelopeSchema.extend({
  child_list: z.array(infocareChildSchema),
});

export const infocareChildResponseSchema = infocareEnvelopeSchema.extend({
  child: infocareChildSchema,
});

export const infocareLicenseSchema = z
  .object({
    centre_key: z.coerce.number().int().optional(),
    license_number: z.coerce.number().int().optional(),
    max_children: z.coerce.number().int(),
    max_u2: z.coerce.number().int().optional(),
    max_o2: z.coerce.number().int().optional(),
  })
  .passthrough();

export const infocareLicenseListResponseSchema = infocareEnvelopeSchema.extend({
  license_list: z.array(infocareLicenseSchema).optional(),
  day_list: z.array(z.unknown()).optional(),
});

export const infocareBookingSchema = z
  .object({
    child_key: z.coerce.number().int().optional(),
    date: isoDateSchema.optional(),
    room: z.string().optional(),
    start1: z.string().optional(),
    end1: z.string().optional(),
    start2: z.string().optional(),
    end2: z.string().optional(),
    start3: z.string().optional(),
    end3: z.string().optional(),
  })
  .passthrough();

export const infocareBookingListResponseSchema = infocareEnvelopeSchema.extend({
  booking_list: z.array(infocareBookingSchema).optional(),
});

export const centreReferenceSchema = z.object({
  centreKey: z.number().int(),
  name: z.string(),
  openStatus: z.string(),
  licenseNumber: z.number().int().optional(),
  regionName: z.string().optional(),
  areaName: z.string().optional(),
  subgroupName: z.string().optional(),
  ignored: z.boolean(),
  lastSyncedAt: z.string().datetime(),
});

export const urgencyBandSchema = z.enum(["Critical", "High", "Moderate", "Stable"]);

export const serviceAnalyticsSnapshotSchema = z.object({
  centreKey: z.number().int(),
  serviceName: z.string(),
  date: isoDateSchema,
  enrolledCount: z.number().int(),
  enrolledFteCount: z.number(),
  bookedAverageDailyCount: z.number(),
  bookedUtilisationRatio: z.number(),
  enrolledUnder2Count: z.number().int(),
  enrolledOver2Count: z.number().int(),
  licensedCapacity: z.number().int(),
  licensedUnder2Capacity: z.number().int().nullable().optional(),
  licensedOver2Capacity: z.number().int().nullable().optional(),
  enrolmentRatio: z.number(),
  waitlistCount: z.number().int(),
  waitlistUnder5Count: z.number().int(),
  waitlistTurning5ThisYearCount: z.number().int(),
  waitlistAged5PlusCount: z.number().int(),
  waitlistUnknownAgeCount: z.number().int(),
  waitlistOldestEntryDays: z.number().int().nullable().optional(),
  waitlistAverageEntryDays: z.number().nullable().optional(),
  knownLeavingCount: z.number().int(),
  knownLeavingCountsByWindow: windowScopedCountsSchema,
  agedOutCount: z.number().int(),
  approachingFiveCount: z.number().int(),
  approachingFiveCountsByWindow: windowScopedCountsSchema,
  replacementPressure: z.number().int(),
  waitlistCoverRatio: z.number(),
  urgencyScore: z.number(),
  urgencyBand: urgencyBandSchema,
});

export const infocareChildListCategorySchema = z.enum([
  "Current enrolments",
  "Waiting list",
  "Not started",
  "Left",
]);

export type InfocareEnvelope = z.infer<typeof infocareEnvelopeSchema>;
export type InfocareCentre = z.infer<typeof infocareCentreSchema>;
export type InfocareCentreListResponse = z.infer<typeof infocareCentreListResponseSchema>;
export type InfocareChild = z.infer<typeof infocareChildSchema>;
export type InfocareChildListResponse = z.infer<typeof infocareChildListResponseSchema>;
export type InfocareChildResponse = z.infer<typeof infocareChildResponseSchema>;
export type InfocareLicense = z.infer<typeof infocareLicenseSchema>;
export type InfocareBooking = z.infer<typeof infocareBookingSchema>;
export type InfocareBookingListResponse = z.infer<typeof infocareBookingListResponseSchema>;
export type InfocareLicenseListResponse = z.infer<typeof infocareLicenseListResponseSchema>;
export type CentreReference = z.infer<typeof centreReferenceSchema>;
export type UrgencyBand = z.infer<typeof urgencyBandSchema>;
export type ServiceAnalyticsSnapshot = z.infer<typeof serviceAnalyticsSnapshotSchema>;
export type InfocareChildListCategory = z.infer<typeof infocareChildListCategorySchema>;
export type WindowScopedCounts = z.infer<typeof windowScopedCountsSchema>;

export function parseInfocareCentreListResponse(value: unknown) {
  return infocareCentreListResponseSchema.parse(value);
}

export function parseInfocareChildListResponse(value: unknown) {
  return infocareChildListResponseSchema.parse(value);
}

export function parseInfocareChildResponse(value: unknown) {
  return infocareChildResponseSchema.parse(value);
}

export function parseInfocareLicenseListResponse(value: unknown) {
  const parsed = infocareLicenseListResponseSchema.parse(value);

  return {
    ...parsed,
    license_list: parsed.license_list ?? [],
  };
}

export function parseInfocareBookingListResponse(value: unknown) {
  const parsed = infocareBookingListResponseSchema.parse(value);

  return {
    ...parsed,
    booking_list: parsed.booking_list ?? [],
  };
}
