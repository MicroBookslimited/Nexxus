---
name: Web receipt printing
description: How the web POS prints receipts, and why Android gets a lean plain-text version.
---

The web (browser) POS prints **every** receipt through the browser's native print dialog — no device-specific transport.

**Why:** Deployments use many different printer models, so a per-device transport is the wrong fit. The browser dialog is the universal answer — it works on any installed printer (thermal/inkjet/laser), supports "Save as PDF", and lets the cashier pick the printer. The user explicitly chose this over device-specific printing.

**Android exception (important):** Android POS tablets typically route browser print through an **ESC/POS pass-through print service** (e.g. Looped Labs "ESC POS USB Print Service"). These services **crash** ("…keeps stopping" / "has stopped") when the print job rasterizes to a large bitmap. So on Android we print a **stripped-down, image-free, compact monospace** receipt instead. Desktop/Windows is left on the full styled receipt — the user wanted desktop untouched.

**Three separate levers — all matter:**
1. **Content weight** — no logo image, no giant pickup number, no colors.
2. **Page format** — the printed page must be pinned to the exact thermal width: `@page { size: <w> auto; margin: 0 }` and explicit `html,body { width: <w> }`.
3. **Where @page lives** — this is the critical architectural gotcha (see below).

**CRITICAL ARCHITECTURAL GOTCHA — @page must be in the PARENT document, not the iframe:**
`openReceiptWindow` uses a hidden 0×0 iframe and calls `iframe.contentWindow.print()`. On Android Chrome, this triggers printing of the **top-level parent document** (not just the iframe). The parent's `@page` rule controls the PDF page dimensions — the iframe's own `@page` is completely ignored. So you MUST inject `@page { size: ${receiptPageSize} auto; margin: 0; }` into the **parent document** (via a dynamically-injected `<style id="nexus-print-page">` element) and remove it on `afterprint`. `openReceiptWindow` now accepts `opts.receiptPageSize`; `printOrderReceipt` passes the paper size (80mm/58mm) from settings on Android. Also: pin `#nexus-print-frame { width: <paperWidth> }` in the parent's `@media print` stylesheet so the iframe layout element is correctly sized.

**Why:** User confirmed via Android print PREVIEW that the lean text receipt was rendering correctly yet the service still crashed — proving the crash was page DIMENSIONS, not content. The iframe's `@page` was being silently ignored; Chrome was generating a full Letter/A4-sized PDF which rasterized to a huge bitmap → OOM crash.
**How to apply:** Always call `openReceiptWindow(html, { receiptPageSize })` on Android. Never embed the @page fix only in the iframe HTML. Clean up the injected `<style>` on afterprint (already handled). If a correctly-sized lean strip *still* crashes, the only remaining option is bypassing the print framework entirely (raw text transport).

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
