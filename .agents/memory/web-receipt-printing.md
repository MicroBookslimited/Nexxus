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

**CRITICAL ARCHITECTURAL GOTCHA — Android must call window.print() on the PARENT, never on the iframe:**
`openReceiptWindow` uses a hidden iframe. On desktop, `iframe.contentWindow.print()` works. On Android Chrome, the iframe's `cw.print()` can silently ignore `@page` rules (both the iframe's own and the parent's) and produce a full Letter/A4 PDF — which the ESC/POS raster service crashes on. The only guaranteed approach on Android is:
1. Inject `@page { size: ${receiptPageSize} auto; margin: 0; }` into the **parent document** (`<style id="nexus-print-page">`), cleaned up on `afterprint`.
2. Give the iframe a real off-screen width (`left: -9999px; width: 80mm`) so receipt content lays out at the correct column width (not 0-width collapse).
3. Call **`window.print()`** (the top-level parent window), NOT `cw.print()` (the iframe). This guarantees the parent @page governs the PDF dimensions.
4. Do NOT inject a self-print `<script>` into the Android iframe HTML — if the iframe calls its own print, it bypasses the parent @page.
`openReceiptWindow(html, opts?: { receiptPageSize? })` — Android passes `receiptPageSize`; desktop passes nothing and keeps the old path.

**Why:** User confirmed lean content was rendering (confirmed by print PREVIEW) yet crash persisted — meaning Chrome was generating a full Letter/A4 PDF regardless of CSS. Calling `window.print()` on the parent with parent-level `@page` is the only unambiguous way to control PDF dimensions on Android Chrome.
**How to apply:** Keep all four Android-specific behaviours above. Never drop any of them — they work together. Clean up `<style id="nexus-print-page">` on afterprint (already handled by `removePrintStyle`). If STILL crashing, check Looped Labs paper-width setting (should be 80mm) and print mode (text vs image).

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
