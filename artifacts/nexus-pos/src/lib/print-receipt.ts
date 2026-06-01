/**
 * Receipt printing.
 *
 * Two paths:
 *  1. **USB thermal printer (ESC/POS)** — when the cashier has enabled and
 *     connected a USB printer on this device (Settings → POS Interface), we
 *     send raw ESC/POS bytes straight to the printer over WebUSB. This is the
 *     only reliable path for thermal printers (e.g. 3nStar RPT004), which can't
 *     reproduce Android's rasterized print job and print blank otherwise.
 *  2. **Standard browser print** — the default everywhere else: the
 *     battle-tested `openReceiptWindow` iframe pipeline (`window.print()`),
 *     which handles pop-up blockers, KioskLock coordination, and `@media print`.
 *
 * If USB printing is enabled but fails, we surface the error and fall back to
 * the browser print window so the cashier is never left without a receipt.
 *
 * Public API: `printOrderReceipt(html, order, settings)`.
 */
import { toast } from "@/hooks/use-toast";
import {
  openReceiptWindow,
  type ReceiptOrder,
  type ReceiptSettings,
} from "./receipt";
import { isUsbPrintActive, printReceiptViaUsb } from "./escpos-usb";

/**
 * Print an order receipt. Uses the USB thermal printer when configured on this
 * device, otherwise the browser's standard print pipeline.
 *
 * Fire-and-forget: callers don't need to await — errors are surfaced via toast
 * and a browser-print fallback.
 */
export async function printOrderReceipt(
  html: string,
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
): Promise<void> {
  if (isUsbPrintActive()) {
    try {
      await printReceiptViaUsb(order, settings);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "USB print failed",
        description: `${message} — opening the standard print dialog instead.`,
        variant: "destructive",
      });
      // fall through to browser print so the cashier still gets a receipt
    }
  }

  openReceiptWindow(html);
}
