/**
 * Direct ESC/POS printing for the technician app — Bluetooth only.
 *
 * Technicians carry a pocket 58mm/80mm BLE printer, so unlike the counter POS
 * there is no network or USB transport here. The native module is lazily
 * required inside the transport, so this file is safe to import in Expo Go;
 * only an actual print call surfaces the "needs a development build" error.
 */
import { buildReceiptBytes } from "./builder";
import { printBluetooth, scanBleDevices, type BleDevice } from "./transports/bluetooth";
import type { PrinterConfig } from "./types";

export { scanBleDevices };
export type { BleDevice };
export * from "./types";

/** Print a pre-formatted plain-text document (the end-of-day report). */
export async function printRawText(config: PrinterConfig, text: string): Promise<void> {
  if (!config.deviceId) {
    throw new Error("No Bluetooth printer selected. Scan and pick one in Printer Settings.");
  }
  const bytes = buildReceiptBytes(text, { openDrawer: false });
  await printBluetooth(bytes, { deviceId: config.deviceId });
}

/** Small self-test so a technician can confirm the printer pairs and feeds. */
export async function testPrint(config: PrinterConfig): Promise<void> {
  const w = config.paperWidth;
  const line = "-".repeat(w);
  const text = [
    "NEXXUS FSM".padStart(Math.floor((w + 10) / 2)),
    line,
    "Printer test",
    `Paper width: ${w === 32 ? "58mm" : "80mm"} (${w} cols)`,
    new Date().toLocaleString(),
    line,
    "",
  ].join("\n");
  await printRawText(config, text);
}
