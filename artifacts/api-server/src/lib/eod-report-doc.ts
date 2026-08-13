/**
 * End-of-day (shift) report rendered as a PDF and as an HTML email body.
 *
 * Used for BOTH the POS drawer and a field technician's shift. A technician's
 * money never passes through a POS order, so the report leads with the onsite
 * work-order collections and carries the cash-custody block: who counted the
 * cash, and who signed for it when it was handed in.
 */
import PDFDocument from "pdfkit";

export interface EodPayout {
  amount: number;
  reason: string;
  staffName: string | null;
  createdAt: Date | string;
}

export interface EodOrder {
  orderNumber: string;
  total: number | null;
  paymentMethod: string | null;
  status: string | null;
  createdAt: Date | string;
}

export interface EodWoPayment {
  amount: number;
  method: string;
  reference: string | null;
  createdAt: Date | string;
  workOrderNumber: string | null;
  customerName: string | null;
}

export interface EodHandover {
  status: string;
  amount: number;
  receivedAmount: number | null;
  receivedByName: string | null;
  signature: string | null;
  signedAt: Date | string | null;
  notes: string | null;
}

export interface EodReportData {
  session: {
    id: number;
    staffName: string;
    locationName?: string | null;
    openingCash: number;
    openedAt: Date | string;
    closedAt: Date | string | null;
    status: string;
    actualCash: number | null;
    actualCard: number | null;
    actualOther: number | null;
    closingNotes: string | null;
    denominationBreakdown: string | null;
  };
  salesSummary: {
    cashSales: number;
    cardSales: number;
    splitSales: number;
    creditSales: number;
    totalSales: number;
    refundedCash: number;
    refundedCard: number;
    totalRefunds: number;
    voidedCount: number;
    voidedTotal: number;
  };
  payouts: EodPayout[];
  orders: EodOrder[];
  woPayments: EodWoPayment[];
  expectedCash: number;
  totalPayouts: number;
  splitCashSales: number;
  voucherCashIn: number;
  layawayCashIn: number;
  woCashIn: number;
  woCardIn: number;
  woTransferIn: number;
  handover: EodHandover | null;
}

export interface EodDocOptions {
  businessName: string;
  /** IANA zone from the tenant's `timezone` setting. */
  timeZone?: string | null;
  currencySymbol?: string;
  logo?: Buffer | null;
}

/* ─── Formatting ─────────────────────────────────────────────────────────── */

const C = { ink: "#111827", muted: "#6b7280", line: "#e5e7eb", brand: "#0f766e", bad: "#b91c1c", good: "#047857" };

