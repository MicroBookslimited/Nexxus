---
name: Web receipt printing
description: How the web POS prints receipts, and why Android gets a lean plain-text version.
---

The web (browser) POS prints **every** receipt through the browser's native print dialog — no device-specific transport.

**Why:** Deployments use many different printer models, so a per-device transport is the wrong fit. The browser dialog is the universal answer — it works on any installed printer (thermal/inkjet/laser), supports "Save as PDF", and lets the cashier pick the printer. The user explicitly chose this over device-specific printing.

**Android exception (important):** Android POS tablets typically route browser print through an **ESC/POS pass-through print service** (e.g. Looped Labs "ESC POS USB Print Service"). These services **crash** ("…keeps stopping" / "has stopped") when the print job rasterizes to a large bitmap. So on Android we print a **stripped-down, image-free, compact monospace** receipt instead. Desktop/Windows is left on the full styled receipt — the user wanted desktop untouched.

**Two separate levers — both matter:**
1. **Content weight** — no logo image, no giant pickup number, no colors.
2. **Page format** — this turned out to be the *bigger* lever. Stripping content alone did NOT stop the crash; the printed page must be pinned to the exact thermal width with **`@page { margin: 0 }`** and an **explicit `html,body { width: 80mm/58mm }`**. Without that, the browser hands the service a Letter/A4-sized canvas (mostly blank) that rasterizes huge and crashes it, even with lean text.
**Why:** A user confirmed via the Android print PREVIEW that the lean text receipt was already rendering (no logo/number) yet still crashed — proving the crash is canvas dimensions, not content. Their other POS prints fine through the same Android print dialog, so a correctly-sized strip is the goal.
**How to apply:** Keep the Android branch printing the lean builder AND keep the page pinned to paper width with zero page margin. Never add a logo/huge fonts to the Android print path. Do NOT reintroduce WebUSB or Looped-Labs-intent transports (both tried and removed). If a correctly-sized lean strip *still* crashes a given service, the only remaining option is sending raw text to the service (share-sheet/intent), bypassing the print framework entirely.

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
