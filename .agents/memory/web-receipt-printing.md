---
name: Web receipt printing
description: Why the web POS prints receipts via the browser dialog (not device-specific transports).
---

The web (browser) POS prints **every** receipt through the browser's native print dialog — no device-specific transport.

**Why:** Deployments use many different printer models, so a per-device transport is the wrong fit. The browser dialog is the universal answer — it works on any installed printer (thermal, inkjet, laser), supports "Save as PDF", and lets the cashier pick the printer. The user explicitly chose this over device-specific printing.

**How to apply:** Keep `printOrderReceipt` a thin wrapper over `openReceiptWindow` (iframe + `window.print()`). Do NOT reintroduce a WebUSB raw-ESC/POS path or the Looped Labs Android-intent path — both were tried and removed.

**Looped Labs note:** The Looped Labs ESC/POS USB print *service* (a separate Android app a customer may install) crashes ("ESC POS USB Print Service has stopped") only when fed a heavy/complex print job; simple jobs print fine via the same browser dialog. If a customer relies on such a pass-through service, keep the receipt HTML lean.

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
