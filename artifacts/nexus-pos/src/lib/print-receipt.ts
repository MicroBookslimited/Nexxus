/**
 * Cross-platform receipt printing.
 *
 *  • Android (PWA on ELO terminals etc.): build a 42-column ESC/POS plain
 *    text receipt and fire it at the Looped Labs ESC POS Print Service via
 *    an Android intent URL. Looped Labs handles the Bluetooth/USB printer
 *    handoff. If the intent is not handled (service not installed,
 *    permission denied, etc.) we fall back to the same HTML iframe print
 *    used on desktop so the cashier always gets *something*.
 *
 *  • Desktop / non-Android: delegate to the existing iframe-based
 *    `openReceiptWindow(html)`. That pipeline is already battle-tested for
 *    pop-up blockers, KioskLock coordination, and `@media print` isolation.
 *
 * Public API: `printOrderReceipt(html, order, settings, opts?)`.
 */
import {
  openReceiptWindow,
  totalTierSavings,
  type ReceiptOrder,
  type ReceiptSettings,
} from "./receipt";

/* ─────────────────────────────────────────────────────────────────
 * Platform detection
 * ─────────────────────────────────────────────────────────────────*/

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/* ─────────────────────────────────────────────────────────────────
 * ESC/POS plain-text builder — 42 columns (80mm printer)
 * ─────────────────────────────────────────────────────────────────*/

const WIDTH = 42;

const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toFixed(2);

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);

const center = (s: string, w = WIDTH) => {
  const t = s.length > w ? s.slice(0, w) : s;
  const left = Math.floor((w - t.length) / 2);
  return " ".repeat(Math.max(0, left)) + t;
};

const divider = (ch = "-") => ch.repeat(WIDTH);

/** Left text + right text on one line, padded to WIDTH. Truncates the left
 *  side if the combined length would overflow (right side wins — totals
 *  must remain readable on a tiny printer). */
const lr = (left: string, right: string): string => {
  const r = right.length >= WIDTH ? right.slice(-WIDTH) : right;
  const maxLeft = WIDTH - r.length - 1;
  const l = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft - 1)) + "…" : left;
  const gap = WIDTH - l.length - r.length;
  return l + " ".repeat(Math.max(1, gap)) + r;
};

