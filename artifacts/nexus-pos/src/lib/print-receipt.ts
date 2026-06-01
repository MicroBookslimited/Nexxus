/**
 * Receipt printing — standard browser print on every platform.
 *
 * Receipts are printed through the browser's native print pipeline
 * (`openReceiptWindow`), which on Android Chrome routes to the system's
 * default print service (any installed print plugin, a USB/Wi-Fi printer, or
 * "Save as PDF") and on desktop uses the OS print dialog. This is the same
 * battle-tested iframe pipeline used everywhere — it handles pop-up blockers,
 * KioskLock coordination, and `@media print` isolation.
 *
 * Public API: `printOrderReceipt(html, order, settings)`.
 */
import {
  openReceiptWindow,
  type ReceiptOrder,
  type ReceiptSettings,
} from "./receipt";

/**
 * Print an order receipt using the browser's standard print pipeline.
 *
 * Callers build the styled receipt HTML via `buildReceiptHtml(order)`; we hand
 * it straight to `openReceiptWindow`, which triggers `window.print()` from a
 * same-origin iframe so the device's default printer service handles it.
 *
 * `order` and `settings` are accepted for API stability (and potential future
 * use) but the rendered `html` is what gets printed.
 */
export function printOrderReceipt(
  html: string,
  _order: ReceiptOrder,
  _settings: ReceiptSettings = {},
): void {
  openReceiptWindow(html);
}
