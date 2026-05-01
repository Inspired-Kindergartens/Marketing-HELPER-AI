export const WINDOW_OPTIONS = [
  { key: "1W", label: "1W", days: 7 },
  { key: "2W", label: "2W", days: 14 },
  { key: "3W", label: "3W", days: 21 },
  { key: "1M", label: "1M", days: 30 },
  { key: "2M", label: "2M", days: 60 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "12M", label: "12M", days: 365 },
] as const;

export type WindowKey = (typeof WINDOW_OPTIONS)[number]["key"];

export function resolveWindowKey(input?: string | null): WindowKey {
  return WINDOW_OPTIONS.find((option) => option.key === input)?.key ?? "3M";
}

export function getWindowOption(windowKey: string) {
  return WINDOW_OPTIONS.find((option) => option.key === windowKey) ?? WINDOW_OPTIONS[5];
}

export function resolveWindowStartDate(baseDate: Date, windowKey: string) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() - getWindowOption(windowKey).days);

  return next;
}