/** Wrap a long item name across multiple lines, preserving the right column. */
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
): string {
  const businessName = (settings.business_name ?? "RECEIPT").toUpperCase();
  const address      = settings.business_address ?? "";
  const phone        = settings.business_phone ?? "";
  const footer       = settings.receipt_footer ?? "Thank you for your business!";
  const currency     = settings.base_currency ?? "JMD";
  const taxName      = settings.tax_name ?? "Tax";
  const taxRate      = settings.tax_rate ?? "";

  const ts = (() => {
    const d = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
    if (isNaN(d.getTime())) return String(order.createdAt);
    return d.toLocaleString("en-JM");
  })();

  const lines: string[] = [];

  // ── Header ──
  lines.push(center(businessName));
  if (address) wrap(address, WIDTH).forEach(l => lines.push(center(l)));
  if (phone)   lines.push(center(phone));
  lines.push(divider());

  // ── Meta ──
  lines.push(lr("Order:", order.orderNumber));
  lines.push(lr("Date:",  ts));
  if (order.staffName)        lines.push(lr("Cashier:", order.staffName));
  if (order.orderType)        lines.push(lr("Mode:",    order.orderType));
  if (order.customerName)     lines.push(lr("Customer:", order.customerName));
  lines.push(divider());

  // ── Items ──
  lines.push(lr("Item", currency.padStart(currency.length)));
  for (const it of order.items) {
    const qty   = it.quantity;
    const right = `${fmt(it.lineTotal)}`;
    const head  = `${qty}x ${it.productName}`;
    const wrappedHead = wrap(head, WIDTH - right.length - 1);
    // First line: name (truncated/wrapped) + right-aligned line total
    lines.push(lr(wrappedHead[0], right));
    // Continuation lines (long product names)
    for (let i = 1; i < wrappedHead.length; i++) lines.push("  " + wrappedHead[i]);
    // Variant / modifier annotations
    const annotations: string[] = [];
    (it.variantChoices ?? []).forEach(v => annotations.push(v.optionName));
    (it.modifierChoices ?? []).forEach(m => annotations.push("+ " + m.optionName));
    annotations.forEach(a => lines.push("  " + a.slice(0, WIDTH - 2)));
    // Per-unit price hint when qty > 1
    if (qty > 1 && it.unitPrice != null) {
      lines.push("  @ " + fmt(it.unitPrice) + " each");
    }
  }
  lines.push(divider());

  // ── Totals ──
  lines.push(lr("Subtotal:", `${currency} ${fmt(order.subtotal)}`));

  const tierSavings = totalTierSavings(order.items);
  if (tierSavings > 0) lines.push(lr("You Save:", `-${currency} ${fmt(tierSavings)}`));

  if (order.discountValue && order.discountValue > 0) {
    lines.push(lr("Discount:", `-${currency} ${fmt(order.discountValue)}`));
  }

  if (order.tax > 0 || taxRate) {
    const taxLabel = taxRate ? `${taxName} (${taxRate}%):` : `${taxName}:`;
    lines.push(lr(taxLabel, `${currency} ${fmt(order.tax)}`));
  }

  lines.push(divider("="));
  lines.push(lr("TOTAL:", `${currency} ${fmt(order.total)}`));
  lines.push(divider("="));
  lines.push("");

  // ── Payment ──
  const pm = (order.paymentMethod ?? "").toLowerCase();
  if (pm === "split") {
    lines.push(lr("Cash:",   `${currency} ${fmt(order.splitCashAmount ?? 0)}`));
    lines.push(lr("Card:",   `${currency} ${fmt(order.splitCardAmount ?? 0)}`));
  } else if (order.paymentMethod) {
    lines.push(lr("Payment:", order.paymentMethod));
  }
  if (order.cashTendered != null) {
    lines.push(lr("Tendered:", `${currency} ${fmt(order.cashTendered)}`));
    const change = order.cashTendered - order.total;
    if (change > 0) lines.push(lr("Change:", `${currency} ${fmt(change)}`));
  }

  // ── Loyalty ──
  if (order.loyaltyPointsRedeemed) {
    lines.push(lr("Points Redeemed:", String(order.loyaltyPointsRedeemed)));
  }
  if (order.loyaltyPointsEarned) {
    lines.push(lr("Points Earned:", String(order.loyaltyPointsEarned)));
  }
  if (order.customerLoyaltyBalance != null) {
    lines.push(lr("Points Balance:", String(order.customerLoyaltyBalance)));
  }

  // ── Notes ──
  if (order.notes) {
    lines.push("");
    lines.push("Notes:");
    wrap(order.notes, WIDTH).forEach(l => lines.push(l));
  }

  // ── Footer ──
  lines.push("");
  wrap(footer, WIDTH).forEach(l => lines.push(center(l)));
  lines.push(center("Powered by NEXXUS POS"));

  // Paper feed before cut
  lines.push("");
  lines.push("");
  lines.push("");

  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────────
 * Looped Labs ESC POS Print Service — Android intent
 * ─────────────────────────────────────────────────────────────────
 *
 * Looped Labs accepts a standard `ACTION_SEND` / `text/plain` intent with
 * the package pinned to `com.loopedlabs.escposprintservice`. The intent
 * URL has to use SEMICOLONS (not ampersands) between fields per the
 * Android `Intent.URI_INTENT_SCHEME` spec.
 *
 * We fire it via `window.location.href` so Chrome resolves the intent
 * directly (rather than navigating). If the service is not installed
 * Chrome silently drops the navigation; we detect that the page is still
 * alive 800 ms later and fall back to the HTML iframe path so the
 * cashier still gets a printable receipt.
 */
function tryLoopedLabsPrint(receiptText: string): boolean {
  try {
    const encoded = encodeURIComponent(receiptText);
    const intentUrl =
      "intent:" +
      "#Intent" +
      ";action=android.intent.action.SEND" +
      ";type=text/plain" +
      ";package=com.loopedlabs.escposprintservice" +
      ";S.android.intent.extra.TEXT=" + encoded +
      ";end";
    // Use a transient anchor to avoid replacing the SPA URL in history.
    const a = document.createElement("a");
    a.href = intentUrl;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[print-receipt] Looped Labs intent failed:", err);
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────────*/

export interface PrintOrderReceiptOpts {
  /** Force a specific path regardless of UA. Useful for debug toggles. */
  forceMode?: "android" | "browser";
}

/**
 * Print an order receipt using the best available method for the device.
 *
 *  - Android → Looped Labs ESC/POS intent (with HTML iframe fallback)
 *  - Everything else → existing HTML iframe print
 *
 * Callers already build the styled HTML via `buildReceiptHtml(order)`
 * for desktop use; we accept it here so we can fall back to the same
 * pipeline if the Android intent path fails.
 */
export function printOrderReceipt(
  html: string,
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
  opts: PrintOrderReceiptOpts = {},
): void {
  // On Android we *always* try the Looped Labs ESC/POS intent first.
  // The Looped Labs app expects plain ESC/POS text (which we build
  // below) and chokes when handed styled HTML via Android's print
  // picker — that path produced the "ESC POS USB Print Service has
  // stopped" crashes on the ELO tablets. The intent path has a built-in
  // safety net: if Looped Labs is not installed, the page is still
  // visible 1.5s later and we fall back to the HTML iframe so the
  // cashier always gets a receipt. The tenant can still force the
  // browser path by setting escpos_print_enabled="false" explicitly.
  const escposDisabled = settings.escpos_print_enabled === "false";
  const mode = opts.forceMode ?? (isAndroid() && !escposDisabled ? "android" : "browser");

  if (mode === "android") {
    const text = buildEscPosReceiptText(order, settings);
    // eslint-disable-next-line no-console
    console.log("[print-receipt] Looped Labs receipt:\n" + text);
    const fired = tryLoopedLabsPrint(text);
    if (!fired) {
      openReceiptWindow(html);
      return;
    }
    // Belt-and-suspenders: if the intent didn't resolve (service not
    // installed), the page is still here 800ms later. Fall back so the
    // cashier isn't left without a receipt.
    setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        // The intent either succeeded (Looped Labs is foregrounded — we'd
        // be hidden) or silently failed. If we're still visible the
        // service likely isn't installed; print the HTML version too.
        // This is safe — printing twice is annoying but never wrong.
        openReceiptWindow(html);
      }
    }, 1500);
    return;
  }

  openReceiptWindow(html);
}
