import JsBarcode from "jsbarcode";
import { openReceiptWindow, type ReceiptSettings } from "@/lib/receipt";

/* ────────────────────────────────────────────────────────────────────────── */
/* Printable LOYALTY CARD document.                                           */
/*                                                                            */
/* A customer's loyalty card carries their unique card number both as human-  */
/* readable text and a CODE128 barcode, so it can be scanned at the POS with  */
/* the same scanner used for products. Sized for a wallet-style card on a     */
/* normal printer; the print dialog handles the actual paper size.            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CustomerCardDoc {
  name: string;
  cardNumber: string;
  loyaltyPoints?: number | null;
  memberSince?: string | Date | null;
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

/** Render the card number as a CODE128 barcode and return a PNG data URL.
 *  Returns "" on failure so the document still prints (text code remains). */
export function cardBarcodeDataUrl(code: string): string {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 60,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function buildCustomerCardHtml(card: CustomerCardDoc, settings: ReceiptSettings): string {
  const businessName = settings.business_name || "NEXXUS POS";
  const logoUrl = settings.business_logo_url || "";
  const barcode = cardBarcodeDataUrl(card.cardNumber);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Loyalty Card ${escapeHtml(card.cardNumber)}</title>
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
  .sheet { width: 100%; max-width: 380px; margin: 0 auto; }
  .card {
    border: 2px solid #0B1E2D;
    border-radius: 16px;
    overflow: hidden;
    background: linear-gradient(135deg, #0B1E2D 0%, #15324a 100%);
    color: #fff;
  }
  .card-head {
    padding: 16px 20px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .biz { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .biz img { max-height: 36px; max-width: 110px; object-fit: contain; }
  .biz-name { font-size: 15px; font-weight: 800; }
  .kind { text-align: right; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.8; }
  .card-body { padding: 6px 20px 18px; }
  .holder-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; font-weight: 700; }
  .holder { font-size: 20px; font-weight: 800; margin: 2px 0 12px; }
  .points { font-size: 12px; opacity: 0.9; margin-bottom: 14px; }
  .points b { font-size: 15px; }
  .code-box {
    background: #fff;
    border-radius: 10px;
    padding: 10px 12px 8px;
    text-align: center;
  }
  .code-box img { max-width: 100%; height: auto; }
  .code-text {
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 16px; font-weight: 700; letter-spacing: 3px; color: #0B1E2D; margin-top: 4px;
  }
  .meta { margin-top: 12px; font-size: 11px; opacity: 0.85; }
  .meta div { margin: 2px 0; }
  .disclaimer { margin-top: 14px; font-size: 9px; opacity: 0.7; text-align: center; line-height: 1.4; }

  @page { size: auto; margin: 12mm; }
  @media print { body { padding: 0; } }

  @media print and (max-width: 100mm) {
    @page { size: auto; margin: 3mm; }
    body { padding: 0; }
    .sheet { max-width: none; }
    .card { border: 1.5px solid #000; border-radius: 8px; background: #fff; color: #000; }
    .biz img { display: block; }
    .code-box { border: 1px solid #000; }
    .disclaimer { opacity: 1; }
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
        <div class="kind">Loyalty Card</div>
      </div>
      <div class="card-body">
        <div class="holder-label">Member</div>
        <div class="holder">${escapeHtml(card.name)}</div>
        ${
          typeof card.loyaltyPoints === "number"
            ? `<div class="points">Loyalty points: <b>${card.loyaltyPoints.toLocaleString("en-US")}</b></div>`
            : ""
        }
        <div class="code-box">
          ${barcode ? `<img src="${barcode}" alt="${escapeHtml(card.cardNumber)}" />` : ""}
          <div class="code-text">${escapeHtml(card.cardNumber)}</div>
        </div>
        <div class="meta">
          <div>Member since: ${fmtDate(card.memberSince ?? new Date())}</div>
        </div>
        <div class="disclaimer">
          Present or scan this card on every visit to earn and redeem loyalty points.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Build and print a customer loyalty card via the standard browser print path. */
export function printCustomerCard(card: CustomerCardDoc, settings: ReceiptSettings): void {
  openReceiptWindow(buildCustomerCardHtml(card, settings));
}
