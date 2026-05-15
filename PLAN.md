# Plan: Make Price Filter Configurable (Data-Driven)

## Context

The price filter sentinel was hardcoded to `$100` (original bug) then patched to `$250`. The platform is intended to be deployed across multiple car rental agencies — economy to luxury — and potentially other industries with different inventory and pricing. Hardcoding a ceiling ties every deployment to a single magic number that must be manually updated when inventory changes.

The fix: derive the slider range from the vehicle data at the `getFilterOptions()` layer, where the inventory is already queried. This makes the filter self-calibrating — no code change is needed when a new agency's $500/hr fleet is added.

## Approach

`getFilterOptions()` already reads all vehicles to build make/classification/passenger lists. We extend it to also compute `priceRange: { min: number; max: number }` in dollars. That object flows through the existing prop chain (`filterOptions`) to `AdditionalFilters` and sets form defaults in `SearchPage`. The server-side sentinel in `searchVehicles` computes the same max from vehicles inline, eliminating the hardcoded number entirely.

**Slider max formula:**
```ts
const PRICE_STEP = 10  // matches slider step={10}
const maxCents = Math.max(...vehicles.map(v => v.hourly_rate_cents))
const max = Math.ceil(maxCents / 100 / PRICE_STEP) * PRICE_STEP + PRICE_STEP
// $220/hr → ceil(220/10)*10 + 10 = 230
// $350/hr → ceil(350/10)*10 + 10 = 360
```

Adding one step above the highest vehicle means the user can set exactly the most expensive vehicle's rate as their cap, while the max slider position (one step higher) cleanly means "no limit."

## Files Modified

| File | Change |
|---|---|
| `app/server/api.ts` | Added `PRICE_STEP` constant; extended `FilterOptions` with `priceRange`; `getFilterOptions()` computes range from inventory; `searchVehicles()` derives sentinel from data |
| `app/components/search/SearchPage.tsx` | Default form value uses `filterOptions.priceRange` |
| `app/components/search/AdditionalFilters.tsx` | Slider `max`, display label, and reset check all read from `filterOptions.priceRange.max` |

## Verification

1. Run the dev server.
2. With current data (max $220/hr Mercedes), slider max should be `$230` and label should read `$230+`.
3. Set slider to `$100` max — BMW X5 ($170/hr) and Mercedes ($220/hr) disappear.
4. Set slider to `$220` max — all vehicles show (sentinel fires at `sliderMax = 230`, not `220`).
5. Slide to `$230` — `$230+` label, all vehicles shown.
6. To test configurability: temporarily add a vehicle at `hourly_rate_cents: 35000` ($350/hr) to `data.ts`, reload — slider max should automatically become `$360` with no other code change.
