import JsBarcode from "jsbarcode";
import { openReceiptWindow, type ReceiptSettings } from "@/lib/receipt";

/* ────────────────────────────────────────────────────────────────────────── */
/* Printable GIFT VOUCHER document.                                           */
/*                                                                            */
/* A gift voucher is prepaid store credit, NOT a tax receipt — issuing one is */
/* not a sale of goods, so no tax line is shown. The code is rendered both as */
/* human-readable text and a CODE128 barcode so it can be scanned at          */
/* redemption with the same scanner used on the POS.                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface VoucherDoc {
  code: string;
  originalValue: number;
  balance: number;
  status?: string | null;
  expiryDate?: string | Date | null;
  createdAt?: string | Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
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

/** Render the voucher code as a CODE128 barcode and return a PNG data URL.
 *  Returns "" on failure so the document still prints (text code remains). */
function barcodeDataUrl(code: string): string {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 70,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function buildVoucherHtml(v: VoucherDoc, settings: ReceiptSettings): string {
  const currency = settings.base_currency || "JMD";
  const businessName = settings.business_name || "NEXXUS POS";
  const logoUrl = settings.business_logo_url || "";
  const barcode = barcodeDataUrl(v.code);
  const partiallyRedeemed = v.balance < v.originalValue;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Gift Voucher ${escapeHtml(v.code)}</title>
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
  .sheet { width: 100%; max-width: 520px; margin: 0 auto; }
  .card {
    border: 2px solid #0B1E2D;
    border-radius: 16px;
    overflow: hidden;
  }
  .card-head {
    background: #0B1E2D;
    color: #fff;
    padding: 18px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .biz { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .biz img { max-height: 44px; max-width: 130px; object-fit: contain; }
  .biz-name { font-size: 16px; font-weight: 800; }
  .kind { text-align: right; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85; }
  .card-body { padding: 22px; text-align: center; }
  .title { font-size: 26px; font-weight: 800; letter-spacing: 3px; color: #0B1E2D; margin: 0 0 4px; }
  .value { font-size: 44px; font-weight: 800; color: #0B1E2D; margin: 8px 0 2px; }
  .value-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #8a97a8; font-weight: 700; }
  .balance { margin-top: 10px; font-size: 13px; color: #1a2332; }
  .balance b { color: #0B1E2D; }
  .code-box { margin: 18px auto 6px; }
  .code-box img { max-width: 100%; height: auto; }
  .code-text { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 3px; margin-top: 6px; }
  .meta { margin-top: 16px; font-size: 12px; color: #5a6b80; }
  .meta div { margin: 2px 0; }
  .meta b { color: #1a2332; }
  .notes { margin-top: 14px; padding: 10px 12px; background: #f5f7fa; border-radius: 8px; text-align: left; font-size: 12px; }
  .notes-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8a97a8; font-weight: 700; margin-bottom: 3px; }
  .disclaimer { margin-top: 18px; font-size: 10px; color: #8a97a8; text-align: center; line-height: 1.4; }

  @page { size: auto; margin: 12mm; }
  @media print { body { padding: 0; } }

  @media print and (max-width: 100mm) {
    @page { size: auto; margin: 3mm; }
    body { padding: 0; }
    .sheet { max-width: none; }
    .card { border: 1.5px solid #000; border-radius: 8px; }
    .card-head { display: block; text-align: center; background: transparent; color: #000; border-bottom: 1.5px solid #000; padding: 8px; }
    .biz { display: block; }
    .biz img { display: block; margin: 0 auto 4px; max-height: 40px; }
    .kind { text-align: center; margin-top: 2px; }
    .card-body { padding: 10px; }
    .title { font-size: 18px; }
    .value { font-size: 30px; }
    .code-text { font-size: 15px; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="card">
      <div class="card-head">
        <div class="biz">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" />` : ""}
          <div class="biz-name">${escapeHtml(businessName)}</div>
        </div>
        <div class="kind">Gift Voucher</div>
      </div>
      <div class="card-body">
        <h1 class="title">GIFT VOUCHER</h1>
        <div class="value-label">Value</div>
        <div class="value">${money(v.originalValue, currency)}</div>
        ${
          partiallyRedeemed
            ? `<div class="balance">Remaining balance: <b>${money(v.balance, currency)}</b></div>`
            : ""
        }
        <div class="code-box">
          ${barcode ? `<img src="${barcode}" alt="${escapeHtml(v.code)}" />` : ""}
          <div class="code-text">${escapeHtml(v.code)}</div>
        </div>
        <div class="meta">
          <div>Issued: <b>${fmtDate(v.createdAt ?? new Date())}</b></div>
          <div>Expires: <b>${v.expiryDate ? fmtDate(v.expiryDate) : "No expiry"}</b></div>
          ${v.customerName ? `<div>For: <b>${escapeHtml(v.customerName)}</b></div>` : ""}
        </div>
        ${
          v.notes
            ? `<div class="notes"><div class="notes-label">Notes</div><div>${escapeHtml(
                v.notes,
              ).replace(/\n/g, "<br/>")}</div></div>`
            : ""
        }
        <div class="disclaimer">
          Present this voucher to redeem its value against a purchase. Treat it like cash — it cannot be replaced if lost or stolen.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Build and print a gift voucher via the standard browser print path. */
export function printVoucher(v: VoucherDoc, settings: ReceiptSettings): void {
  openReceiptWindow(buildVoucherHtml(v, settings));
}
