# PART 1 — Price Filter Bug Fix

The slider's maximum was hardcoded to `$100`, which was also used as a sentinel meaning "no upper limit" — so users setting a `$100` budget were shown every vehicle including those at `$220/hr`. The fix raised the ceiling to cover the actual vehicle price range, ensuring the filter enforces the user's selected maximum.

# BONUS — Configurable Price Filter

Rather than hardcoding a price ceiling, the slider range is derived from the vehicle inventory at runtime so the filter self-calibrates to any dataset without code changes. This makes the component portable across agencies or industries with different pricing — from economy fleets to luxury rentals — without requiring manual tuning per deployment.

# PART 3 — Test Suite Refactor

The existing test file (`app/lib/__tests__/discounts.test.ts`) had two gaps identified in review:

1. **Holiday coverage**: `hasHolidayInRange` only had explicit boundary tests for Jan 21 and Dec 18. The other 8 holidays in the system had zero coverage — a bug in any of those date comparisons would go undetected.

2. **`effectiveTotalPriceCents` unasserted**: The two core `calculateDiscount` scenarios (holiday discount, duration discount) never asserted the field that drives the displayed price in `VehicleListItem` and `ReviewPage`. A regression there would produce a silent wrong value in the UI.

The refactor addressed both without touching `hasDurationDiscount`, which was already complete.

For `hasHolidayInRange`, the four hand-written Jan 21 / Dec 18 tests were replaced with a data-driven loop covering all 10 holidays × 3 boundary positions (strictly inside, starts-on, ends-on) — 30 tests in total. Four existing tests that cover logic the loop cannot reach (clear range, cross-year wrap, multi-holiday range, sub-day start time) were retained unchanged.

For `calculateDiscount`, the holiday and duration discount tests gained `effectiveTotalPriceCents` assertions. The fake tie-break test — which never actually activated the duration branch and acknowledged it couldn't produce a true tie — was replaced with a 72h exact-boundary test that has genuine practical value. The clamping guard was tightened from `>= 0` to exact equality, so it would catch a misclamped `savingsCents` value that `Math.max(0, …)` would otherwise mask.

Final count: 45 tests (up from 19), all passing, zero TypeScript errors.

3. The discount module was also refactored to extract the three business-rule literals (`0.17`, `72`, `1000`) as named exported constants and add `effectiveHourlyRateCents` to `DiscountInfo` — eliminating a hardcoded `- 1000` in `VehicleListItem` that silently diverged from the library whenever the per-hour discount rate changed.
