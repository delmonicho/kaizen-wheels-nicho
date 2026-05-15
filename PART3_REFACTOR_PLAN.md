# Implementation Plan: Test Refactor

## Context

Evaluation of the existing test suite found two gaps:

1. **Holiday coverage**: Only Jan 21 and Dec 18 are explicitly isolated-tested in `hasHolidayInRange`. The remaining 8 holidays have zero test coverage. All three boundary-condition tests also use only Jan 21.
2. **`effectiveTotalPriceCents` unasserted**: `calculateDiscount` tests 1 and 2 assert `discountType` and `savingsCents` but never `effectiveTotalPriceCents` — the field that drives the displayed price in both `VehicleListItem` and `ReviewPage`.

The original PART3 plan addressed these but had errors: wrong final test count (~38, actually 46), an internal contradiction (said "replace all 8" then "keep 2 of the 8"), lost two valuable existing tests, and proposed a redundant new describe block instead of augmenting existing tests. This plan supersedes it.

---

## Critical File

`app/lib/__tests__/discounts.test.ts`

---

## Final Test Structure (46 tests, up from 19)

| Block | Tests | Delta |
|---|---|---|
| `hasHolidayInRange` | 34 | +26 (remove 4 old, add 30 loop, retain 4) |
| `hasDurationDiscount` | 4 | 0 |
| `calculateDiscount` | 8 | +1 (augment 2, replace 1 weak, strengthen 1) |
| **Total** | **46** | **+27** |

---

## Change 1 — Rewrite `hasHolidayInRange` Block

**Remove** tests 1, 2, 3, 5 (Jan 21 boundary/positive and Dec 18 positive — subsumed by the loop).  
**Add** the 10-holiday data-driven loop (30 tests).  
**Retain** tests 4, 6, 7, 8 — these test logic the loop cannot cover.

```typescript
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

  // explicit negative: range clear of all holidays
  test("Jan 22–Jan 24 — no holiday in range", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-22"), dt("2025-01-24")), false);
  });

  // cross-year range: year-iteration logic
  test("cross-year Dec 31 → Jan 22 — Jan 21 inside", () => {
    assert.equal(hasHolidayInRange(dt("2025-12-31"), dt("2026-01-22")), true);
  });

  // multi-holiday range: early-return / multiple matches
  test("Jan 20–Mar 05 — multiple holidays inside", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-20"), dt("2025-03-05")), true);
  });

  // sub-day start time: 23:00 on holiday → startOf("day") normalisation
  test("start = Jan 21 23:00, end = Jan 22 01:00 — holiday is the start day → false", () => {
    assert.equal(hasHolidayInRange(dt("2025-01-21T23:00:00"), dt("2025-01-22T01:00:00")), false);
  });
});
```

### Why retain these four?

| Test | What the loop can't cover |
|---|---|
| Test 4 (no-holiday range) | Loop only tests ranges adjacent to holidays; never a range entirely clear of all 10 |
| Test 6 (cross-year) | Year-iteration logic (`for year = start.year to end.year`) |
| Test 7 (multi-holiday) | Early-return / multiple holidays matched in one range |
| Test 8 (23:00 start) | Sub-day `startOf("day")` normalization; loop uses midnight only |

---

## Change 2 — Leave `hasDurationDiscount` Block Unchanged

The four existing tests (72.0 → false, 72.001 → true, 48 → false, 96 → true) are complete. No edits.

---

## Change 3 — Modify `calculateDiscount` Block

### 3a — Augment test 1: add `effectiveTotalPriceCents`

```typescript
test("holiday inside, ≤ 72h → holiday discount", () => {
  const result = calculateDiscount(start, end, hourlyRate, hours24);
  const base = hourlyRate * hours24;
  assert.equal(result.discountType, "holiday");
  assert.equal(result.savingsCents, Math.round(base * 0.17));
  assert.equal(result.effectiveTotalPriceCents, base - Math.round(base * 0.17));
});
```

### 3b — Augment test 2: add `effectiveTotalPriceCents`