function money(n: number | null | undefined, symbol = "$"): string {
  const v = Number(n ?? 0);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${symbol}${s}`;
}

function fmtDateTime(value: Date | string | null | undefined, tz?: string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
      timeZone: tz || undefined,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function fmtTime(value: Date | string | null | undefined, tz?: string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Denominations are stored as JSON by the counting UI; tolerate anything else. */
export function parseDenominations(raw: string | null | undefined): { label: string; count: number; value: number }[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows: { label: string; count: number; value: number }[] = [];
    if (Array.isArray(parsed)) {
      for (const entry of parsed as { label?: string; denomination?: number; value?: number; count?: number; qty?: number }[]) {
        const denom = Number(entry.denomination ?? entry.value ?? 0);
        const count = Number(entry.count ?? entry.qty ?? 0);
        if (!count) continue;
        rows.push({ label: entry.label ?? money(denom), count, value: denom * count });
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        const denom = Number(key);
        const count = Number(val);
        if (!Number.isFinite(denom) || !count) continue;
        rows.push({ label: money(denom), count, value: denom * count });
      }
    }
    return rows.sort((a, b) => b.value - a.value);
  } catch {
    return [];
  }
}

/** Over/short against expected cash. Positive = over, negative = short. */
export function cashVariance(data: EodReportData): number | null {
  if (data.session.actualCash == null) return null;
  return data.session.actualCash - data.expectedCash;
}

/* ─── PDF ────────────────────────────────────────────────────────────────── */

const M = 48;

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function renderEodReportPdf(data: EodReportData, opts: EodDocOptions): Promise<Buffer> {
  const sym = opts.currencySymbol ?? "$";
  const tz = opts.timeZone;
  const doc = new PDFDocument({ size: "A4", margin: M });
  const right = doc.page.width - M;
  const width = right - M;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - M) doc.addPage();
  };

  const sectionTitle = (title: string) => {
    ensureSpace(48);
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.brand).text(title.toUpperCase(), M, doc.y, { characterSpacing: 0.6 });
    doc.moveTo(M, doc.y + 3).lineTo(right, doc.y + 3).lineWidth(1).strokeColor(C.line).stroke();
    doc.moveDown(0.6);
  };

  const row = (label: string, value: string, o?: { bold?: boolean; color?: string }) => {
    ensureSpace(20);
    const y = doc.y;
    doc.font(o?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(o?.color ?? C.ink);
    doc.text(label, M, y, { width: width * 0.62 });
    doc.text(value, M, y, { width, align: "right" });
    doc.moveDown(0.25);
  };

  const threeCol = (a: string, b: string, c: string, bold = false) => {
    ensureSpace(18);
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(bold ? C.ink : C.muted);
    doc.text(a, M, y, { width: width * 0.5 });
    doc.text(b, M + width * 0.5, y, { width: width * 0.22 });
    doc.text(c, M, y, { width, align: "right" });
    doc.moveDown(0.25);
  };

  // Header
  if (opts.logo) {
    try { doc.image(opts.logo, right - 110, M, { fit: [110, 44], align: "right" }); } catch { /* ignore bad logo */ }
  }
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.ink)
    .text((opts.businessName || "NEXXUS").replace(/\s*\r?\n\s*/g, " "), M, M, { width: width - 120 });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.brand).text("End of Day Report", M, doc.y + 2);
  doc.font("Helvetica").fontSize(9.5).fillColor(C.muted)
    .text(`Shift #${data.session.id}${data.session.locationName ? ` · ${data.session.locationName}` : ""}`, M, doc.y + 2);
  doc.moveDown(0.6);

  sectionTitle("Shift");
  row("Staff", data.session.staffName);
  row("Opened", fmtDateTime(data.session.openedAt, tz));
  row("Closed", data.session.closedAt ? fmtDateTime(data.session.closedAt, tz) : "Still open");

  // Collections — onsite work-order payments plus any POS sales on this shift.
  sectionTitle("Collections");
  if (data.woCashIn || data.woCardIn || data.woTransferIn) {
    row("Job payments — cash", money(data.woCashIn, sym));
    row("Job payments — card", money(data.woCardIn, sym));
    if (data.woTransferIn) row("Job payments — transfer", money(data.woTransferIn, sym));
  }
  if (data.salesSummary.totalSales || data.orders.length > 0) {
    row("POS sales — cash", money(data.salesSummary.cashSales, sym));
    row("POS sales — card", money(data.salesSummary.cardSales, sym));
    if (data.salesSummary.splitSales) row("POS sales — split", money(data.salesSummary.splitSales, sym));
    if (data.salesSummary.creditSales) row("POS sales — on account", money(data.salesSummary.creditSales, sym));
    if (data.salesSummary.totalRefunds) row("Refunds", money(-data.salesSummary.totalRefunds, sym));
    if (data.salesSummary.voidedCount) row(`Voided (${data.salesSummary.voidedCount})`, money(data.salesSummary.voidedTotal, sym));
  }
  if (data.voucherCashIn) row("Gift vouchers sold (cash)", money(data.voucherCashIn, sym));
  if (data.layawayCashIn) row("Layaway payments (cash)", money(data.layawayCashIn, sym));

  sectionTitle("Cash reconciliation");
  row("Opening float", money(data.session.openingCash, sym));
  row("Cash collected", money(data.expectedCash - data.session.openingCash + data.totalPayouts, sym));
  row("Payouts", money(-data.totalPayouts, sym));
  row("Expected cash", money(data.expectedCash, sym), { bold: true });
  if (data.session.actualCash != null) {
    row("Counted cash", money(data.session.actualCash, sym), { bold: true });
    const v = cashVariance(data) ?? 0;
    const label = Math.abs(v) < 0.005 ? "Balanced" : v > 0 ? "Overage" : "Shortage";
    row(label, Math.abs(v) < 0.005 ? money(0, sym) : money(Math.abs(v), sym), {
      bold: true,
      color: Math.abs(v) < 0.005 ? C.good : C.bad,
    });
  }
  if (data.session.actualCard != null && data.session.actualCard > 0) row("Card settled (not in drawer)", money(data.session.actualCard, sym));
  if (data.session.actualOther != null && data.session.actualOther > 0) row("Transfers (not in drawer)", money(data.session.actualOther, sym));

  const denoms = parseDenominations(data.session.denominationBreakdown);
  if (denoms.length > 0) {
    sectionTitle("Cash count");
    threeCol("Denomination", "Qty", "Value", true);
    for (const d of denoms) threeCol(d.label, String(d.count), money(d.value, sym));
    threeCol("Total counted", "", money(denoms.reduce((s, d) => s + d.value, 0), sym), true);
  }

  if (data.payouts.length > 0) {
    sectionTitle("Payouts");
    threeCol("Reason", "Time", "Amount", true);
    for (const p of data.payouts) threeCol(p.reason || "Payout", fmtTime(p.createdAt, tz), money(-p.amount, sym));
    threeCol("Total payouts", "", money(-data.totalPayouts, sym), true);
  }

  if (data.woPayments.length > 0) {
    sectionTitle("Job payments");
    threeCol("Job / customer", "Method", "Amount", true);
    for (const p of data.woPayments) {
      const who = [p.workOrderNumber, p.customerName].filter(Boolean).join(" · ") || "Work order";
      threeCol(`${who} (${fmtTime(p.createdAt, tz)})`, p.method, money(p.amount, sym));
    }
  }

  const realOrders = data.orders.filter((o) => o.status !== "voided");
  if (realOrders.length > 0) {
    sectionTitle("POS transactions");
    threeCol("Order", "Method", "Amount", true);
    for (const o of realOrders) {
      threeCol(`${o.orderNumber} (${fmtTime(o.createdAt, tz)})`, o.paymentMethod ?? "—", money(o.total ?? 0, sym));
    }
  }

  if (data.session.closingNotes) {
    sectionTitle("Notes");
    doc.font("Helvetica").fontSize(10).fillColor(C.ink).text(data.session.closingNotes, M, doc.y, { width });
  }

  // Cash custody — the point of the whole document for a technician.
  sectionTitle("Cash custody");
  const h = data.handover;
  if (!h) {
    doc.font("Helvetica").fontSize(10).fillColor(C.muted)
      .text("No cash was held over from this shift.", M, doc.y, { width });
  } else if (h.status === "signed") {
    row("Handed over by", data.session.staffName);
    row("Received by", h.receivedByName ?? "—");
    row("Amount handed over", money(h.receivedAmount ?? h.amount, sym), { bold: true });
    row("Signed", fmtDateTime(h.signedAt, tz));
    if (h.notes) row("Notes", h.notes);
    // Only raster signatures can be embedded; the app also produces SVG data
    // URLs, which pdfkit cannot draw — the typed record below still stands.
    if (h.signature && /^data:image\/(png|jpe?g);base64,/i.test(h.signature)) {
      ensureSpace(90);
      try {
        const base64 = h.signature.slice(h.signature.indexOf(",") + 1);
        doc.image(Buffer.from(base64, "base64"), M, doc.y + 6, { fit: [200, 70] });
        doc.y += 78;
      } catch { /* unreadable signature image — the text record still stands */ }
    }
    doc.font("Helvetica").fontSize(9).fillColor(C.muted)
      .text(`Signed for on the device by ${h.receivedByName ?? "authorised staff"}.`, M, doc.y, { width });
  } else {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.bad)
      .text(`${money(h.amount, sym)} still in the custody of ${data.session.staffName}`, M, doc.y, { width });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(9.5).fillColor(C.muted)
      .text("Awaiting signature. The receiver signs in the app when the cash is handed in.", M, doc.y, { width });
    doc.moveDown(1.6);
    const y = doc.y;
    doc.moveTo(M, y).lineTo(M + 220, y).strokeColor(C.line).stroke();
    doc.moveTo(right - 180, y).lineTo(right, y).strokeColor(C.line).stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor(C.muted);
    doc.text("Received by (print & sign)", M, y + 4);
    doc.text("Date", right - 180, y + 4);
  }

  doc.font("Helvetica").fontSize(8).fillColor(C.muted)
    .text(`Generated ${fmtDateTime(new Date(), tz)}`, M, doc.page.height - M + 6, { width, align: "center" });

  return toBuffer(doc);
}

