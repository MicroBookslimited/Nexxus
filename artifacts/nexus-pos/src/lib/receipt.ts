export interface ReceiptSettings {
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  receipt_footer?: string;
  tax_rate?: string;
  base_currency?: string;
  secondary_currency?: string;
  currency_rate?: string;
  receipt_size?: string;       // "58mm" | "80mm"
  receipt_template?: string;   // "classic" | "modern" | "minimal" | "bold"
}

export interface ReceiptOrderItem {
  quantity: number;
  productName: string;
  lineTotal: number;
  variantChoices?: Array<{ optionName: string }> | null;
  modifierChoices?: Array<{ optionName: string }> | null;
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: string | Date;
  items: ReceiptOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  discountValue?: number | null;
  paymentMethod?: string | null;
  splitCardAmount?: number | null;
  splitCashAmount?: number | null;
  cashTendered?: number | null;
  notes?: string | null;
  status?: string;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReceiptHtml(order: ReceiptOrder, settings: ReceiptSettings = {}): string {
  const baseCurrency    = settings.base_currency    || "JMD";
  const secondaryCurrency = settings.secondary_currency || "";
  const exchangeRate    = parseFloat(settings.currency_rate || "0");
  const taxRate         = settings.tax_rate         || "15";
  const businessName    = settings.business_name    || "NEXXUS POS";
  const businessAddress = settings.business_address || "";
  const businessPhone   = settings.business_phone   || "";
  const receiptFooter   = settings.receipt_footer   || "Thank you for your business!";
  const receiptSize     = settings.receipt_size     || "80mm";
  const template        = settings.receipt_template || "classic";

  const is58mm = receiptSize === "58mm";
  const baseFontSize  = is58mm ? "10px" : "11px";
  const subFontSize   = is58mm ? "9px"  : "10px";
  const bizFontSize   = is58mm ? "14px" : "16px";
  const totalFontSize = is58mm ? "13px" : "14px";
  const bodyPadding   = is58mm ? "6px 7px 12px" : "8px 10px 14px";

  const fmt = (n: number, cur = baseCurrency) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n));
    } catch {
      return `${cur} ${Math.abs(n).toFixed(2)}`;
    }
  };

  const createdAt = typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const dateStr   = createdAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  // Last 3 digits of order number (bold, prominent)
  const orderNum  = String(order.orderNumber);
  const lastThree = orderNum.slice(-3);
  const prefix    = orderNum.length > 3 ? orderNum.slice(0, -3) : "";

  const itemsHtml = order.items.map(item => {
    let html = `<div class="row"><span class="item-name">${item.quantity}&times; ${escHtml(item.productName)}</span><span class="nowrap">${fmt(item.lineTotal)}</span></div>`;
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="indent small">&nbsp;&#8627; ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="indent small">&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    return html;
  }).join("");

  let paymentHtml = "";
  if (order.paymentMethod === "split") {
    paymentHtml = `
      <div class="row"><span>Payment</span><span class="nowrap">SPLIT</span></div>
      <div class="row"><span>&nbsp;&nbsp;Card</span><span class="nowrap">${fmt(order.splitCardAmount ?? 0)}</span></div>
      <div class="row"><span>&nbsp;&nbsp;Cash</span><span class="nowrap">${fmt(order.splitCashAmount ?? 0)}</span></div>`;
  } else {
    paymentHtml = `<div class="row"><span>Payment</span><span class="nowrap">${escHtml((order.paymentMethod ?? "—").toUpperCase())}</span></div>`;
    if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
      paymentHtml += `
        <div class="row"><span>Tendered</span><span class="nowrap">${fmt(order.cashTendered)}</span></div>
        <div class="row"><span>Change</span><span class="nowrap">${fmt(Math.max(0, order.cashTendered - order.total))}</span></div>`;
    }
  }

  const refundedHtml   = order.status === "refunded"
    ? `<div class="refunded">&#9733; REFUNDED &#9733;</div>` : "";
  const discountHtml   = (order.discountValue ?? 0) > 0
    ? `<div class="row"><span>Discount</span><span class="nowrap discount">-${fmt(order.discountValue ?? 0)}</span></div>` : "";
  const secondaryHtml  = secondaryCurrency && exchangeRate > 0
    ? `<div class="row sub"><span>&nbsp;&nbsp;&asymp;&nbsp;${secondaryCurrency}</span><span class="nowrap">${fmt(order.total * exchangeRate, secondaryCurrency)}</span></div>` : "";
  const notesHtml      = order.notes
    ? `<div class="dashed"></div><div class="note">Note: ${escHtml(order.notes)}</div>` : "";
  const addressHtml    = businessAddress
    ? `<div class="center sub">${escHtml(businessAddress)}</div>` : "";
  const phoneHtml      = businessPhone
    ? `<div class="center sub">Tel: ${escHtml(businessPhone)}</div>` : "";

  // ── Template-specific styles ──────────────────────────────────────────────
  let templateStyles = "";
  let dividerTop     = `<div class="dashed"></div>`;
  let dividerMid     = `<div class="dashed"></div>`;
  let dividerSolid   = `<div class="solid"></div>`;
  let orderNumHtml   = "";

  if (template === "classic") {
    templateStyles = `
      .biz-name { font-size: ${bizFontSize}; font-weight: 900; letter-spacing: 0.5px; text-align: center; margin-bottom: 2px; }
      .order-badge { text-align: center; margin: 4px 0 2px; font-size: 11px; letter-spacing: 0.5px; }
      .order-badge .last3 { font-size: 18px; font-weight: 900; letter-spacing: 2px; }
    `;
    orderNumHtml = `
      ${dividerTop}
      <div class="order-badge">Order <span class="last3">#${escHtml(lastThree)}</span></div>
      <div class="row"><span>Date</span><span class="nowrap">${dateStr}</span></div>
      <div class="dashed"></div>`;
  } else if (template === "modern") {
    templateStyles = `
      .biz-name { font-size: ${bizFontSize}; font-weight: 900; letter-spacing: 1px; text-align: center; text-transform: uppercase; margin-bottom: 2px; border-bottom: 2px solid #000; padding-bottom: 5px; }
      .order-badge { background: #000; color: #fff; text-align: center; padding: 5px 0 3px; margin: 6px 0 4px; }
      .order-badge .prefix { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; display: block; }
      .order-badge .last3 { font-size: 22px; font-weight: 900; letter-spacing: 4px; display: block; }
      .order-badge .date { font-size: 9px; color: #ccc; display: block; }
    `;
    dividerTop     = "";
    dividerMid     = `<div class="dashed"></div>`;
    dividerSolid   = `<div class="solid"></div>`;
    orderNumHtml   = `
      <div class="order-badge">
        <span class="prefix">Order Number</span>
        <span class="last3">${escHtml(prefix ? prefix.replace(/\D/g,"") : "")}#<b>${escHtml(lastThree)}</b></span>
        <span class="date">${dateStr}</span>
      </div>
      ${dividerMid}`;
  } else if (template === "minimal") {
    templateStyles = `
      .biz-name { font-size: ${bizFontSize}; font-weight: 700; text-align: left; margin-bottom: 1px; letter-spacing: 0; }
      .order-badge { display: flex; justify-content: space-between; align-items: baseline; margin: 5px 0 3px; border-top: 1px solid #aaa; border-bottom: 1px solid #aaa; padding: 3px 0; }
      .order-badge .left { font-size: 10px; color: #555; }
      .order-badge .last3 { font-size: 17px; font-weight: 900; }
    `;
    dividerTop     = `<div style="border-top:1px solid #aaa;margin:4px 0;"></div>`;
    dividerMid     = `<div style="border-top:1px solid #aaa;margin:4px 0;"></div>`;
    dividerSolid   = `<div style="border-top:2px solid #000;margin:4px 0;"></div>`;
    orderNumHtml   = `
      <div class="order-badge">
        <span class="left">${dateStr}</span>
        <span class="last3">#${escHtml(lastThree)}</span>
      </div>`;
  } else if (template === "bold") {
    templateStyles = `
      .biz-name { font-size: ${is58mm ? "15px" : "18px"}; font-weight: 900; letter-spacing: 1px; text-align: center; text-transform: uppercase; margin-bottom: 2px; }
      .order-badge { text-align: center; margin: 6px 0 4px; }
      .order-badge .label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #555; display: block; margin-bottom: 2px; }
      .order-badge .last3 { font-size: 28px; font-weight: 900; letter-spacing: 5px; display: block; line-height: 1.1; }
    `;
    orderNumHtml = `
      ${dividerTop}
      <div class="order-badge">
        <span class="label">Your Order</span>
        <span class="last3">#${escHtml(lastThree)}</span>
      </div>
      <div class="row center sub"><span>Full #:&nbsp;${escHtml(orderNum)}</span><span class="nowrap">${dateStr}</span></div>
      <div class="dashed"></div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt &ndash; ${escHtml(order.orderNumber)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: ${receiptSize} auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { padding: ${bodyPadding}; font-family: 'Courier New', Courier, monospace; font-size: ${baseFontSize}; line-height: 1.6; color: #000; }
    .center { text-align: center; }
    .sub { font-size: ${subFontSize}; color: #555; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin: 1px 0; }
    .row .item-name { flex: 1; }
    .nowrap { white-space: nowrap; }
    .indent { padding-left: 14px; }
    .small { font-size: ${subFontSize}; color: #666; }
    .dashed { border-top: 1px dashed #888; margin: 5px 0; }
    .solid { border-top: 2px solid #000; margin: 5px 0; }
    .total-row { font-size: ${totalFontSize}; font-weight: 900; display: flex; justify-content: space-between; margin: 3px 0; }
    .discount { color: #c00; }
    .refunded { color: red; font-weight: bold; text-align: center; font-size: 12px; border: 1px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .note { font-size: ${subFontSize}; font-style: italic; margin: 2px 0; }
    .footer-msg { text-align: center; margin: 4px 0 2px; }
    .powered { text-align: center; font-size: 9px; color: #999; margin-top: 2px; }
    ${templateStyles}
  </style>
</head>
<body>
  <div class="biz-name">${escHtml(businessName)}</div>
  ${addressHtml}
  ${phoneHtml}
  ${orderNumHtml}
  ${itemsHtml}
  ${dividerMid}
  <div class="row"><span>Subtotal</span><span class="nowrap">${fmt(order.subtotal)}</span></div>
  ${discountHtml}
  <div class="row"><span>GCT (${taxRate}%)</span><span class="nowrap">${fmt(order.tax)}</span></div>
  ${dividerSolid}
  <div class="total-row"><span>TOTAL</span><span>${fmt(order.total)}</span></div>
  ${secondaryHtml}
  ${dividerSolid}
  ${paymentHtml}
  ${notesHtml}
  ${refundedHtml}
  <div class="dashed"></div>
  <div class="footer-msg">${escHtml(receiptFooter)}</div>
  <div class="powered">Powered by MicroBooks</div>
</body>
</html>`;
}

export function openReceiptWindow(html: string): void {
  const w = window.open("", "_blank", "width=420,height=760");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    w.print();
    w.onafterprint = () => w.close();
  };
}
