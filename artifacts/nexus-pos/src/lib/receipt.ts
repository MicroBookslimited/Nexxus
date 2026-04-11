export interface ReceiptSettings {
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  receipt_footer?: string;
  tax_rate?: string;
  tax_name?: string;
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
  orderType?: string | null;
  staffName?: string | null;
  guestCount?: number | null;
  customerName?: string | null;
  loyaltyPointsEarned?: number | null;
  loyaltyPointsRedeemed?: number | null;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReceiptHtml(order: ReceiptOrder, settings: ReceiptSettings = {}): string {
  const baseCurrency      = settings.base_currency      || "JMD";
  const secondaryCurrency = settings.secondary_currency || "";
  const exchangeRate      = parseFloat(settings.currency_rate || "0");
  const taxRate           = settings.tax_rate           || "15";
  const taxName           = settings.tax_name           || "GCT";
  const businessName      = settings.business_name      || "NEXXUS POS";
  const businessAddress   = settings.business_address   || "";
  const businessPhone     = settings.business_phone     || "";
  const receiptFooter     = settings.receipt_footer     || "Thank you for your business!";
  const receiptSize       = settings.receipt_size       || "80mm";
  const template          = settings.receipt_template   || "classic";

  const is58mm        = receiptSize === "58mm";
  const baseFontSize  = is58mm ? "10px" : "11px";
  const subFontSize   = is58mm ? "9px"  : "10px";
  const bodyPadding   = is58mm ? "6px 7px 16px" : "8px 10px 18px";

  // With currency prefix — only used on Total / Amount Due lines
  const fmt = (n: number, cur = baseCurrency) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n));
    } catch {
      return `${cur} ${Math.abs(n).toFixed(2)}`;
    }
  };
  // Plain number — used everywhere else (line items, subtotal, tax, etc.)
  const fmtNum = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const createdAt = typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const dateStr   = createdAt.toLocaleString("en-JM", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit",
    hour12: true,
  });

  // Last 3 digits of order number (the prominent pickup number)
  const orderNum  = String(order.orderNumber);
  const lastThree = orderNum.replace(/\D/g, "").slice(-3).padStart(3, "0");

  // ── Items ─────────────────────────────────────────────────────────────────
  const itemsHtml = order.items.map(item => {
    let html = `<div class="row item-row"><span class="item-name">${item.quantity}&times; ${escHtml(item.productName)}</span><span class="nowrap">${fmtNum(item.lineTotal)}</span></div>`;
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="mod-line">&nbsp;&#8627; ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="mod-line">&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    return html;
  }).join("");

  // ── Payment ───────────────────────────────────────────────────────────────
  let paymentHtml = "";
  if (order.paymentMethod === "split") {
    paymentHtml = `
      <div class="row sub-row"><span>Payment</span><span class="nowrap">SPLIT</span></div>
      <div class="row sub-row"><span>&nbsp;&nbsp;Card</span><span class="nowrap">${fmtNum(order.splitCardAmount ?? 0)}</span></div>
      <div class="row sub-row"><span>&nbsp;&nbsp;Cash</span><span class="nowrap">${fmtNum(order.splitCashAmount ?? 0)}</span></div>`;
  } else {
    paymentHtml = `<div class="row sub-row"><span>Payment</span><span class="nowrap">${escHtml((order.paymentMethod ?? "—").toUpperCase())}</span></div>`;
    if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
      paymentHtml += `
        <div class="row sub-row"><span>Tendered</span><span class="nowrap">${fmtNum(order.cashTendered)}</span></div>
        <div class="row sub-row"><span>Change</span><span class="nowrap">${fmtNum(Math.max(0, order.cashTendered - order.total))}</span></div>`;
    }
  }

  // ── Optional blocks ───────────────────────────────────────────────────────
  const refundedHtml  = order.status === "refunded"
    ? `<div class="refunded">&#9733; REFUNDED &#9733;</div>` : "";
  const discountHtml  = (order.discountValue ?? 0) > 0
    ? `<div class="row sub-row"><span>Discount</span><span class="nowrap discount">-${fmtNum(order.discountValue ?? 0)}</span></div>` : "";
  const secondaryHtml = secondaryCurrency && exchangeRate > 0
    ? `<div class="row sub-row"><span>&asymp;&nbsp;${secondaryCurrency}</span><span class="nowrap">${fmt(order.total * exchangeRate, secondaryCurrency)}</span></div>` : "";
  const notesHtml     = order.notes
    ? `<div class="note">Note: ${escHtml(order.notes)}</div>` : "";
  const paymentSection = paymentHtml ? `<div class="divider-solid"></div>${paymentHtml}` : "";

  // ── Template-specific variables ───────────────────────────────────────────
  // All templates share the same structural layout (header → items → totals →
  // address → footer → BIG number). Templates differ only in typography/style.

  type DividerStyle = "dashed" | "solid" | "thin";

  const templates: Record<string, {
    headerAlign: "left" | "center";
    bizWeight: string;
    bizSize: string;
    bizTransform: string;
    bizTracking: string;
    divider: DividerStyle;
    numberSize: string;
    numberTracking: string;
    numberWeight: string;
    numberLabel: string;
    numberExtraStyle: string;
    extraCss: string;
  }> = {
    classic: {
      headerAlign: "center",
      bizWeight: "900",
      bizSize: is58mm ? "15px" : "17px",
      bizTransform: "none",
      bizTracking: "0.5px",
      divider: "dashed",
      numberSize: is58mm ? "52px" : "64px",
      numberTracking: "6px",
      numberWeight: "900",
      numberLabel: "",
      numberExtraStyle: "",
      extraCss: "",
    },
    modern: {
      headerAlign: "center",
      bizWeight: "900",
      bizSize: is58mm ? "14px" : "16px",
      bizTransform: "uppercase",
      bizTracking: "2px",
      divider: "solid",
      numberSize: is58mm ? "56px" : "70px",
      numberTracking: "8px",
      numberWeight: "900",
      numberLabel: "ORDER NUMBER",
      numberExtraStyle: "background:#000;color:#fff;padding:10px 0 8px;margin-top:8px;",
      extraCss: `.biz-name { border-bottom: 2px solid #000; padding-bottom: 5px; }`,
    },
    minimal: {
      headerAlign: "left",
      bizWeight: "700",
      bizSize: is58mm ? "13px" : "15px",
      bizTransform: "none",
      bizTracking: "0",
      divider: "thin",
      numberSize: is58mm ? "48px" : "60px",
      numberTracking: "4px",
      numberWeight: "900",
      numberLabel: "",
      numberExtraStyle: "border-top:1px solid #aaa;padding-top:8px;margin-top:6px;",
      extraCss: ``,
    },
    bold: {
      headerAlign: "center",
      bizWeight: "900",
      bizSize: is58mm ? "16px" : "20px",
      bizTransform: "uppercase",
      bizTracking: "2px",
      divider: "dashed",
      numberSize: is58mm ? "64px" : "80px",
      numberTracking: "10px",
      numberWeight: "900",
      numberLabel: "YOUR ORDER",
      numberExtraStyle: "",
      extraCss: "",
    },
  };

  const tpl = templates[template] ?? templates.classic;

  const dividerHtml =
    tpl.divider === "solid" ? `<div class="divider-solid"></div>` :
    tpl.divider === "thin"  ? `<div class="divider-thin"></div>` :
                              `<div class="divider-dashed"></div>`;

  // ── Header info block (mirrors the sample receipt) ────────────────────────
  const infoAlign = tpl.headerAlign === "center" ? "text-align:center;" : "text-align:left;";
  const orderTypeLabel = order.orderType ? escHtml(order.orderType) : "Sale";

  const headerHtml = `
    <div class="biz-name" style="text-align:${tpl.headerAlign};">${escHtml(businessName)}</div>
    <div class="info-block" style="${infoAlign}">
      <div>Order #: ${escHtml(orderNum)}</div>
      <div>${orderTypeLabel}</div>
      ${order.guestCount ? `<div>${order.guestCount} Guest${order.guestCount !== 1 ? "s" : ""}</div>` : ""}
      ${order.staffName ? `<div>Cashier: ${escHtml(order.staffName)}</div>` : ""}
      <div>${dateStr}</div>
    </div>`;

  // ── Large number at the bottom ────────────────────────────────────────────
  const numberLabelHtml = tpl.numberLabel
    ? `<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${tpl.numberExtraStyle.includes("color:#fff") ? "#ccc" : "#888"};margin-bottom:4px;">${tpl.numberLabel}</div>`
    : "";
  const bigNumberHtml = `
    <div class="big-number" style="${tpl.numberExtraStyle}">
      ${numberLabelHtml}
      <div style="font-size:${tpl.numberSize};font-weight:${tpl.numberWeight};letter-spacing:${tpl.numberTracking};line-height:1;">${lastThree}</div>
    </div>`;

  // ── Address block ─────────────────────────────────────────────────────────
  const addressBlock = (businessAddress || businessPhone) ? `
    ${dividerHtml}
    ${businessAddress ? `<div class="center sub-text">${escHtml(businessAddress)}</div>` : ""}
    ${businessPhone   ? `<div class="center sub-text">Tel: ${escHtml(businessPhone)}</div>` : ""}` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt &ndash; ${escHtml(order.orderNumber)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: ${receiptSize} auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: ${bodyPadding};
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      line-height: 1.65;
      color: #000;
    }
    .center { text-align: center; }
    .biz-name {
      font-size: ${tpl.bizSize};
      font-weight: ${tpl.bizWeight};
      text-transform: ${tpl.bizTransform};
      letter-spacing: ${tpl.bizTracking};
      margin-bottom: 3px;
    }
    .info-block { font-size: ${baseFontSize}; line-height: 1.55; margin-bottom: 2px; }
    .sub-text { font-size: ${subFontSize}; color: #555; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin: 1px 0; }
    .item-row { margin: 2px 0; }
    .item-name { flex: 1; }
    .sub-row { font-size: ${subFontSize}; }
    .nowrap { white-space: nowrap; }
    .mod-line { padding-left: 12px; font-size: ${subFontSize}; color: #666; }
    .divider-dashed { border-top: 1px dashed #888; margin: 5px 0; }
    .divider-solid  { border-top: 2px solid #000; margin: 5px 0; }
    .divider-thin   { border-top: 1px solid #aaa; margin: 5px 0; }
    .total-row { display: flex; justify-content: space-between; font-weight: 900; margin: 2px 0; }
    .amount-due-row { display: flex; justify-content: space-between; font-size: ${is58mm ? "13px" : "14px"}; font-weight: 900; margin: 4px 0 2px; }
    .discount { color: #c00; }
    .refunded { color: red; font-weight: bold; text-align: center; font-size: 12px; border: 1px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .note { font-size: ${subFontSize}; font-style: italic; margin: 3px 0; }
    .footer-msg { text-align: center; margin: 6px 0 2px; }
    .powered { text-align: center; font-size: 8px; color: #aaa; margin: 2px 0 4px; letter-spacing: 1px; }
    .big-number { text-align: center; margin-top: 6px; }
    ${tpl.extraCss}
  </style>
</head>
<body>

  ${headerHtml}

  ${dividerHtml}

  ${itemsHtml}

  ${dividerHtml}

  <div class="row sub-row"><span>Subtotal:</span><span class="nowrap">${fmtNum(order.subtotal)}</span></div>
  ${discountHtml}
  <div class="row sub-row"><span>${taxName} (${taxRate}%):</span><span class="nowrap">${fmtNum(order.tax)}</span></div>
  <div class="total-row"><span>Total:</span><span>${fmt(order.total)}</span></div>
  ${secondaryHtml}

  ${dividerHtml}

  <div class="amount-due-row"><span>Amount Due:</span><span>${fmt(order.total)}</span></div>
  ${paymentSection}
  ${notesHtml}
  ${refundedHtml}

  ${(order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) ? `
  ${dividerHtml}
  <div style="text-align:center;font-weight:bold;font-size:${baseFontSize};">
    &#9733; LOYALTY POINTS &#9733;
    ${order.loyaltyPointsEarned ? `<div style="font-weight:bold;">+ ${order.loyaltyPointsEarned} pts earned</div>` : ""}
    ${order.loyaltyPointsRedeemed ? `<div style="font-weight:bold;">- ${order.loyaltyPointsRedeemed} pts redeemed</div>` : ""}
  </div>` : ""}

  ${addressBlock}

  ${dividerHtml}

  <div class="footer-msg">${escHtml(receiptFooter)}</div>
  <div class="powered">Powered by NEXXUS POS</div>

  ${dividerHtml}

  ${bigNumberHtml}

</body>
</html>`;
}

export function buildWhatsAppText(order: ReceiptOrder, settings: ReceiptSettings = {}): string {
  const businessName  = settings.business_name    || "NEXXUS POS";
  const baseCurrency  = settings.base_currency    || "JMD";
  const taxRate       = settings.tax_rate         || "15";
  const taxName       = settings.tax_name         || "GCT";
  const receiptFooter = settings.receipt_footer   || "Thank you for your business!";

  // With currency prefix — only on the Total line
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: baseCurrency }).format(Math.abs(n));
    } catch {
      return `${baseCurrency} ${Math.abs(n).toFixed(2)}`;
    }
  };
  // Plain number — used on every other line
  const fmtNum = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const createdAt = typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const dateStr   = createdAt.toLocaleString("en-JM", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit",
    hour12: true,
  });

  const orderNum  = String(order.orderNumber);
  const lastThree = orderNum.replace(/\D/g, "").slice(-3).padStart(3, "0");

  const lines: string[] = [];
  lines.push(`🧾 *${businessName}*`);
  lines.push(`Order #: ${orderNum}  |  Pickup: *${lastThree}*`);
  lines.push(`📅 ${dateStr}`);
  lines.push(`─────────────────────`);

  for (const item of order.items) {
    lines.push(`${item.quantity}× ${item.productName}  ${fmtNum(item.lineTotal)}`);
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      lines.push(`   ↳ ${v.optionName}`);
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      lines.push(`   + ${m.optionName}`);
    }
  }

  lines.push(`─────────────────────`);
  lines.push(`Subtotal:   ${fmtNum(order.subtotal)}`);
  if ((order.discountValue ?? 0) > 0) {
    lines.push(`Discount:  -${fmtNum(order.discountValue ?? 0)}`);
  }
  lines.push(`${taxName} (${taxRate}%): ${fmtNum(order.tax)}`);
  lines.push(`─────────────────────`);
  lines.push(`*Total:     ${fmt(order.total)}*`);
  lines.push(`─────────────────────`);

  if (order.paymentMethod === "split") {
    lines.push(`Payment:   SPLIT`);
    lines.push(`  Card:    ${fmtNum(order.splitCardAmount ?? 0)}`);
    lines.push(`  Cash:    ${fmtNum(order.splitCashAmount ?? 0)}`);
  } else {
    lines.push(`Payment:   ${(order.paymentMethod ?? "—").toUpperCase()}`);
    if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
      lines.push(`Tendered:  ${fmtNum(order.cashTendered)}`);
      lines.push(`Change:    ${fmtNum(Math.max(0, order.cashTendered - order.total))}`);
    }
  }

  if (order.notes) {
    lines.push(`─────────────────────`);
    lines.push(`📝 Note: ${order.notes}`);
  }

  if (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) {
    lines.push(`─────────────────────`);
    lines.push(`*★ LOYALTY POINTS ★*`);
    if (order.loyaltyPointsEarned) lines.push(`*+ ${order.loyaltyPointsEarned} pts earned*`);
    if (order.loyaltyPointsRedeemed) lines.push(`*- ${order.loyaltyPointsRedeemed} pts redeemed*`);
  }
  lines.push(`─────────────────────`);
  lines.push(`_${receiptFooter}_`);
  lines.push(`_Powered by NEXXUS POS_`);

  return lines.join("\n");
}

export function openWhatsAppReceipt(phone: string, order: ReceiptOrder, settings: ReceiptSettings = {}): void {
  const text = buildWhatsAppText(order, settings);
  const digits = phone.replace(/\D/g, "");
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
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
