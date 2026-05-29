---
name: Looped Labs ESC/POS Android printing
description: Correct package ids + intent action for printing receipts to Looped Labs ESC/POS print-service apps on Android.
---

# Looped Labs ESC/POS Android printing

Looped Labs ships THREE separate Android apps, each a different `applicationId`:

- USB → `com.loopedlabs.usbprintservice`
- Bluetooth → `com.loopedlabs.escposprintservice`
- Network/WiFi → `com.loopedlabs.escposnetprintservice`

**Why this matters:** the package id without usb/net (`com.loopedlabs.escposprintservice`)
is the *Bluetooth* app, NOT a generic one. Pinning the wrong package in an
`intent:` URL makes Chrome redirect to the Play Store. A USB printer needs the
`usbprintservice` package.

**How to print (the reliable path):** use the BACKGROUND custom action
`org.escpos.intent.action.PRINT` with extras `S.DATA_TYPE=TEXT` +
`S.android.intent.extra.TEXT=<percent-encoded plain ESC/POS text>`. This prints
silently without leaving the host app.

**Why NOT HTML / the system print picker:** when Android Chrome hands Looped
Labs the rendered HTML page (the normal `window.print()` / print-picker flow),
the service crashes ("ESC POS USB Print Service has stopped"). It can only
reliably consume plain text (or PDF via DATA_TYPE=PDF/PDF_URL). Never route HTML
to it.

**Device-side requirement:** the user must enable "Auto Print Selected Text and
Images" in the Looped Labs app, or it shows a preview instead of printing.

Source: loopedlabs.com + github.com/looped-labs/ESCPOSPrintServiceDemo (confirmed
via web search, not derivable from code).
