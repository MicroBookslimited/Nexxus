/**
 * Direct ESC/POS printing — public API for the mobile app.
 *
 * Dispatches a built receipt to the configured transport (network / Bluetooth /
 * USB). All native modules are lazily required inside the transports, so this
 * module is safe to import anywhere (including in Expo Go); only an actual print
 * call will surface a "requires a development build" error there.
 */
import { buildReceiptBytes, buildReceiptText } from "./builder";
import { printBluetooth, scanBleDevices, type BleDevice } from "./transports/bluetooth";
import { printNetwork } from "./transports/network";
import { printUsb } from "./transports/usb";
import type { PrinterConfig, ReceiptOrder, ReceiptSettings } from "./types";

export { scanBleDevices };
export type { BleDevice };
export * from "./types";
export { buildReceiptText } from "./builder";

async function dispatch(config: PrinterConfig, text: string): Promise<void> {
  if (config.transport === "usb") {
    await printUsb(text);
    return;
  }
  const bytes = buildReceiptBytes(text);
  if (config.transport === "network") {
    await printNetwork(bytes, { host: config.host, port: config.port });
  } else {
    await printBluetooth(bytes, { deviceId: config.deviceId });
  }
}

export async function printReceipt(
  config: PrinterConfig,
  order: ReceiptOrder,
  settings: ReceiptSettings,
): Promise<void> {
  const text = buildReceiptText(order, settings, config.paperWidth);
  await dispatch(config, text);
}

export async function testPrint(config: PrinterConfig, settings: ReceiptSettings = {}): Promise<void> {
  const now = new Date();
  const order: ReceiptOrder = {
    orderNumber: "TEST-PRINT",
    createdAt: now,
    items: [
      { quantity: 1, productName: "Test item", lineTotal: 100, unitPrice: 100 },
      { quantity: 2, productName: "Another test item", lineTotal: 50, unitPrice: 25 },
    ],
    subtotal: 150,
    tax: 0,
    total: 150,
    paymentMethod: "Test",
  };
  await printReceipt(config, order, { business_name: "NEXXUS POS", ...settings });
}
