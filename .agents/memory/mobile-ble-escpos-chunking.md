---
name: Mobile BLE ESC/POS chunk sizing
description: Why BLE receipt writes must be sized from the negotiated MTU (20-byte floor), and that the whole mobile BLE printing stack already exists.
---

The Expo app (`artifacts/nexus-mobile`) already has a COMPLETE native BLE ESC/POS
receipt-printing stack — do not rebuild it: `lib/escpos/` (custom `builder.ts`
ported to match the desktop/web 32-col 58mm / 42-col 80mm layout, plus
bluetooth/network/usb transports), `context/PrinterContext.tsx` (persists config
under AsyncStorage key `nexus_printer_config`), `app/printer-settings.tsx`
(scan/connect/test print), checkout Print Receipt in `app/(tabs)/index.tsx`,
`react-native-ble-plx` + its config plugin in `app.json`, Android BLE perms, the
Expo Go lazy-`require` guard, and an `eas.json` preview(apk/internal)+dev profile.
The app deliberately uses the custom builder, NOT `esc-pos-encoder` (user choice).

**Rule:** BLE write chunk size must be derived from the negotiated ATT MTU, not
hardcoded: `chunkSize = Math.max(20, (device.mtu ?? 23) - 3)`.

**Why:** generic 58mm BLE printers frequently ignore the `requestMTU` request and
stay at the 23-byte BLE default (≈20-byte usable payload). A fixed large chunk
(it was 180) silently drops bytes on those printers, producing truncated/garbled
receipts with no error. Floor at 20 so low-MTU hardware is reliable; capable
printers still get larger, faster writes from their real MTU.

**How to apply:** any new BLE transport / write path here must size chunks off the
negotiated MTU with a 20-byte floor. If a high-MTU device misbehaves in the field,
add a conservative upper cap `Math.min(mtu-3, 180)` rather than reverting to fixed.