/* ─── HTML (email body) ──────────────────────────────────────────────────── */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildEodReportHtml(data: EodReportData, opts: EodDocOptions): string {
  const sym = opts.currencySymbol ?? "$";
  const tz = opts.timeZone;
  const v = cashVariance(data);
  const denoms = parseDenominations(data.session.denominationBreakdown);
  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#374151;${strong ? "font-weight:700;" : ""}">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;color:#111827;${strong ? "font-weight:700;" : ""}">${esc(value)}</td></tr>`;
  const section = (title: string, rows: string) =>
    `<h3 style="margin:22px 0 6px;font-size:13px;letter-spacing:.5px;text-transform:uppercase;color:#0f766e;">${esc(title)}</h3>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;

  const collections =
    (data.woCashIn || data.woCardIn || data.woTransferIn
      ? line("Job payments — cash", money(data.woCashIn, sym)) +
        line("Job payments — card", money(data.woCardIn, sym)) +
        (data.woTransferIn ? line("Job payments — transfer", money(data.woTransferIn, sym)) : "")
      : "") +
    (data.salesSummary.totalSales || data.orders.length
      ? line("POS sales — cash", money(data.salesSummary.cashSales, sym)) +
        line("POS sales — card", money(data.salesSummary.cardSales, sym)) +
        (data.salesSummary.totalRefunds ? line("Refunds", money(-data.salesSummary.totalRefunds, sym)) : "")
      : "");

  const reconciliation =
    line("Opening float", money(data.session.openingCash, sym)) +
    line("Payouts", money(-data.totalPayouts, sym)) +
    line("Expected cash", money(data.expectedCash, sym), true) +
    (data.session.actualCash != null ? line("Counted cash", money(data.session.actualCash, sym), true) : "") +
    (v != null
      ? `<tr><td style="padding:6px 0;font-weight:700;color:${Math.abs(v) < 0.005 ? "#047857" : "#b91c1c"};">` +
        `${Math.abs(v) < 0.005 ? "Balanced" : v > 0 ? "Overage" : "Shortage"}</td>` +
        `<td style="padding:6px 0;text-align:right;font-weight:700;color:${Math.abs(v) < 0.005 ? "#047857" : "#b91c1c"};">` +
        `${esc(money(Math.abs(v), sym))}</td></tr>`
      : "");

  const payouts = data.payouts.length
    ? section("Payouts", data.payouts.map((p) => line(`${p.reason} · ${fmtTime(p.createdAt, tz)}`, money(-p.amount, sym))).join(""))
    : "";

  const jobs = data.woPayments.length
    ? section("Job payments", data.woPayments.map((p) =>
        line(`${[p.workOrderNumber, p.customerName].filter(Boolean).join(" · ") || "Work order"} · ${p.method}`, money(p.amount, sym))).join(""))
    : "";

  const posOrders = data.orders.filter((o) => o.status !== "voided");
  const orders = posOrders.length
    ? section("POS transactions", posOrders.map((o) => line(`${o.orderNumber} · ${o.paymentMethod ?? "—"}`, money(o.total ?? 0, sym))).join(""))
    : "";

  const count = denoms.length
    ? section("Cash count", denoms.map((d) => line(`${d.label} × ${d.count}`, money(d.value, sym))).join(""))
    : "";

  const h = data.handover;
  const custody = h
    ? h.status === "signed"
      ? section("Cash custody",
          line("Received by", h.receivedByName ?? "—") +
          line("Amount", money(h.receivedAmount ?? h.amount, sym), true) +
          line("Signed", fmtDateTime(h.signedAt, tz)))
      : `<div style="margin-top:22px;padding:14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;">` +
        `<strong style="color:#b91c1c;">${esc(money(h.amount, sym))} still held by ${esc(data.session.staffName)}</strong>` +
        `<div style="color:#7f1d1d;font-size:13px;margin-top:4px;">Awaiting a signature from an admin, manager or authorised cash receiver.</div></div>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:14px;padding:24px;">
      <div style="font-size:20px;font-weight:700;color:#111827;">${esc((opts.businessName || "NEXXUS").replace(/\s*\r?\n\s*/g, " "))}</div>
      <div style="font-size:15px;font-weight:600;color:#0f766e;margin-top:2px;">End of Day Report</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">
        ${esc(data.session.staffName)} · Shift #${data.session.id}<br/>
        ${esc(fmtDateTime(data.session.openedAt, tz))} → ${esc(data.session.closedAt ? fmtDateTime(data.session.closedAt, tz) : "still open")}
      </div>
      ${collections ? section("Collections", collections) : ""}
      ${section("Cash reconciliation", reconciliation)}
      ${count}
      ${payouts}
      ${jobs}
      ${orders}
      ${data.session.closingNotes ? `<h3 style="margin:22px 0 6px;font-size:13px;text-transform:uppercase;color:#0f766e;">Notes</h3><div style="font-size:14px;color:#374151;">${esc(data.session.closingNotes)}</div>` : ""}
      ${custody}
      <div style="margin-top:24px;font-size:12px;color:#9ca3af;">The full report is attached as a PDF.</div>
    </div>
  </div></body></html>`;
}
