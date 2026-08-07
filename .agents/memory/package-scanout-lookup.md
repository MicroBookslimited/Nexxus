---
name: Package scan-out lookup
description: Courier/POS package pickup scanning — no-Enter scanners, tracking heuristics, duplicate shadowing
---

Parcel cash-out scanning has three recurring failure modes:

1. **Scanners that don't send Enter.** Auto-lookup effects must not depend on Enter; a debounce (~400ms) plus `looksLikeTrackingCode()` (≥10 unbroken alphanumerics, excluding 420+ZIP routing chunks and EAN-13 weight labels) catches all couriers, not just USPS/TBA formats (`extractTracking` only knows those two).
2. **Stale text in the scan box.** Any "not found" path must clear the box and refocus, or the next scan concatenates/mangles onto the leftover code. In courier layout, misses should toast loudly; in shared product-search boxes, stay silent.
3. **Long IMpb numbers truncated client-side.** USPS IMpb barcodes can encode 30+ digit numbers (eVS/full IMpb) even when the printed number is 22 digits. Any regex with an upper bound (e.g. `9\d{21,25}`) truncates the scan to a PREFIX of the stored value, which suffix-only server matching can never find — registration works, checkout 404s. Use `9\d{21,}` (no cap) and make server matching containment in BOTH directions (min 10 normalized chars each side).
4. **Duplicate rows shadowing the collectable one.** `/packages/lookup/:tracking` uses suffix-tolerant matching + `limit(1)`; it must ORDER BY status='received' first then newest receivedAt, or a collected/cancelled twin (shared AWB, re-received parcel) returns instead and POS says "unavailable".

**Why:** real tenant outage (NEXORA, courier mode) — packages received fine but "not found" at cash-out; all three modes observed in prod data/video.

**How to apply:** any new scan surface (mobile POS, new lanes) that resolves package pickups must dedupe Enter-vs-debounce lookups (in-flight ref), reuse the shared barcode helpers, and never assume a trailing Enter.
