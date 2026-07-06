---
name: Multi-line business name on receipts
description: business_name setting may contain newlines; every receipt render site must handle them
---

The `business_name` tenant setting may contain newlines (Settings uses a textarea) so the name prints stacked on receipts, e.g. "Lotus" / "Indian Cuisine".

**Rule:** any new receipt/bill template or text output that renders the business name must either render it multi-line with the shared `escHtmlMultiline()` helper in the receipts lib, or flatten newlines to spaces for single-line contexts (WhatsApp text, inline "with X" phrases, alt text).

**Why:** a plain `escHtml(businessName)` render site silently collapses the intended two-line branding into one line (HTML ignores raw newlines), and unflattened newlines break plain-text outputs.

**How to apply:** when adding a receipt template or any string that embeds the business name, grep for `escHtmlMultiline` and follow the existing pattern; never use bare `escHtml(businessName)`.

Related: a zero `unitPrice` on stored order items is treated as missing across all templates — unit price is derived from `lineTotal / quantity` so receipts never print "1 x $0.00" beside a real line amount. Preserve that truthy-check fallback in new item-row renderers.
