/**
 * Receipt printing.
 *
 * Receipts always print through the browser's standard print pipeline
 * (`openReceiptWindow` — a hidden same-origin iframe + `window.print()`). This
 * is the universal path: it works on any printer the device has installed
 * (thermal, inkjet, laser), supports "Save as PDF", and lets the cashier pick
 * the printer from the system dialog. It handles pop-up blockers, KioskLock
 * coordination, and `@media print` styling.
 *
 * Public API: `printOrderReceipt(html, order, settings)`.
 */
import { openReceiptWindow, type ReceiptOrder, type ReceiptSettings } from "./receipt";

/**
 * Print an order receipt via the browser's standard print dialog.
 *
 * `order` / `settings` are accepted for API stability with callers (the HTML is
 * already built from them) but are not separately needed here.
 */
export function printOrderReceipt(
  html: string,
  _order: ReceiptOrder,
  _settings: ReceiptSettings = {},
): void {
  openReceiptWindow(html);
}