```typescript
test("no holiday, > 72h → duration discount", () => {
  const noHolStart = dt("2025-01-22");
  const noHolEnd   = dt("2025-01-26");
  const result = calculateDiscount(noHolStart, noHolEnd, hourlyRate, hours96);
  const base = hourlyRate * hours96;
  assert.equal(result.discountType, "duration");
  assert.equal(result.savingsCents, 1000 * hours96);
  assert.equal(result.effectiveTotalPriceCents, base - 1000 * hours96);
});
```

### 3c — Retain tests 3 and 4 unchanged (holiday-wins / duration-wins conflict)

No edits.

### 3d — Replace test 5 (fake tie-break) with 72h boundary test

The original test 5 was labeled "savings equal → holiday wins" but never activated the duration branch (24h < 72h threshold). An exact integer tie (`Math.round(rate * hours * 0.17) === 1000 * hours`) requires `rate = 5882.35…` cents — non-representable as integer cents, so the equality path of the `>=` tie-break is structurally unreachable under real inputs.

Replace with a test that has practical value — the exact 72h boundary:

```typescript
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
```

### 3e — Retain test 6 unchanged (neither applies — already asserts all 3 fields)

No edits.

### 3f — Strengthen test 7 (clamping guard)

Replace `assert.ok(result.effectiveTotalPriceCents >= 0)` with precise assertions. The current guard would pass even if `savingsCents` were incorrectly `96000` (1000 × 96) instead of the clamped value `96` (= base), as long as `Math.max(0, …)` still returned 0.

```typescript
test("effectiveTotalPriceCents never goes negative — duration savings clamped to base", () => {
  const tinyRate = 1; // 1 cent/hr
  const base = tinyRate * hours96; // 96 cents total
  const result = calculateDiscount(dt("2025-01-22"), dt("2025-01-26"), tinyRate, hours96);
  assert.equal(result.effectiveTotalPriceCents, 0);   // fully consumed by discount
  assert.equal(result.savingsCents, base);             // clamped: not 1000*96=96000
});
```

---

## Complete `calculateDiscount` Block After Changes

```typescript
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
    assert.equal(result.savingsCents, Math.round(base * 0.17));
    assert.equal(result.effectiveTotalPriceCents, base - Math.round(base * 0.17));
  });

  test("no holiday, > 72h → duration discount", () => {
    const noHolStart = dt("2025-01-22");
    const noHolEnd   = dt("2025-01-26");
    const result = calculateDiscount(noHolStart, noHolEnd, hourlyRate, hours96);
    const base = hourlyRate * hours96;
    assert.equal(result.discountType, "duration");
    assert.equal(result.savingsCents, 1000 * hours96);
    assert.equal(result.effectiveTotalPriceCents, base - 1000 * hours96);
  });

  test("both apply, holiday saves more → holiday wins", () => {
    const highRate = 10000;
    const hSavings = Math.round(highRate * hours96 * 0.17); // 163200
    const dSavings = 1000 * hours96;                        // 96000
    assert.ok(hSavings > dSavings);
    const result = calculateDiscount(dt("2025-01-20"), dt("2025-01-24"), highRate, hours96);
    assert.equal(result.discountType, "holiday");
    assert.equal(result.savingsCents, hSavings);
  });

  test("both apply, duration saves more → duration wins", () => {
    const rate = 2000;
    const baseCents = rate * hours96;
    const dSavings = Math.min(1000 * hours96, baseCents); // 96000
    const hSavings = Math.round(baseCents * 0.17);        // 32640
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
    const tinyRate = 1;
    const base = tinyRate * hours96;
    const result = calculateDiscount(dt("2025-01-22"), dt("2025-01-26"), tinyRate, hours96);
    assert.equal(result.effectiveTotalPriceCents, 0);
    assert.equal(result.savingsCents, base);
  });
});
```

---

## Known Untestable Gap

`VehicleListItem.tsx:31–33` re-derives `effectiveHourlyRate` client-side:

```typescript
const effectiveHourlyRate = discount.discountType === "duration"
  ? vehicle.hourly_rate_cents - 1000
  : vehicle.hourly_rate_cents;
```

The hardcoded `- 1000` is not a field returned by `calculateDiscount`. If the discount rate changes, this silently diverges. Fixing it properly requires either adding `effectiveHourlyRateCents` to `DiscountInfo` or a component test framework — both out of scope here.

---

## Verification

```
npm test    # expect 46 tests, all green (up from 19)
npm run ts  # zero TypeScript errors
```
