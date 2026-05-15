import { DateTime } from "luxon";

export const HOLIDAYS = [
  { month: 1, day: 21 }, { month: 2, day: 12 }, { month: 3, day: 4 },
  { month: 5, day: 2 },  { month: 6, day: 16 }, { month: 7, day: 26 },
  { month: 8, day: 3 },  { month: 9, day: 1 },  { month: 11, day: 5 },
  { month: 12, day: 18 },
] as const;

export type DiscountType = "holiday" | "duration" | null;

export interface DiscountInfo {
  discountType: DiscountType;
  effectiveTotalPriceCents: number;
  savingsCents: number;
}

export function hasHolidayInRange(start: DateTime, end: DateTime): boolean {
  const startDay = start.startOf("day");
  const endDay = end.startOf("day");
  for (let year = start.year; year <= end.year; year++) {
    for (const { month, day } of HOLIDAYS) {
      const h = DateTime.fromObject({ year, month, day });
      if (h > startDay && h < endDay) return true;
    }
  }
  return false;
}

export function hasDurationDiscount(durationInHours: number): boolean {
  return durationInHours > 72;
}

export function calculateDiscount(
  start: DateTime,
  end: DateTime,
  hourlyRateCents: number,
  durationInHours: number,
): DiscountInfo {
  const baseTotalCents = hourlyRateCents * durationInHours;

  const holidaySavings = hasHolidayInRange(start, end)
    ? Math.round(baseTotalCents * 0.17)
    : null;
  const durationSavings = hasDurationDiscount(durationInHours)
    ? Math.min(1000 * durationInHours, baseTotalCents)
    : null;

  let savings = 0;
  let type: DiscountType = null;
  if (holidaySavings !== null && (durationSavings === null || holidaySavings >= durationSavings)) {
    savings = holidaySavings;
    type = "holiday";
  } else if (durationSavings !== null) {
    savings = durationSavings;
    type = "duration";
  }

  return {
    discountType: type,
    effectiveTotalPriceCents: Math.max(0, baseTotalCents - savings),
    savingsCents: savings,
  };
}
