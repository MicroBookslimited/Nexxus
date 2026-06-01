---
name: Web receipt printing
description: Why thermal printers need raw WebUSB ESC/POS in the web POS, not browser print.
---

Thermal receipt printers (e.g. 3nStar RPT004) **cannot** be driven by the browser's standard print dialog or by ESC/POS pass-through print services.

**Why:** Android's print framework rasterizes the receipt into an image; thermal heads can't reproduce it, so standard browser print comes out **blank**. The ESC/POS pass-through services (raw BT, Looped Labs) want raw command bytes but receive a rendered job, so they blank out or crash. Only sending the raw ESC/POS byte stream straight to the printer prints reliably.

**How to apply:** For web (browser) POS, the reliable transport is **WebUSB** (`navigator.usb`) over a USB cable — needs HTTPS + a user gesture for `requestDevice()`; permission persists per-origin. WebUSB is per-device, so store the enable flag + chosen vid/pid in localStorage, never as a tenant-wide setting. Do NOT reintroduce the Looped Labs Android-intent path. (Implementation specifics live in the `replit.md` "Web receipt printing" gotcha.)

**Scope:** The mobile Expo app has its own native ESC/POS thermal printing (Network/Bluetooth/USB) — separate and unaffected.
