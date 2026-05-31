/**
 * Local ESC/POS receipt types for the mobile app.
 *
 * These mirror a subset of the desktop receipt types
 * (`artifacts/nexus-pos/src/lib/receipt.ts`). They are intentionally
 * duplicated rather than shared via the OpenAPI spec / a lib package so the
 * shared contract stays untouched (changing it would regenerate the web
 * client). Keep the field names aligned with the desktop builder.
 */

export interface ReceiptSettings {
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  receipt_footer?: string;
  tax_rate?: string;
  tax_name?: string;
  base_currency?: string;
}

export interface ReceiptItem {
  quantity: number;
  productName: string;
  lineTotal: number;
  unitPrice?: number;
  originalUnitPrice?: number | null;
  variantChoices?: Array<{ optionName: string }> | null;
  modifierChoices?: Array<{ optionName: string }> | null;
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: string | Date;
  staffName?: string;
  orderType?: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  discountValue?: number;
  paymentMethod?: string;
  cashTendered?: number;
  notes?: string;
}

export type PrinterTransport = "network" | "bluetooth" | "usb";

export interface PrinterConfig {
  /** Master switch — when false, no printing is attempted. */
  enabled: boolean;
  /** Print automatically when a sale completes. */
  autoPrint: boolean;
  transport: PrinterTransport;
  /** 32 cols = 58mm paper, 42 cols = 80mm paper. */
  paperWidth: 32 | 42;
  /** Network transport. */
  host?: string;
  port?: number;
  /** Bluetooth (BLE) transport. */
  deviceId?: string;
  deviceName?: string;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  enabled: false,
  autoPrint: true,
  transport: "network",
  paperWidth: 42,
  port: 9100,
};
