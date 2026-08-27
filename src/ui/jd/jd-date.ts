export const NZ_TIME_ZONE = "Pacific/Auckland";

function dateParts(iso: string | Date | null): Record<string, string> | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: NZ_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

export function formatNzDateInput(iso: string | Date | null): string {
  const parts = dateParts(iso);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function formatNzDateTimeInput(iso: string | Date | null): string {
  const parts = dateParts(iso);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : "";
}

export function formatNzDisplayDate(iso: string | Date | null): string {
  const parts = dateParts(iso);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : "";
}

export function formatNzClosingDate(iso: string | Date | null): string {
  const parts = dateParts(iso);
  if (!parts) return "";

  const hour = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);
  const timePart =
    minute === 0
      ? `${hour % 12 === 0 ? 12 : hour % 12}${hour >= 12 ? "pm" : "am"}`
      : `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;

  return `${parts.day}/${parts.month}/${parts.year} at ${timePart}`;
}
