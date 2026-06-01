---
name: Web receipt printing
description: How the web POS prints receipts, and why Android gets a lean plain-text version.
---

The web (browser) POS prints **every** receipt through the browser's native print dialog — no device-specific transport.

**Why:** Deployments use many different printer models, so a per-device transport is the wrong fit. The browser dialog is the universal answer — it works on any installed printer (thermal/inkjet/laser), supports "Save as PDF", and lets the cashier pick the printer. The user explicitly chose this over device-specific printing.

**Android exception (important):** Android POS tablets typically route browser print through an **ESC/POS pass-through print service** (e.g. Looped Labs "ESC POS USB Print Service"). These services **crash** ("…keeps stopping") when the print job rasterizes to a large bitmap — i.e. when the page has a logo image, a giant order/pickup number, or rich CSS. So on Android we print a **stripped-down, image-free, compact monospace** receipt instead. Desktop/Windows is left on the full styled receipt — the user wanted desktop untouched.
**How to apply:** Keep the Android branch in the printing wrapper printing the lean builder; never add a logo or huge fonts to the Android print path. Do NOT reintroduce WebUSB or Looped-Labs-intent transports (both tried and removed).

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
