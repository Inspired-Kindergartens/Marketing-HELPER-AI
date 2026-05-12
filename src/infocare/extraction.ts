import { createInfocareClient } from "./client.js";
import {
  type InfocareBooking,
  type CentreReference,
  type InfocareChild,
  type InfocareChildListCategory,
  type InfocareLicense,
  parseInfocareBookingListResponse,
  parseInfocareChildListResponse,
  parseInfocareLicenseListResponse,
} from "./models.js";

export const CURRENT_ENROLMENTS_CATEGORY = "Current enrolments";
export const WAITING_LIST_CATEGORY = "Waiting list";

export type ExtractionDateRange = {
  startDate: string;
  endDate: string;
};

export type CentreExtractionBundle = {
  centre: CentreReference;
  enrolledChildren: InfocareChild[];
  waitingListChildren: InfocareChild[];
  licenses: InfocareLicense[];
  bookingMinutesByChildKey: Record<number, number>;
  bookingDatesByChildKey: Record<number, string[]>;
  extractedAt: string;
};

type InfocareClientLike = ReturnType<typeof createInfocareClient>;

type ChildListRequest = {
  centreKey: number;
  category: InfocareChildListCategory;
  dateRange: ExtractionDateRange;
};

type LicenseListRequest = {
  centreKey: number;
};

type BookingListRequest = {
  childKey: number;
  dateRange: ExtractionDateRange;
};

type ExtractCentreBundleOptions = {
  client?: InfocareClientLike;
  dateRange?: ExtractionDateRange;
};

type ExtractCentreBundlesOptions = ExtractCentreBundleOptions & {
  centres: readonly CentreReference[];
};

function redactChildIdentity(child: InfocareChild): InfocareChild {
  return {
    ...child,
    first_name: undefined,
    last_name: undefined,
  };
}

function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildExtractionDateRange(now: Date = new Date()): ExtractionDateRange {
  const today = toIsoDateOnly(now);

  return {
    startDate: today,
    endDate: today,
  };
}

export function buildWeeklyExtractionDateRange(now: Date = new Date()): ExtractionDateRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);

  return {
    startDate: toIsoDateOnly(start),
    endDate: toIsoDateOnly(end),
  };
}

function parseTimeToMinutes(value?: string) {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function calculateBookingMinutes(booking: InfocareBooking) {
  const slots = [
    [booking.start1, booking.end1],
    [booking.start2, booking.end2],
    [booking.start3, booking.end3],
  ] as const;

  return slots.reduce((sum, [start, end]) => {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
      return sum;
    }

    return sum + (endMinutes - startMinutes);
  }, 0);
}

function hasBookedTime(booking: InfocareBooking) {
  return calculateBookingMinutes(booking) > 0;
}

export async function fetchCentreChildList(
  request: ChildListRequest,
  client: InfocareClientLike = createInfocareClient(),
) {
  const response = await client.request("get_child_list", {
    centre_key: request.centreKey,
    category: request.category,
    start_date: request.dateRange.startDate,
    end_date: request.dateRange.endDate,
  });
  const parsed = parseInfocareChildListResponse(response);

  return parsed.child_list.map(redactChildIdentity);
}

export async function fetchCentreLicenseList(
  request: LicenseListRequest,
  client: InfocareClientLike = createInfocareClient(),
) {
  const response = await client.request("get_license_list", {
    centre_key: request.centreKey,
  });
  const parsed = parseInfocareLicenseListResponse(response);

  return parsed.license_list;
}

export async function fetchChildBookingList(
  request: BookingListRequest,
  client: InfocareClientLike = createInfocareClient(),
) {
  const response = await client.request("get_booking_list", {
    child_key: request.childKey,
    start_date: request.dateRange.startDate,
    end_date: request.dateRange.endDate,
  });
  const parsed = parseInfocareBookingListResponse(response);

  return parsed.booking_list;
}

export async function extractCentreBundle(
  centre: CentreReference,
  options: ExtractCentreBundleOptions = {},
): Promise<CentreExtractionBundle> {
  const client = options.client ?? createInfocareClient();
  const dateRange = options.dateRange ?? buildExtractionDateRange();
  const weeklyDateRange = buildWeeklyExtractionDateRange(new Date(dateRange.endDate));
  const [enrolledChildren, waitingListChildren, licenses] = await Promise.all([
    fetchCentreChildList(
      {
        centreKey: centre.centreKey,
        category: CURRENT_ENROLMENTS_CATEGORY,
        dateRange,
      },
      client,
    ),
    fetchCentreChildList(
      {
        centreKey: centre.centreKey,
        category: WAITING_LIST_CATEGORY,
        dateRange,
      },
      client,
    ),
    fetchCentreLicenseList(
      {
        centreKey: centre.centreKey,
      },
      client,
    ),
  ]);
  const bookingLists = await Promise.all(
    enrolledChildren.map(async (child) => ({
      childKey: child.child_key,
      bookings: await fetchChildBookingList(
        {
          childKey: child.child_key,
          dateRange: weeklyDateRange,
        },
        client,
      ),
    })),
  );
  const bookingMinutesByChildKey = Object.fromEntries(
    bookingLists.map(({ childKey, bookings }) => [
      childKey,
      bookings.reduce((sum, booking) => sum + calculateBookingMinutes(booking), 0),
    ]),
  );
  const bookingDatesByChildKey = Object.fromEntries(
    bookingLists.map(({ childKey, bookings }) => [
      childKey,
      [
        ...new Set(
          bookings
            .filter((booking) => booking.date && hasBookedTime(booking))
            .map((booking) => booking.date as string),
        ),
      ],
    ]),
  );

  return {
    centre,
    enrolledChildren,
    waitingListChildren,
    licenses,
    bookingMinutesByChildKey,
    bookingDatesByChildKey,
    extractedAt: new Date().toISOString(),
  };
}

export async function extractCentreBundles(
  options: ExtractCentreBundlesOptions,
): Promise<CentreExtractionBundle[]> {
  const client = options.client ?? createInfocareClient();
  const dateRange = options.dateRange ?? buildExtractionDateRange();
  const bundles: CentreExtractionBundle[] = [];

  for (const centre of options.centres) {
    bundles.push(
      await extractCentreBundle(centre, {
        client,
        dateRange,
      }),
    );
  }

  return bundles;
}
