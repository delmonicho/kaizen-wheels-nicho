import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  hasHolidayInRange,
  hasDurationDiscount,
  calculateDiscount,
  HOLIDAY_DISCOUNT_RATE,
  DURATION_DISCOUNT_CENTS_PER_HOUR,
} from "../discounts.js";

const dt = (iso: string) => DateTime.fromISO(iso);

describe("hasHolidayInRange", () => {
  // data-driven: every holiday × 3 boundary assertions (30 tests)
  const ALL_HOLIDAYS = [
    { month: 1,  day: 21, label: "Jan 21" },
    { month: 2,  day: 12, label: "Feb 12" },
    { month: 3,  day: 4,  label: "Mar 04" },
    { month: 5,  day: 2,  label: "May 02" },
    { month: 6,  day: 16, label: "Jun 16" },
    { month: 7,  day: 26, label: "Jul 26" },
    { month: 8,  day: 3,  label: "Aug 03" },
    { month: 9,  day: 1,  label: "Sep 01" },
    { month: 11, day: 5,  label: "Nov 05" },
    { month: 12, day: 18, label: "Dec 18" },
  ];

  for (const { month, day, label } of ALL_HOLIDAYS) {
    const h    = DateTime.fromObject({ year: 2025, month, day });
    const prev = h.minus({ days: 1 });
    const next = h.plus({ days: 1 });

    test(`${label} strictly inside prev–next → true`, () =>
      assert.equal(hasHolidayInRange(prev, next), true));

    test(`${label} start boundary — range begins on holiday → false`, () =>
      assert.equal(hasHolidayInRange(h, next), false));

    test(`${label} end boundary — range ends on holiday → false`, () =>
      assert.equal(hasHolidayInRange(prev, h), false));
  }

  // retained: scenarios the loop cannot cover (4 tests)

  test("Jan 22–Jan 24 — no holiday in range", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-22"), dt("2025-01-24")), false);
  });

  test("cross-year Dec 31 → Jan 22 — Jan 21 inside", () => {
    assert.equal(hasHolidayInRange(dt("2025-12-31"), dt("2026-01-22")), true);
  });

  test("Jan 20–Mar 05 — multiple holidays inside", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-20"), dt("2025-03-05")), true);
  });

  test("start = Jan 21 23:00, end = Jan 22 01:00 — holiday is the start day → false", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-21T23:00:00"), dt("2025-01-22T01:00:00")), false);
  });
});

describe("hasDurationDiscount", () => {
  test("72.0 hours → false", () => {
    assert.equal(hasDurationDiscount(72.0), false);
  });

  test("72.001 hours → true", () => {
    assert.equal(hasDurationDiscount(72.001), true);
  });

  test("48 hours → false", () => {
    assert.equal(hasDurationDiscount(48), false);
  });

  test("96 hours → true", () => {
    assert.equal(hasDurationDiscount(96), true);
  });
});

describe("calculateDiscount", () => {
  const start      = dt("2025-01-20");
  const end        = dt("2025-01-22"); // Jan 21 inside → holiday
  const hourlyRate = 5000;             // $50/hr
  const hours24    = 24;
  const hours96    = 96;

  test("holiday inside, ≤ 72h → holiday discount", () => {
    const result = calculateDiscount(start, end, hourlyRate, hours24);
    const base = hourlyRate * hours24;
    assert.equal(result.discountType, "holiday");
    assert.equal(result.savingsCents, Math.round(base * HOLIDAY_DISCOUNT_RATE));
    assert.equal(result.effectiveTotalPriceCents, base - Math.round(base * HOLIDAY_DISCOUNT_RATE));
    assert.equal(result.effectiveHourlyRateCents, hourlyRate);
  });

  test("no holiday, > 72h → duration discount", () => {
    const noHolStart = dt("2025-01-22");
    const noHolEnd   = dt("2025-01-26");
    const result = calculateDiscount(noHolStart, noHolEnd, hourlyRate, hours96);
    const base = hourlyRate * hours96;
    assert.equal(result.discountType, "duration");
    assert.equal(result.savingsCents, DURATION_DISCOUNT_CENTS_PER_HOUR * hours96);
    assert.equal(result.effectiveTotalPriceCents, base - DURATION_DISCOUNT_CENTS_PER_HOUR * hours96);
    assert.equal(result.effectiveHourlyRateCents, hourlyRate - DURATION_DISCOUNT_CENTS_PER_HOUR);
  });

  test("both apply, holiday saves more → holiday wins", () => {
    const highRate = 10000;
    const hSavings = Math.round(highRate * hours96 * HOLIDAY_DISCOUNT_RATE); // 163200
    const dSavings = DURATION_DISCOUNT_CENTS_PER_HOUR * hours96;             // 96000
    assert.ok(hSavings > dSavings);
    const result = calculateDiscount(dt("2025-01-20"), dt("2025-01-24"), highRate, hours96);
    assert.equal(result.discountType, "holiday");
    assert.equal(result.savingsCents, hSavings);
  });

  test("both apply, duration saves more → duration wins", () => {
    const rate = 2000;
    const baseCents = rate * hours96;
    const dSavings = Math.min(DURATION_DISCOUNT_CENTS_PER_HOUR * hours96, baseCents); // 96000
    const hSavings = Math.round(baseCents * HOLIDAY_DISCOUNT_RATE);                   // 32640
    assert.ok(dSavings > hSavings);
    const result = calculateDiscount(dt("2025-01-20"), dt("2025-01-24"), rate, hours96);
    assert.equal(result.discountType, "duration");
    assert.equal(result.savingsCents, dSavings);
  });

  // The >= tie-break favours holiday when savings are equal.
  // An exact integer tie requires rate * 0.17 = 1000 (rate = 5882.35… cents) —
  // not representable as integer cents; the branch is verified by source inspection.
  test("exactly 72h, no holiday → no discount (duration threshold is strict >)", () => {
    const noHolStart = dt("2025-01-22");
    const noHolEnd   = dt("2025-01-26");
    const result = calculateDiscount(noHolStart, noHolEnd, hourlyRate, 72.0);
    assert.equal(result.discountType, null);
    assert.equal(result.savingsCents, 0);
    assert.equal(result.effectiveTotalPriceCents, hourlyRate * 72);
  });

  test("neither discount applies → null", () => {
    const noHolStart = dt("2025-01-22");
    const noHolEnd   = dt("2025-01-23");
    const result = calculateDiscount(noHolStart, noHolEnd, hourlyRate, 24);
    assert.equal(result.discountType, null);
    assert.equal(result.savingsCents, 0);
    assert.equal(result.effectiveTotalPriceCents, hourlyRate * 24);
  });

  test("effectiveTotalPriceCents never goes negative — duration savings clamped to base", () => {
    const tinyRate = 1; // 1 cent/hr
    const base = tinyRate * hours96; // 96 cents total
    const result = calculateDiscount(dt("2025-01-22"), dt("2025-01-26"), tinyRate, hours96);
    assert.equal(result.effectiveTotalPriceCents, 0);   // fully consumed by discount
    assert.equal(result.savingsCents, base);             // clamped: not 1000*96=96000
  });
});
