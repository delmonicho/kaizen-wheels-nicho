# Holiday & Duration Discount Feature Plan

## Context
Kaizen Wheels needs two discounts with a "best price wins" conflict rule. No discount system exists today. No testing infrastructure exists — we use Node.js built-in `node:test` + `node:assert` with the already-installed `tsx` devDependency. Zero new installs needed.

## Discount Rules

| Discount | Condition | Amount |
|---|---|---|
| Holiday | Any holiday falls **strictly between** start day and end day (exclusive both ends) | 17% off total |
| Duration | Duration **> 72 hours** (strictly more than 3 days) | $10/hr off hourly rate |
| Conflict | Both apply | Apply whichever **saves more**; holiday wins on tie |

**Holiday dates** (month/day, repeats every year):
Jan 21, Feb 12, Mar 04, May 02, Jun 16, Jul 26, Aug 03, Sep 01, Nov 05, Dec 18.

**"Strictly between"** means: `holiday.startOf('day') > start.startOf('day')` AND `holiday.startOf('day') < end.startOf('day')`. Starting or ending on the holiday day does NOT qualify.

**Price filter in search** continues to filter by base `hourly_rate_cents` — discounts are a dynamic benefit layered on top, not a change to a vehicle's pricing tier.

---

## Parallelization Architecture

Two workstreams can run simultaneously once the `DiscountInfo` interface (types-only) is committed:

| Stream | Files | Dependency |
|---|---|---|
| **A — Logic** | `app/lib/discounts.ts` (impl), `app/lib/__tests__/discounts.test.ts`, `app/server/api.ts` | None beyond types |
| **B — UI** | `app/components/search/VehicleListItem.tsx`, `app/components/review/ReviewPage.tsx` | `DiscountInfo` type shape only |

**Unlock step**: create skeleton `discounts.ts` with types exported (no function bodies) → commit or write to disk → launch Stream A and Stream B in separate worktrees or Claude sessions simultaneously.

Stream B can write against the interface contract (`DiscountInfo`) without Stream A's implementation existing.

---

## Step-by-Step Implementation

### Step 1 — Test script (no installs)

Add to `package.json` `scripts`:
```json
"test": "node --import tsx/esm --test app/lib/__tests__/discounts.test.ts"
```

Test files import:
```typescript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
```

> `--import tsx/esm` works on Node ≥ 18.19 (required by Next.js 16 anyway). Explicit file path, not a glob, for Node 18/20 compatibility.

---

### Step 2 — Skeleton `app/lib/discounts.ts` (unlock parallel streams)

Commit types-only. This is the shared contract for both streams.

```typescript
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
  effectiveTotalPriceCents: number; // post-discount total (clamped ≥ 0)
  savingsCents: number;             // 0 when no discount
}
```

---

### Step 3 — Tests (`app/lib/__tests__/discounts.test.ts`) — Stream A

**`hasHolidayInRange(start, end)` — true if any holiday is strictly inside the range:**

| Scenario | Expected |
|---|---|
| Jan 20 → Jan 22 (Jan 21 is inside) | `true` |
| Jan 21 00:00 → Jan 22 (starts on holiday) | `false` |
| Jan 20 → Jan 21 23:59 (ends on holiday day) | `false` |
| Jan 22 → Jan 24 (no holiday) | `false` |
| Dec 15 → Dec 20 (Dec 18 inside) | `true` |
| Dec 31 year N → Jan 22 year N+1 (Jan 21 inside, cross-year) | `true` |
| Jan 20 → Mar 05 (two holidays inside: Jan 21, Feb 12, Mar 04) | `true` (any is enough) |
| Start = Jan 21 23:00, End = Jan 22 01:00 (holiday day = start day) | `false` |

**`hasDurationDiscount(durationInHours)` — true if strictly > 72:**

| Hours | Expected |
|---|---|
| 72.0 | `false` |
| 72.001 | `true` |
| 48 | `false` |
| 96 | `true` |

**`calculateDiscount(start, end, hourlyRateCents, durationInHours)` — best discount:**

| Scenario | Expected `discountType` | `savingsCents` |
|---|---|---|
| Holiday inside, ≤ 72h duration | `"holiday"` | `round(base * 0.17)` |
| No holiday, > 72h duration | `"duration"` | `1000 * hours` |
| Both apply, holiday saves more | `"holiday"` | holiday amount |
| Both apply, duration saves more | `"duration"` | duration amount |
| Both apply, savings equal | `"holiday"` (tie → holiday wins) | either amount |
| Neither | `null` | `0` |
| `effectiveTotalPriceCents` never goes negative | clamped `≥ 0` | guard holds |

---

### Step 4 — Implement `discounts.ts` — Stream A

```typescript
export function hasHolidayInRange(start: DateTime, end: DateTime): boolean {
  const startDay = start.startOf("day");
  const endDay = end.startOf("day");
  // Iterate every calendar year spanned — handles multi-year reservations correctly
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
  // Clamp: discount can't exceed base total (defensive guard)
  const durationSavings = hasDurationDiscount(durationInHours)
    ? Math.min(1000 * durationInHours, baseTotalCents)
    : null;

  // Holiday wins on tie (savings equal)
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
```

---

### Step 5 — Update `app/server/api.ts` — Stream A

