# PART 1 — Price Filter Bug Fix

The slider's maximum was hardcoded to `$100`, which was also used as a sentinel meaning "no upper limit" — so users setting a `$100` budget were shown every vehicle including those at `$220/hr`. The fix raised the ceiling to cover the actual vehicle price range, ensuring the filter enforces the user's selected maximum.

# BONUS — Configurable Price Filter

Rather than hardcoding a price ceiling, the slider range is derived from the vehicle inventory at runtime so the filter self-calibrates to any dataset without code changes. This makes the component portable across agencies or industries with different pricing — from economy fleets to luxury rentals — without requiring manual tuning per deployment.
