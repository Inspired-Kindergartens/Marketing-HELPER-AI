// Pure KTCA pay-scale math, kept free of Prisma so it can be unit tested
// directly (mirrors the task-status.ts split of pure helpers from the store).

export type PayScaleRow = {
  scaleKey: string;
  step: number | null;
  effectiveFrom: Date;
  annualRate: number;
};

// Picks, for a given scaleKey/step, the row with the latest effectiveFrom
// that is not after `date` — i.e. the currently-effective rate.
function effectiveRow(
  rows: PayScaleRow[],
  scaleKey: string,
  step: number | null,
  date: Date,
): PayScaleRow | null {
  let best: PayScaleRow | null = null;
  for (const row of rows) {
    if (row.scaleKey !== scaleKey || row.step !== step) continue;
    if (row.effectiveFrom.getTime() > date.getTime()) continue;
    if (!best || row.effectiveFrom.getTime() > best.effectiveFrom.getTime()) {
      best = row;
    }
  }
  return best;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Pro-rates a full-time annual rate by FTE, rounded to 2 decimal places.
function proRate(amount: number, fte: number | null | undefined): number {
  if (fte == null || fte >= 1) return amount;
  return Math.round(amount * fte * 100) / 100;
}

// Formats the salary range/figure text for a JD, e.g.:
//   K1: "$62,862 to $105,686"          (stepped scale, full time)
//   K2: "$113,356"                      (flat scale)
//   K1 @ 0.6 FTE: "$37,717.20 to $63,411.60"
// Returns null if no rates are known for the scale at the given date.
export function formatSalaryRange(
  rows: PayScaleRow[],
  scaleKey: string,
  date: Date,
  fte?: number | null,
): string | null {
  const stepped = rows.some((row) => row.scaleKey === scaleKey && row.step != null);

  if (stepped) {
    const steps = Array.from(
      new Set(rows.filter((row) => row.scaleKey === scaleKey).map((row) => row.step)),
    ) as number[];
    const min = Math.min(...steps);
    const max = Math.max(...steps);
    const lowRow = effectiveRow(rows, scaleKey, min, date);
    const highRow = effectiveRow(rows, scaleKey, max, date);
    if (!lowRow || !highRow) return null;
    return `${formatMoney(proRate(lowRow.annualRate, fte))} to ${formatMoney(proRate(highRow.annualRate, fte))}`;
  }

  const flatRow = effectiveRow(rows, scaleKey, null, date);
  if (!flatRow) return null;
  return formatMoney(proRate(flatRow.annualRate, fte));
}

// Returns the annual rate for a specific scaleKey/step effective at `date`,
// or null if unknown. Used by the KTCA-import review screen.
export function getEffectiveRate(
  rows: PayScaleRow[],
  scaleKey: string,
  step: number | null,
  date: Date,
): number | null {
  return effectiveRow(rows, scaleKey, step, date)?.annualRate ?? null;
}
