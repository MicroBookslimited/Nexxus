/**
 * Direct USB thermal-receipt printing for the web POS (WebUSB + ESC/POS).
 *
 * Thermal printers (e.g. 3nStar RPT004) expect RAW ESC/POS command bytes, not
 * a rendered page. Android's print framework rasterizes the receipt into an
 * image, which this class of printer can't reproduce (prints blank), and the
 * ESC/POS pass-through print services (raw BT, Looped Labs) want bytes but get
 * a rendered job (blank / crash). The reliable path is to send the ESC/POS
 * byte stream straight to the printer over WebUSB — no third-party app, no
 * rasterization.
 *
 * Requirements:
 *  - Secure context (HTTPS). The deployed app and the Replit dev domain are
 *    HTTPS; `navigator.usb` is undefined otherwise.
 *  - A user gesture to call `requestDevice()` (we only call it from a button).
 *  - The printer connected by USB cable to the Android tablet / desktop.
 *
 * Device permission persists per-origin once granted, so `getDevices()` can
 * re-acquire the handle on later sessions. We persist the chosen vendor/product
 * id in localStorage (device-local — different terminals may have different
 * printers, so this is intentionally NOT a tenant-wide setting).
 */
import {
  totalTierSavings,
  type ReceiptOrder,
  type ReceiptSettings,
} from "./receipt";

const LS_KEY = "nexxus_usb_print";

interface UsbPrintConfig {
  enabled: boolean;
  vendorId?: number;
  productId?: number;
}

/* ────────────────────────────── config (localStorage) ───────────────────── */

export function getUsbPrintConfig(): UsbPrintConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { enabled: false };
    const parsed = JSON.parse(raw) as UsbPrintConfig;
    return { enabled: !!parsed.enabled, vendorId: parsed.vendorId, productId: parsed.productId };
  } catch {
    return { enabled: false };
  }
}

function saveUsbPrintConfig(cfg: UsbPrintConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function setUsbPrintEnabled(enabled: boolean): void {
  saveUsbPrintConfig({ ...getUsbPrintConfig(), enabled });
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export function isUsbPrintActive(): boolean {
  return isWebUsbSupported() && getUsbPrintConfig().enabled;
}

/* ────────────────────────────── device acquisition ──────────────────────── */

/** Prompt the user to pick a USB printer. MUST be called from a user gesture. */
export async function requestUsbPrinter(): Promise<USBDevice> {
  if (!isWebUsbSupported()) {
    throw new Error("WebUSB is not available in this browser/view.");
  }
  // Empty filter = show every USB device so the user can pick the printer.
  const device = await navigator.usb.requestDevice({ filters: [] });
  saveUsbPrintConfig({
    enabled: true,
    vendorId: device.vendorId,
    productId: device.productId,
  });
  return device;
}

/** Re-acquire the previously granted printer (no prompt). */
export async function getSavedUsbPrinter(): Promise<USBDevice | null> {
  if (!isWebUsbSupported()) return null;
  const cfg = getUsbPrintConfig();
  const devices = await navigator.usb.getDevices();
  if (devices.length === 0) return null;
  if (cfg.vendorId != null && cfg.productId != null) {
    const match = devices.find(
      (d) => d.vendorId === cfg.vendorId && d.productId === cfg.productId,
    );
    if (match) return match;
  }
  // Fall back to the first granted device.
  return devices[0] ?? null;
}

export function describeUsbDevice(device: USBDevice): string {
  const name = device.productName?.trim();
  const vidPid = `${hex4(device.vendorId)}:${hex4(device.productId)}`;
  return name ? `${name} (${vidPid})` : vidPid;
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, "0");
}

/* ────────────────────────────── raw byte transport ──────────────────────── */

/** Send a raw ESC/POS byte stream to the printer over the first bulk-OUT endpoint. */
async function sendBytes(device: USBDevice, bytes: Uint8Array): Promise<void> {
  await device.open();
  try {
    // Select a valid configuration. configurationValue is not guaranteed to be
    // 1 — use the device's first available configuration when none is active.
    if (device.configuration === null) {
      const first = device.configurations[0];
      if (!first) throw new Error("USB printer exposes no configuration.");
      await device.selectConfiguration(first.configurationValue);
    }

    const { interfaceNumber, alternateSetting, endpointNumber } = findBulkOut(device);
    await device.claimInterface(interfaceNumber);
    try {
      // Activate the alternate setting the endpoint belongs to. Selecting
      // alternate 0 is usually a no-op but can throw on some platforms, so we
      // only treat a failure as fatal for non-default alternates.
      try {
        await device.selectAlternateInterface(interfaceNumber, alternateSetting);
      } catch (err) {
        if (alternateSetting !== 0) throw err;
      }

      // Chunk large payloads — some printer stacks choke on a single huge transfer.
      const CHUNK = 4096;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, i + CHUNK);
        const copy = new Uint8Array(slice); // detached, transferable buffer
        await device.transferOut(endpointNumber, copy);
      }
    } finally {
      await device.releaseInterface(interfaceNumber).catch(() => {});
    }
  } finally {
    await device.close().catch(() => {});
  }
}

