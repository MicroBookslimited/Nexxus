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
 * **Android exception**: On Android, receipts commonly route through an ESC/POS
 * pass-through print service (e.g. Looped Labs "ESC POS USB Print Service")
 * which crashes when handed a heavy styled page (logo, giant order number, rich
 * CSS) because the rendered bitmap is too large. So on Android we print a
 * stripped-down, image-free, plain-text receipt (`buildPlainReceiptHtml`) that
 * renders to a small bitmap the service can reliably handle. Desktop/Windows is
 * left completely unchanged — it prints the full styled receipt.
 *
 * Public API: `printOrderReceipt(html, order, settings)`.
 */
import {
  openReceiptWindow,
  buildPlainReceiptHtml,
  type ReceiptOrder,
  type ReceiptSettings,
} from "./receipt";

/** True when running on an Android device. */
function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/**
 * Print an order receipt via the browser's standard print dialog.
 *
 * On Android we substitute a lightweight plain-text receipt so ESC/POS
 * pass-through print services don't crash; on every other platform we print the
 * already-built styled `html` unchanged.
 */
export function printOrderReceipt(
  html: string,
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
): void {
  if (!isAndroid()) {
    openReceiptWindow(html);
    return;
  }
  const receiptSize = settings.receipt_size === "58mm" ? "58mm" : "80mm";
  openReceiptWindow(buildPlainReceiptHtml(order, settings), { receiptPageSize: receiptSize });
}
