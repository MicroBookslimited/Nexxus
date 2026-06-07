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

  const customerBlock = customer
    ? `
      <div class="party">
        <div class="party-label">Prepared For</div>
        <div class="party-name">${escapeHtml(customer.name)}</div>
        ${customer.phone ? `<div class="party-line">${escapeHtml(customer.phone)}</div>` : ""}
        ${customer.email ? `<div class="party-line">${escapeHtml(customer.email)}</div>` : ""}
        ${customer.address ? `<div class="party-line">${escapeHtml(customer.address)}</div>` : ""}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Quotation ${escapeHtml(quote.quoteNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a2332;
    margin: 0;
    padding: 32px 40px;
    font-size: 13px;
    line-height: 1.5;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0B1E2D; padding-bottom: 16px; }
  .biz { display: flex; align-items: center; gap: 14px; }
  .biz img { max-height: 64px; max-width: 180px; object-fit: contain; }
  .biz-name { font-size: 20px; font-weight: 800; color: #0B1E2D; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #0B1E2D; font-weight: 800; }
  .doc-meta { margin-top: 6px; font-size: 12px; color: #5a6b80; }
  .doc-meta b { color: #1a2332; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8a97a8; font-weight: 700; }
  .party-name { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .party-line { font-size: 12px; color: #5a6b80; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { background: #0B1E2D; color: #fff; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  thead th.num { text-align: right; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #e6eaf0; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.desc { font-weight: 500; }
  .totals { margin-top: 18px; margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
  .totals .row.grand { border-top: 2px solid #0B1E2D; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 800; color: #0B1E2D; }
  .notes { margin-top: 28px; padding: 14px 16px; background: #f5f7fa; border-radius: 8px; }
  .notes-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8a97a8; font-weight: 700; margin-bottom: 4px; }
  .disclaimer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e6eaf0; font-size: 11px; color: #8a97a8; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
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
