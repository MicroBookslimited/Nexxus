/**
 * Plain-text end-of-day (shift) report for ESC/POS thermal printers.
 * Layout mirrors the web app's 80mm EOD print, adapted to the mobile
 * printer's configured column width (32 or 42).
 */
import type { CashSessionDetail } from "./nexus-api";

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const center = (s: string, w: number) => {
  const t = s.length > w ? s.slice(0, w) : s;
  return " ".repeat(Math.max(0, Math.floor((w - t.length) / 2))) + t;
};
const divider = (w: number, ch = "-") => ch.repeat(w);
const lr = (left: string, right: string, w: number): string => {
  const r = right.length >= w ? right.slice(-w) : right;
  const maxLeft = w - r.length - 1;
  const l = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft - 1)) + "…" : left;
  return l + " ".repeat(Math.max(1, w - l.length - r.length)) + r;
};

function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function buildEodReportText(
  detail: CashSessionDetail,
  opts: { businessName?: string; width: 32 | 42; includeTransactions?: boolean },
): string {
  const w = opts.width;
  const { session, salesSummary: s, payouts } = detail;
  const L: string[] = [];

  const biz = (opts.businessName ?? "NEXXUS POS").replace(/\s*\r?\n\s*/g, " ");
  L.push(center(biz, w));
  L.push(center("END OF DAY REPORT", w));
  L.push(divider(w, "="));
  if (session.staffName) L.push(lr("Staff", session.staffName, w));
  L.push(lr("Opened", dt(session.openedAt), w));
  L.push(lr("Closed", session.closedAt ? dt(session.closedAt) : "OPEN", w));
  L.push(divider(w));

  // Orders = every non-voided paid order attributed to the shift.
  const orderCount = detail.orders.filter((o) => o.status !== "voided").length;
  L.push(center("SALES", w));
  L.push(lr("Total sales", fmt(s.totalSales ?? 0), w));
  L.push(lr("Orders", String(orderCount), w));
  L.push(lr("Cash", fmt(s.cashSales ?? 0), w));
  L.push(lr("Card", fmt(s.cardSales ?? 0), w));
  if ((s.splitSales ?? 0) !== 0) L.push(lr("Split", fmt(s.splitSales), w));
  if ((s.creditSales ?? 0) !== 0) L.push(lr("On account", fmt(s.creditSales), w));
  if ((s.totalRefunds ?? 0) !== 0) L.push(lr("Refunds", `-${fmt(s.totalRefunds)}`, w));
  if ((s.refundedCash ?? 0) !== 0) L.push(lr("Refunded (cash)", `-${fmt(s.refundedCash)}`, w));
  if ((s.voidedCount ?? 0) !== 0) L.push(lr(`Voided (${s.voidedCount})`, fmt(s.voidedTotal ?? 0), w));
  if ((detail.splitCashSales ?? 0) !== 0) L.push(lr("Split cash", fmt(detail.splitCashSales), w));
  if ((detail.voucherCashIn ?? 0) !== 0) L.push(lr("Voucher cash-in", fmt(detail.voucherCashIn), w));
  if ((detail.layawayCashIn ?? 0) !== 0) L.push(lr("Layaway cash-in", fmt(detail.layawayCashIn), w));
  L.push(divider(w));

  L.push(center("CASH RECONCILIATION", w));
  L.push(lr("Opening float", fmt(session.openingCash ?? 0), w));
  L.push(lr("Payouts", `-${fmt(detail.totalPayouts ?? 0)}`, w));
  L.push(lr("Expected cash", fmt(detail.expectedCash ?? 0), w));
  if (session.actualCash != null) {
    L.push(lr("Counted cash", fmt(session.actualCash), w));
    const diff = session.actualCash - (detail.expectedCash ?? 0);
    L.push(lr(diff >= 0 ? "Over" : "Short", fmt(Math.abs(diff)), w));
  }
  L.push(divider(w));

  if (payouts.length > 0) {
    L.push(center("PAYOUTS", w));
    for (const p of payouts) L.push(lr(p.reason || "Payout", `-${fmt(p.amount)}`, w));
    L.push(divider(w));
  }

  if (detail.itemSummary && detail.itemSummary.length > 0) {
    L.push(center("ITEMS SOLD", w));
    for (const it of detail.itemSummary) {
      L.push(lr(`${it.totalQty} x ${it.productName}`, fmt(it.totalRevenue), w));
    }
    L.push(divider(w));
  }

  if (detail.creditOrders && detail.creditOrders.length > 0) {
    L.push(center("ON-ACCOUNT (CREDIT)", w));
    for (const co of detail.creditOrders) {
      L.push(lr(`${co.orderNumber}${co.customerName ? " " + co.customerName : ""}`, fmt(co.total), w));
    }
    L.push(divider(w));
  }

  if (opts.includeTransactions && detail.orders.length > 0) {
    L.push(center("TRANSACTIONS", w));
    for (const o of detail.orders) {
      const flag = o.status === "voided" ? " VOID" : o.status === "refunded" ? " RFND" : "";
      L.push(lr(`${o.orderNumber}${flag}`, fmt(o.total), w));
    }
    L.push(divider(w));
  }

  if (session.closingNotes) {
    L.push("Notes: " + session.closingNotes);
    L.push(divider(w));
  }
  L.push(center("Printed " + dt(new Date().toISOString()), w));
  L.push("");
  return L.join("\n");
}