```typescript
import { calculateDiscount, type DiscountInfo } from "@/lib/discounts";

// Extend return type — getQuote consumers get discount info automatically
interface PriceQuote {
  totalPriceCents: number;    // pre-discount subtotal
  hourlyRateCents: number;
  durationInHours: number;
  discount: DiscountInfo;
}

const calculateTotalPrice = (
  start: DateTime,
  end: DateTime,
  hourlyRateCents: number,
): PriceQuote => {
  const durationInHours = end.diff(start, "hours").hours || 0;
  const discount = calculateDiscount(start, end, hourlyRateCents, durationInHours);
  return {
    totalPriceCents: hourlyRateCents * durationInHours,
    hourlyRateCents,
    durationInHours,
    discount,
  };
};
// getQuote() is unchanged — it calls calculateTotalPrice and now inherits the extended return.
```

---

### Step 6 — Update `app/components/search/VehicleListItem.tsx` — Stream B

**Display treatment differs by discount type** (these cannot be conflated):
- **Duration discount**: changes the effective `/hr` rate → show strikethrough original + new rate
- **Holiday discount**: is 17% off total, NOT off hourly rate → show badge + estimated discounted total for the selected period

Add estimated total line for any discounted case. Compute via `calculateDiscount` imported directly (pure function, no server boundary concern):

```tsx
import { DateTime } from "luxon";
import { calculateDiscount } from "@/lib/discounts";
import { formatCents } from "@/lib/formatters";

// Inside component — durationInHours from Luxon for consistency with api.ts
const luxonStart = DateTime.fromJSDate(startDateTime);
const luxonEnd = DateTime.fromJSDate(endDateTime);
const durationInHours = luxonEnd.diff(luxonStart, "hours").hours;
const discount = calculateDiscount(luxonStart, luxonEnd, vehicle.hourly_rate_cents, durationInHours);
const effectiveHourlyRate = discount.discountType === "duration"
  ? vehicle.hourly_rate_cents - 1000   // $10/hr off → show reduced rate
  : vehicle.hourly_rate_cents;          // holiday discount: rate unchanged, total changes
```

**Price display:**
```tsx
{/* Always show hourly rate — strikethrough if duration discount */}
<p className="text-xl font-bold">
  {discount.discountType === "duration" && (
    <span className="line-through text-gray-400 text-sm mr-1">
      {formatCents(vehicle.hourly_rate_cents)}
    </span>
  )}
  {formatCents(effectiveHourlyRate)}
  <span className="text-sm text-gray-700 font-normal ml-0.5">/hr</span>
</p>

{/* Discount badge + estimated total (only when discount applies) */}
{discount.discountType !== null && (
  <div className="mt-1">
    <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
      {discount.discountType === "holiday" ? "17% Holiday Deal" : "Multi-Day Discount"}
    </span>
    <p className="text-sm text-gray-600 mt-1">
      Est. <span className="font-medium">{formatCents(discount.effectiveTotalPriceCents)}</span> total
      <span className="text-green-600 ml-1">
        (save {formatCents(discount.savingsCents)})
      </span>
    </p>
  </div>
)}
```

---

### Step 7 — Update `app/components/review/ReviewPage.tsx` — Stream B

Replace the "Total Cost" `<div>` block with:

```tsx
{/* Subtotal — only shown when a discount applies */}
{quote.discount.discountType !== null && (
  <div>
    <dt className="text-sm text-gray-600">Subtotal</dt>
    <dd>{formatCents(quote.totalPriceCents)}</dd>
  </div>
)}

{/* Discount line */}
{quote.discount.discountType !== null && (
  <div>
    <dt className="text-sm text-green-700">
      {quote.discount.discountType === "holiday"
        ? "Holiday Discount (17% off)"
        : "Multi-Day Discount ($10/hr off)"}
    </dt>
    <dd className="text-green-700">
      −{formatCents(quote.discount.savingsCents)}
    </dd>
  </div>
)}

{/* Total — always shown, uses effective price */}
<div>
  <dt className="text-sm text-gray-600">Total Cost</dt>
  <dd className="text-2xl font-medium tracking-tight">
    {formatCents(quote.discount.effectiveTotalPriceCents)}
  </dd>
</div>
```

---

## Critical Files

| File | Action | Stream |
|---|---|---|
| `package.json` | Add `test` script | prerequisite |
| `app/lib/discounts.ts` | New — types skeleton → full impl | A |
| `app/lib/__tests__/discounts.test.ts` | New — unit tests | A |
| `app/server/api.ts` | Extend `calculateTotalPrice` return type | A |
| `app/components/search/VehicleListItem.tsx` | Discount badge + effective pricing | B |
| `app/components/review/ReviewPage.tsx` | Subtotal + discount line + effective total | B |

---

## Verification

1. `npm test` — all discount unit tests pass
2. `npm run ts` — zero TypeScript errors
3. Manual browser testing:
   - **Holiday discount**: pick Jan 20 → Jan 22; green badge + "Est. $X total" on search card; review page shows subtotal, discount line, reduced total
   - **No holiday if on boundary**: pick Jan 21 → Jan 23; no discount shown
   - **Duration discount**: pick any 4-day range without holiday; strikethrough original `/hr`, new rate shown; review shows $10/hr savings
   - **Better discount wins**: pick a 4-day range crossing a holiday; only the winning discount shown on both pages
   - **No discount**: pick a short range with no holiday; plain price display, no badge
