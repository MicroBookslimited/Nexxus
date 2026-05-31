/**
 * ESC/POS receipt builder for the mobile app.
 *
 * The 42/32-column plain-text layout is ported from the desktop builder
 * (`artifacts/nexus-pos/src/lib/print-receipt.ts` → `buildEscPosReceiptText`)
 * so mobile and desktop receipts look the same. `buildReceiptBytes` wraps the
 * text in raw ESC/POS control codes (init + feed + cut) for the network and
 * Bluetooth transports; the USB transport prints the plain text directly
 * (the USB library emits its own init/cut).
 */
import type { ReceiptItem, ReceiptOrder, ReceiptSettings } from "./types";

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

const center = (s: string, w: number) => {
  const t = s.length > w ? s.slice(0, w) : s;
  const left = Math.floor((w - t.length) / 2);
  return " ".repeat(Math.max(0, left)) + t;
};

const divider = (w: number, ch = "-") => ch.repeat(w);

const lr = (left: string, right: string, w: number): string => {
  const r = right.length >= w ? right.slice(-w) : right;
  const maxLeft = w - r.length - 1;
  const l = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft - 1)) + "…" : left;
  const gap = w - l.length - r.length;
  return l + " ".repeat(Math.max(1, gap)) + r;
};

const wrap = (text: string, width: number): string[] => {
  if (text.length <= width) return [text];
  const out: string[] = [];
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    if (!line.length) {
      line = w.slice(0, width);
      continue;
    }
    if (line.length + 1 + w.length <= width) line += " " + w;
    else {
      out.push(line);
      line = w.slice(0, width);
    }
  }
  if (line.length) out.push(line);
  return out;
};

/** Sum of (originalUnitPrice - unitPrice) * quantity for tier/promo savings. */
function totalTierSavings(items: ReceiptItem[]): number {
  let savings = 0;
  for (const item of items) {
    const orig = item.originalUnitPrice;
    if (orig != null && item.unitPrice != null && orig > item.unitPrice) {
      savings += (orig - item.unitPrice) * item.quantity;
    }
  }
  return savings;
}

export function buildReceiptText(
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
  width = 42,
): string {
  const W = width;
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

  lines.push(center(businessName, W));
  if (address) wrap(address, W).forEach((l) => lines.push(center(l, W)));
  if (phone) lines.push(center(phone, W));
  lines.push(divider(W));

  lines.push(lr("Order:", order.orderNumber, W));
  lines.push(lr("Date:", ts, W));
  if (order.staffName) lines.push(lr("Cashier:", order.staffName, W));
  if (order.orderType) lines.push(lr("Mode:", order.orderType, W));
  if (order.customerName) lines.push(lr("Customer:", order.customerName, W));
  lines.push(divider(W));

  lines.push(lr("Item", currency, W));
  for (const it of order.items) {
    const qty = it.quantity;
    const right = `${fmt(it.lineTotal)}`;
    const head = `${qty}x ${it.productName}`;
    const wrappedHead = wrap(head, W - right.length - 1);
    lines.push(lr(wrappedHead[0]!, right, W));
    for (let i = 1; i < wrappedHead.length; i++) lines.push("  " + wrappedHead[i]);
    const annotations: string[] = [];
    (it.variantChoices ?? []).forEach((v) => annotations.push(v.optionName));
    (it.modifierChoices ?? []).forEach((m) => annotations.push("+ " + m.optionName));
    annotations.forEach((a) => lines.push("  " + a.slice(0, W - 2)));
    if (qty > 1 && it.unitPrice != null) {
      lines.push("  @ " + fmt(it.unitPrice) + " each");
    }
  }
  lines.push(divider(W));

  lines.push(lr("Subtotal:", `${currency} ${fmt(order.subtotal)}`, W));

  const tierSavings = totalTierSavings(order.items);
  if (tierSavings > 0) lines.push(lr("You Save:", `-${currency} ${fmt(tierSavings)}`, W));

  if (order.discountValue && order.discountValue > 0) {
    lines.push(lr("Discount:", `-${currency} ${fmt(order.discountValue)}`, W));
  }

  if (order.tax > 0 || taxRate) {
    const taxLabel = taxRate ? `${taxName} (${taxRate}%):` : `${taxName}:`;
    lines.push(lr(taxLabel, `${currency} ${fmt(order.tax)}`, W));
  }

  lines.push(divider(W, "="));
  lines.push(lr("TOTAL:", `${currency} ${fmt(order.total)}`, W));
  lines.push(divider(W, "="));
  lines.push("");

  const pm = (order.paymentMethod ?? "").toLowerCase();
  if (order.paymentMethod) lines.push(lr("Payment:", order.paymentMethod, W));
  if (order.cashTendered != null) {
    lines.push(lr("Tendered:", `${currency} ${fmt(order.cashTendered)}`, W));
    const change = order.cashTendered - order.total;
    if (change > 0) lines.push(lr("Change:", `${currency} ${fmt(change)}`, W));
  }
  void pm;

  if (order.notes) {
    lines.push("");
    lines.push("Notes:");
    wrap(order.notes, W).forEach((l) => lines.push(l));
  }

  lines.push("");
  wrap(footer, W).forEach((l) => lines.push(center(l, W)));
  lines.push(center("Powered by NEXXUS POS", W));

  lines.push("");
  lines.push("");
  lines.push("");

  return lines.join("\n");
}

/**
 * Fold non-ASCII characters down to printer-safe ASCII so raw byte transports
 * (network/Bluetooth) never emit multi-byte UTF-8 the printer can't render.
 */
export function asciiFold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00D7\u2715]/g, "x")
    // Anything still outside printable ASCII (keep \n) becomes '?'
    .replace(/[^\n\x20-\x7E]/g, "?");
}

const ESC = 0x1b;
const GS = 0x1d;

/** Wrap receipt text in ESC/POS control codes: init, body, feed, partial cut. */
export function buildReceiptBytes(text: string): Uint8Array {
  const body = asciiFold(text);
  const head = [ESC, 0x40]; // ESC @  → initialize
  const bodyBytes: number[] = [];
  for (let i = 0; i < body.length; i++) bodyBytes.push(body.charCodeAt(i) & 0x7f);
  const tail = [0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]; // feed + GS V B 0 (partial cut)
  return Uint8Array.from([...head, ...bodyBytes, ...tail]);
}
