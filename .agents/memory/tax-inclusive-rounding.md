---
name: Tax-inclusive line rounding
description: How to split a tax-inclusive entered price into net + tax without ±0.01 drift, and keep client/server identical.
---

# Tax-inclusive (gross-entered) line rounding

When a unit/line price is entered **tax-inclusive** (the entered amount already
includes tax), the entered GROSS is authoritative. Compute the split as:

1. `lineTotal = cents(qty * enteredUnitCost)`  ← round the gross first
2. `lineSubtotal = rate > 0 ? cents(lineTotal / (1 + rate/100)) : lineTotal`
3. `lineTax = cents(lineTotal - lineSubtotal)`  ← derive tax by subtraction
4. store net unit cost as `lineSubtotal / qty` (so `qty * unitCost` reproduces the net subtotal)

**Why:** the intuitive approach (round net subtotal first, then `tax = subtotal * rate`)
drifts the line total off the entered gross by ±0.01 for many cent values
(e.g. 0.10 @ 5% inclusive → net 0.095238, naive gives total 0.11 instead of 0.10).
Deriving `tax = gross - net` guarantees the persisted split sums back to exactly
what the user typed.

**How to apply:** any feature that accepts a tax-inclusive amount and must persist a
net/tax split (purchase bills inclusive mode, inclusive quotes/orders). The
**client preview and the server must use byte-identical rounding** or the preview
won't match what gets stored. Exclusive mode is the reverse: entered cost is net,
`tax = cents(subtotal * rate)`, total = subtotal + tax.

For purchase bills specifically, `unitCost` is ALWAYS stored net in both modes, so
the confirm flow (weighted average cost + journal entries) is mode-agnostic; only
the create-time line split differs. `taxMode` column is audit/display only.