interface BulkOutTarget {
  interfaceNumber: number;
  alternateSetting: number;
  endpointNumber: number;
}

function findBulkOut(device: USBDevice): BulkOutTarget {
  const config = device.configuration;
  if (!config) throw new Error("USB printer has no active configuration.");
  // Prefer the printer class (interfaceClass 7), then fall back to any
  // interface, preferring the currently-active alternate setting first.
  const ifaces = [...config.interfaces].sort((a, b) => {
    const aPrinter = a.alternate.interfaceClass === 7 ? 0 : 1;
    const bPrinter = b.alternate.interfaceClass === 7 ? 0 : 1;
    return aPrinter - bPrinter;
  });
  for (const iface of ifaces) {
    const alts = [...iface.alternates].sort(
      (a, b) =>
        (a.alternateSetting === iface.alternate.alternateSetting ? 0 : 1) -
        (b.alternateSetting === iface.alternate.alternateSetting ? 0 : 1),
    );
    for (const alt of alts) {
      for (const ep of alt.endpoints) {
        if (ep.direction === "out" && ep.type === "bulk") {
          return {
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting,
            endpointNumber: ep.endpointNumber,
          };
        }
      }
    }
  }
  throw new Error("No bulk OUT endpoint found on the USB printer.");
}

/* ────────────────────────────── public print API ────────────────────────── */

export async function printReceiptViaUsb(
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
): Promise<void> {
  const device = await getSavedUsbPrinter();
  if (!device) {
    throw new Error(
      "No USB printer connected. Open Settings → POS Interface and tap “Connect USB printer”.",
    );
  }
  const width = settings.receipt_size === "58mm" ? 32 : 42;
  const text = buildEscPosReceiptText(order, settings, width);
  await sendBytes(device, encodeReceipt(text));
}

export async function testUsbPrint(settings: ReceiptSettings = {}): Promise<void> {
  const device = await getSavedUsbPrinter();
  if (!device) {
    throw new Error(
      "No USB printer connected. Tap “Connect USB printer” first.",
    );
  }
  const width = settings.receipt_size === "58mm" ? 32 : 42;
  const lines: string[] = [];
  lines.push(center("NEXXUS POS", width));
  lines.push(center("USB PRINTER TEST", width));
  lines.push(divider(width));
  lines.push("If you can read this, raw ESC/POS");
  lines.push("printing over USB is working.");
  lines.push("");
  lines.push(center(new Date().toLocaleString("en-JM"), width));
  lines.push("");
  lines.push("");
  lines.push("");
  await sendBytes(device, encodeReceipt(lines.join("\n")));
}

/* ────────────────────────────── ESC/POS encoding ────────────────────────── */

const ESC = 0x1b;
const GS = 0x1d;

/** Fold the receipt text to a printable 7-bit-ish byte stream and frame it with
 *  ESC @ (init) … LF feed … GS V B 0 (partial cut). */
function encodeReceipt(text: string): Uint8Array {
  const body = asciiFold(text);
  const bodyBytes = Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
  const head = Uint8Array.from([ESC, 0x40]); // ESC @ initialize
  const feed = Uint8Array.from([0x0a, 0x0a, 0x0a]); // a few line feeds
  const cut = Uint8Array.from([GS, 0x56, 0x42, 0x00]); // GS V B 0 — feed & partial cut
  const out = new Uint8Array(head.length + bodyBytes.length + feed.length + cut.length);
  let o = 0;
  out.set(head, o); o += head.length;
  out.set(bodyBytes, o); o += bodyBytes.length;
  out.set(feed, o); o += feed.length;
  out.set(cut, o);
  return out;
}

/** Replace common non-ASCII glyphs so they print correctly on a thermal head. */
function asciiFold(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

/* ────────────────────────────── plain-text builder ──────────────────────── */
/* Ported from the previous desktop ESC/POS path. Parameterized by column width
 * (42 cols = 80mm, 32 cols = 58mm). */

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

const center = (s: string, w: number) => {
  const t = s.length > w ? s.slice(0, w) : s;
  const left = Math.floor((w - t.length) / 2);
  return " ".repeat(Math.max(0, left)) + t;
};

const divider = (w: number, ch = "-") => ch.repeat(w);

/** Left text + right text on one line, padded to width (right side wins). */
const lr = (left: string, right: string, w: number): string => {
  const r = right.length >= w ? right.slice(-w) : right;
  const maxLeft = w - r.length - 1;
  const l = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft - 1)) + "…" : left;
  const gap = w - l.length - r.length;
  return l + " ".repeat(Math.max(1, gap)) + r;
};

