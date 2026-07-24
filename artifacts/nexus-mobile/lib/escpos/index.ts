/**
 * Direct ESC/POS printing — public API for the mobile app.
 *
 * Dispatches a built receipt to the configured transport (network / Bluetooth /
 * USB). All native modules are lazily required inside the transports, so this
 * module is safe to import anywhere (including in Expo Go); only an actual print
 * call will surface a "requires a development build" error there.
 */
import { buildKitchenTicketText, buildReceiptBytes, buildReceiptText } from "./builder";
import { printBluetooth, scanBleDevices, type BleDevice } from "./transports/bluetooth";
import { printNetwork } from "./transports/network";
import { printUsb } from "./transports/usb";
import type { KitchenPrinterConfig, PrinterConfig, ReceiptOrder, ReceiptSettings } from "./types";

export { scanBleDevices };
export type { BleDevice };
export * from "./types";
export { buildKitchenTicketText, buildReceiptText } from "./builder";

async function dispatch(config: PrinterConfig, text: string): Promise<void> {
  // Default ON when unset (existing saved configs predate this field): kicking
  // the drawer on receipt print is the expected POS behavior.
  const openDrawer = config.openDrawer !== false;
  if (config.transport === "usb") {
    await printUsb(text, { openDrawer });
    return;
  }
  const bytes = buildReceiptBytes(text, { openDrawer });
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

/** Dispatch a kitchen ticket to the second (kitchen) printer. */
export async function printKitchenTicket(
  kitchen: KitchenPrinterConfig,
  order: ReceiptOrder,
): Promise<void> {
  if (kitchen.transport === "network" && !kitchen.host?.trim()) {
    throw new Error("Kitchen printer IP address is not set. Enter it in Printer Settings.");
  }
  if (kitchen.transport === "bluetooth" && !kitchen.deviceId) {
    throw new Error("No kitchen Bluetooth printer selected. Scan and pick one in Printer Settings.");
  }
  const text = buildKitchenTicketText(order, kitchen.paperWidth);
  const bytes = buildReceiptBytes(text);
  if (kitchen.transport === "network") {
    await printNetwork(bytes, { host: kitchen.host, port: kitchen.port });
  } else {
    await printBluetooth(bytes, { deviceId: kitchen.deviceId });
  }
}

export async function testKitchenPrint(kitchen: KitchenPrinterConfig): Promise<void> {
  const now = new Date();
  const order: ReceiptOrder = {
    orderNumber: "TEST-KITCHEN",
    createdAt: now,
    orderType: "Dine-in",
    items: [
      { quantity: 1, productName: "Test dish", lineTotal: 0, notes: "No onions" },
      { quantity: 2, productName: "Another test dish", lineTotal: 0 },
    ],
    subtotal: 0,
    tax: 0,
    total: 0,
  };
  await printKitchenTicket(kitchen, order);
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
