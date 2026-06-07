import { openReceiptWindow, type ReceiptSettings } from "@/lib/receipt";

/* ────────────────────────────────────────────────────────────────────────── */
/* Printable QUOTATION document.                                              */
/*                                                                            */
/* A quotation is NOT an invoice or tax receipt — it carries no payment       */
/* information and is explicitly labelled as non-binding. It is printed on a  */
/* normal A4/Letter page (browser print), not the thermal receipt path.       */
/* ────────────────────────────────────────────────────────────────────────── */

export interface QuotationDocItem {
  productName: string;
  price: number;
  quantity: number;
  unitLabel?: string;
  unitFactor?: number;
}

export interface QuotationDoc {
  quoteNumber: string;
  items: QuotationDocItem[];
  subtotal: number;
  discountAmount?: number | null;
  tax: number;
  total: number;
  notes?: string | null;
  expiryDate?: string | Date | null;
  createdAt?: string | Date | null;
  /* Customer details embedded by the server (preferred over the optional
   * `customer` arg, so the name always prints even when the client's customer
   * list is stale, or the customer was created inline or later archived). */
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
}

export interface QuotationCustomer {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

function money(val: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(val);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
  }
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildQuotationHtml(
  quote: QuotationDoc,
  settings: ReceiptSettings,
  customer?: QuotationCustomer | null,
): string {
  const currency = settings.base_currency || "JMD";
  const businessName = settings.business_name || "NEXXUS POS";
  const logoUrl = settings.business_logo_url || "";
  const taxRate = parseFloat(settings.tax_rate || "15");

  const rows = quote.items
    .map((it) => {
      const qtyDisplay =
        it.unitLabel && it.unitFactor && it.unitFactor > 0
          ? `${(it.quantity / it.unitFactor).toLocaleString("en-US", {
              maximumFractionDigits: 2,
            })} ${escapeHtml(it.unitLabel)}`
          : it.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 });
      const lineTotal = it.price * it.quantity;
      return `
        <tr>
          <td class="desc">${escapeHtml(it.productName)}</td>
          <td class="num">${qtyDisplay}</td>
          <td class="num">${money(it.price, currency)}</td>
          <td class="num">${money(lineTotal, currency)}</td>
        </tr>`;
    })
    .join("");

  const discount = quote.discountAmount && quote.discountAmount > 0 ? quote.discountAmount : 0;

  // Prefer the customer details the server embedded on the quote; fall back to
  // the optional arg (e.g. a freshly selected customer not yet persisted).
  const resolvedCustomer: QuotationCustomer | null = quote.customerName
    ? {
        name: quote.customerName,
        phone: quote.customerPhone,
        email: quote.customerEmail,
        address: quote.customerAddress,
      }
    : (customer ?? null);

  const customerBlock = resolvedCustomer
    ? `
      <div class="party">
        <div class="party-label">Prepared For</div>
        <div class="party-name">${escapeHtml(resolvedCustomer.name)}</div>
        ${resolvedCustomer.phone ? `<div class="party-line">${escapeHtml(resolvedCustomer.phone)}</div>` : ""}
        ${resolvedCustomer.email ? `<div class="party-line">${escapeHtml(resolvedCustomer.email)}</div>` : ""}
        ${resolvedCustomer.address ? `<div class="party-line">${escapeHtml(resolvedCustomer.address)}</div>` : ""}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Quotation ${escapeHtml(quote.quoteNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a2332;
    padding: 32px 40px;
    font-size: 13px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Centered, fluid document body so it scales cleanly from a wide Letter/A4
     page down to a narrow thermal roll. Widths are relative, never fixed px. */
  .sheet { width: 100%; max-width: 760px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid #0B1E2D; padding-bottom: 16px; }
  .biz { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .biz img { max-height: 64px; max-width: 180px; object-fit: contain; }
  .biz-name { font-size: 20px; font-weight: 800; color: #0B1E2D; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #0B1E2D; font-weight: 800; }
  .doc-meta { margin-top: 6px; font-size: 12px; color: #5a6b80; }
  .doc-meta b { color: #1a2332; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
  .parties:empty { margin: 0; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8a97a8; font-weight: 700; }
  .party-name { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .party-line { font-size: 12px; color: #5a6b80; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
  thead th { background: #0B1E2D; color: #fff; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  thead th.num { text-align: right; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #e6eaf0; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tbody td.desc { font-weight: 500; word-break: break-word; }
  .totals { margin-top: 18px; margin-left: auto; width: 280px; max-width: 100%; }
  .totals .row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 13px; }
  .totals .row.grand { border-top: 2px solid #0B1E2D; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 800; color: #0B1E2D; }
  .notes { margin-top: 28px; padding: 14px 16px; background: #f5f7fa; border-radius: 8px; }
  .notes-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8a97a8; font-weight: 700; margin-bottom: 4px; }
  .disclaimer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e6eaf0; font-size: 11px; color: #8a97a8; text-align: center; }

  /* Default page: Letter/A4 with comfortable margins. */
  @page { size: auto; margin: 14mm; }
  @media print { body { padding: 0; } }

  /* ── Thermal / narrow-roll printers (≈58–80mm) ──
     In print, the @page box is the viewport, so this width query fires only
     when the chosen paper is a narrow roll. Collapse to a single compact
     column and drop ink-heavy dark fills (thermal heads are monochrome and
     many drivers strip background colors, which would hide white-on-dark text). */
  @media print and (max-width: 100mm) {
    @page { size: auto; margin: 3mm; }
    body { padding: 0; font-size: 11px; line-height: 1.35; }
    .sheet { max-width: none; }
    .head { display: block; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .biz { display: block; }
    .biz img { display: block; margin: 0 auto 4px; max-height: 48px; }
    .biz-name { font-size: 15px; }
    .doc-title { text-align: center; margin-top: 6px; }
    .doc-title h1 { font-size: 18px; letter-spacing: 2px; }
    .doc-meta { font-size: 10px; }
    .parties { display: block; margin: 10px 0; }
    .party-name { font-size: 13px; }
    table { margin-top: 6px; }
    thead th { background: transparent; color: #000; border-bottom: 1.5px solid #000; padding: 4px 2px; font-size: 9px; letter-spacing: 0; }
    tbody td { padding: 4px 2px; font-size: 10px; }
    .totals { width: 100%; margin-top: 10px; }
    .totals .row { font-size: 11px; }
    .totals .row.grand { border-top: 1.5px solid #000; font-size: 14px; }
    .notes { margin-top: 12px; padding: 8px; background: transparent; border: 1px solid #000; border-radius: 4px; }
    .disclaimer { margin-top: 12px; font-size: 9px; }
  }
</style>
</head>
<body>
  <div class="sheet">
  <div class="head">
    <div class="biz">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" />` : ""}
      <div class="biz-name">${escapeHtml(businessName)}</div>
    </div>
    <div class="doc-title">
      <h1>QUOTATION</h1>
      <div class="doc-meta"><b>${escapeHtml(quote.quoteNumber)}</b></div>
      <div class="doc-meta">Date: ${fmtDate(quote.createdAt ?? new Date())}</div>
      <div class="doc-meta">Valid Until: <b>${fmtDate(quote.expiryDate)}</b></div>
    </div>
  </div>

  <div class="parties">
    ${customerBlock}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(quote.subtotal, currency)}</span></div>
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>- ${money(discount, currency)}</span></div>` : ""}
    <div class="row"><span>Tax (${taxRate}%)</span><span>${money(quote.tax, currency)}</span></div>
    <div class="row grand"><span>Total</span><span>${money(quote.total, currency)}</span></div>
  </div>

  ${
    quote.notes
      ? `<div class="notes"><div class="notes-label">Notes / Terms</div><div>${escapeHtml(
          quote.notes,
        ).replace(/\n/g, "<br/>")}</div></div>`
      : ""
  }

  <div class="disclaimer">
    This is a quotation, not an invoice or tax receipt. Prices are valid until the date shown above and are subject to stock availability at the time of purchase.
  </div>
  </div>
</body>
</html>`;
}

/** Build and print a quotation via the standard (desktop) browser print path. */
export function printQuotation(
  quote: QuotationDoc,
  settings: ReceiptSettings,
  customer?: QuotationCustomer | null,
): void {
  openReceiptWindow(buildQuotationHtml(quote, settings, customer));
}
