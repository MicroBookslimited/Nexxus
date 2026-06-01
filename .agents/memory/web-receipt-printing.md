---
name: Web receipt printing
description: How the web POS (artifacts/nexus-pos) prints receipts and why the Looped Labs ESC/POS path was removed.
---

The web POS prints receipts via the browser's native print pipeline on **every** platform, including Android.

`src/lib/print-receipt.ts` is a thin wrapper: `printOrderReceipt(html, order, settings)` always calls `openReceiptWindow(html)` (hidden same-origin iframe + `window.print()`) in `src/lib/receipt.ts`. On Android Chrome this opens the system print dialog, where the user picks their default print service / connected printer / "Save as PDF".

**Why:** The previous Looped Labs ESC/POS Android intent path crashed ("ESC POS USB Print Service has stopped") and nothing printed. User confirmed removal in favor of standard browser print everywhere.

**How to apply:** Do NOT reintroduce UA-based Android branching or external print-app intents in the web POS. The `escpos_print_enabled` / `escpos_connection` settings and the Settings → POS Interface ESC/POS toggle were removed; stale DB values are ignored.

**Scope:** The mobile Expo app (`artifacts/nexus-mobile`) has its OWN direct ESC/POS thermal printing (Network/Bluetooth/USB transports) — that is a separate, unrelated feature and is unaffected.