/** Wrap a long string across multiple lines of the given width. */
const wrap = (text: string, width: number): string[] => {
  if (text.length <= width) return [text];
  const out: string[] = [];
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    if (!line.length) { line = w.slice(0, width); continue; }
    if (line.length + 1 + w.length <= width) line += " " + w;
    else { out.push(line); line = w.slice(0, width); }
  }
  if (line.length) out.push(line);
  return out;
};

export function buildEscPosReceiptText(
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
  width = 42,
): string {
  const businessName = (settings.business_name ?? "RECEIPT").toUpperCase();
  const address = settings.business_address ?? "";
  const phone = settings.business_phone ?? "";
  const footer = settings.receipt_footer ?? "Thank you for your business!";
  const currency = settings.base_currency ?? "JMD";
  const taxName = settings.tax_name ?? "Tax";
  const taxRate = settings.tax_rate ?? "";

  const ts = (() => {
    const d = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
    if (isNaN(d.getTime())) return String(order.createdAt);
    return d.toLocaleString("en-JM");
  })();

  const lines: string[] = [];

  // ── Header ──
  lines.push(center(businessName, width));
  if (address) wrap(address, width).forEach((l) => lines.push(center(l, width)));
  if (phone) lines.push(center(phone, width));
  lines.push(divider(width));

  // ── Meta ──
  lines.push(lr("Order:", order.orderNumber, width));
  lines.push(lr("Date:", ts, width));
  if (order.staffName) lines.push(lr("Cashier:", order.staffName, width));
  if (order.orderType) lines.push(lr("Mode:", order.orderType, width));
  if (order.customerName) lines.push(lr("Customer:", order.customerName, width));
  lines.push(divider(width));

  // ── Items ──
  lines.push(lr("Item", currency, width));
  for (const it of order.items) {
    const qty = it.quantity;
    const right = `${fmt(it.lineTotal)}`;
    const head = `${qty}x ${it.productName}`;
    const wrappedHead = wrap(head, width - right.length - 1);
    lines.push(lr(wrappedHead[0], right, width));
    for (let i = 1; i < wrappedHead.length; i++) lines.push("  " + wrappedHead[i]);
    const annotations: string[] = [];
    (it.variantChoices ?? []).forEach((v) => annotations.push(v.optionName));
    (it.modifierChoices ?? []).forEach((m) => annotations.push("+ " + m.optionName));
    annotations.forEach((a) => lines.push("  " + a.slice(0, width - 2)));
    if (qty > 1 && it.unitPrice != null) {
      lines.push("  @ " + fmt(it.unitPrice) + " each");
    }
  }
  lines.push(divider(width));

  // ── Totals ──
  lines.push(lr("Subtotal:", `${currency} ${fmt(order.subtotal)}`, width));

  const tierSavings = totalTierSavings(order.items);
  if (tierSavings > 0) lines.push(lr("You Save:", `-${currency} ${fmt(tierSavings)}`, width));

  if (order.discountValue && order.discountValue > 0) {
    lines.push(lr("Discount:", `-${currency} ${fmt(order.discountValue)}`, width));
  }

  if (order.tax > 0 || taxRate) {
    const taxLabel = taxRate ? `${taxName} (${taxRate}%):` : `${taxName}:`;
    lines.push(lr(taxLabel, `${currency} ${fmt(order.tax)}`, width));
  }

  lines.push(divider(width, "="));
  lines.push(lr("TOTAL:", `${currency} ${fmt(order.total)}`, width));
  lines.push(divider(width, "="));
  lines.push("");

  // ── Payment ──
  const pm = (order.paymentMethod ?? "").toLowerCase();
  if (pm === "split") {
    lines.push(lr("Cash:", `${currency} ${fmt(order.splitCashAmount ?? 0)}`, width));
    lines.push(lr("Card:", `${currency} ${fmt(order.splitCardAmount ?? 0)}`, width));
  } else if (order.paymentMethod) {
    lines.push(lr("Payment:", order.paymentMethod, width));
  }
  if (order.cashTendered != null) {
    lines.push(lr("Tendered:", `${currency} ${fmt(order.cashTendered)}`, width));
    const change = order.cashTendered - order.total;
    if (change > 0) lines.push(lr("Change:", `${currency} ${fmt(change)}`, width));
  }

  // ── Loyalty ──
  if (order.loyaltyPointsRedeemed) {
    lines.push(lr("Points Redeemed:", String(order.loyaltyPointsRedeemed), width));
  }
  if (order.loyaltyPointsEarned) {
    lines.push(lr("Points Earned:", String(order.loyaltyPointsEarned), width));
  }
  if (order.customerLoyaltyBalance != null) {
    lines.push(lr("Points Balance:", String(order.customerLoyaltyBalance), width));
  }

  // ── Notes ──
  if (order.notes) {
    lines.push("");
    lines.push("Notes:");
    wrap(order.notes, width).forEach((l) => lines.push(l));
  }

  // ── Footer ──
  lines.push("");
  wrap(footer, width).forEach((l) => lines.push(center(l, width)));
  lines.push(center("Powered by NEXXUS POS", width));

  return lines.join("\n");
}
