export interface ReceiptSettings {
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_logo_url?: string;
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
  unitPrice?: number;
  // Original (pre-tier) unit price; when present and > unitPrice we treat the
  // diff as volume-pricing savings and surface a "You saved" line on the
  // receipt total.
  originalUnitPrice?: number | null;
  variantChoices?: Array<{ optionName: string }> | null;
  modifierChoices?: Array<{ optionName: string }> | null;
}

/**
 * Sum of (originalUnitPrice - unitPrice) * quantity across items where the
 * order benefitted from volume/tier pricing. Returns 0 when no items have
 * tier discounts (older orders without originalUnitPrice persisted, or
 * orders that didn't qualify for any tier).
 *
 * Notes:
 * - Variant/modifier price adjustments are baked into neither field — both
 *   are unit-price level so they don't double-count toward savings.
 * - Decimal quantities (sold-by-weight) work since we just multiply.
 */
export function totalTierSavings(items: ReceiptOrderItem[]): number {
  let savings = 0;
  for (const item of items) {
    const orig = item.originalUnitPrice;
    const unit = item.unitPrice;
    if (orig != null && unit != null && orig > unit) {
      savings += (orig - unit) * item.quantity;
    }
  }
  return Math.round(savings * 100) / 100;
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
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** Customer's current loyalty-points balance (after this sale's earn/redeem). */
  customerLoyaltyBalance?: number | null;
  /** Customer's outstanding accounts-receivable balance across all open credit sales. */
  customerOutstandingBalance?: number | null;
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
  const businessLogoUrl   = settings.business_logo_url  || "";
  const businessName      = settings.business_name      || "NEXXUS POS";
  const businessAddress   = settings.business_address   || "";
  const businessPhone     = settings.business_phone     || "";
  const receiptFooter     = settings.receipt_footer     || "Thank you for your business!";
  const receiptSize       = settings.receipt_size       || "80mm";
  const template          = settings.receipt_template   || "classic";

  const is58mm        = receiptSize === "58mm";
  const baseFontSize  = is58mm ? "12px" : "12px";
  const subFontSize   = is58mm ? "10px" : "10px";
  const bodyPadding   = is58mm ? "4px 6px 14px" : "6px 8px 16px";

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
  const tierSavings   = totalTierSavings(order.items);
  const savingsHtml   = tierSavings > 0
    ? `<div class="row sub-row savings"><span>You saved (volume pricing):</span><span class="nowrap">-${fmtNum(tierSavings)}</span></div>` : "";
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
      bizSize: is58mm ? "16px" : "17px",
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

  const logoHtml = businessLogoUrl
    ? `<div style="text-align:${tpl.headerAlign};margin-bottom:4px;"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:60px;max-width:160px;object-fit:contain;" /></div>`
    : "";

  const headerHtml = `
    ${logoHtml}
    <div class="biz-name" style="text-align:${tpl.headerAlign};">${escHtml(businessName)}</div>
    <div class="info-block" style="${infoAlign}">
      <div>Order #: ${escHtml(orderNum)}</div>
      <div>${orderTypeLabel}</div>
      ${order.guestCount ? `<div>${order.guestCount} Guest${order.guestCount !== 1 ? "s" : ""}</div>` : ""}
      ${order.staffName ? `<div>Cashier: ${escHtml(order.staffName)}</div>` : ""}
      <div>${dateStr}</div>
    </div>`;

  // ── Customer block ────────────────────────────────────────────────────────
  // Rendered when a customer was attached to the sale. Shows contact details,
  // current loyalty balance, and any outstanding AR balance so the customer
  // sees what they owe across all open credit sales (not just this one).
  let customerBlockHtml = "";
  if (order.customerName) {
    const lines: string[] = [];
    lines.push(`<div style="font-weight:700;">Customer: ${escHtml(order.customerName)}</div>`);
    if (order.customerPhone) {
      lines.push(`<div class="sub-text">Tel: ${escHtml(order.customerPhone)}</div>`);
    }
    if (order.customerEmail) {
      lines.push(`<div class="sub-text">${escHtml(order.customerEmail)}</div>`);
    }
    if (order.customerLoyaltyBalance != null) {
      lines.push(`<div class="sub-text">Loyalty Balance: ${order.customerLoyaltyBalance} pts</div>`);
    }
    if (order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0) {
      lines.push(`<div class="sub-text" style="font-weight:700;color:#c00;">Account Balance Due: ${fmt(order.customerOutstandingBalance)}</div>`);
    }
    customerBlockHtml = `
    ${dividerHtml}
    <div class="info-block" style="${infoAlign}">
      ${lines.join("\n      ")}
    </div>`;
  }

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
    .info-block { font-size: ${baseFontSize}; line-height: 1.5; margin-bottom: 2px; }
    .sub-text { font-size: ${subFontSize}; color: #333; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin: 1px 0; }
    .item-row { margin: 2px 0; font-weight: 700; }
    .item-name { flex: 1; }
    .sub-row { font-size: ${subFontSize}; }
    .nowrap { white-space: nowrap; }
    .mod-line { padding-left: 10px; font-size: ${subFontSize}; color: #444; }
    .divider-dashed { border-top: 1px dashed #555; margin: 4px 0; }
    .divider-solid  { border-top: 2px solid #000; margin: 4px 0; }
    .divider-thin   { border-top: 1px solid #666; margin: 4px 0; }
    .total-row { display: flex; justify-content: space-between; font-weight: 900; margin: 2px 0; font-size: ${is58mm ? "13px" : "13px"}; }
    .amount-due-row { display: flex; justify-content: space-between; align-items: baseline; font-size: ${is58mm ? "14px" : "15px"}; font-weight: 900; margin: 4px 0 2px; }
    .amount-due-row span { white-space: nowrap; }
    .discount { color: #c00; }
    .savings { color: #0a7a0a; font-weight: 700; }
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

  ${customerBlockHtml}

  ${dividerHtml}

  ${itemsHtml}

  ${dividerHtml}

  <div class="row sub-row"><span>Subtotal:</span><span class="nowrap">${fmtNum(order.subtotal)}</span></div>
  ${discountHtml}
  ${savingsHtml}
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

  // Customer block — only when a customer was attached to the sale.
  if (order.customerName) {
    lines.push(`─────────────────────`);
    lines.push(`👤 *${order.customerName}*`);
    if (order.customerPhone) lines.push(`📞 ${order.customerPhone}`);
    if (order.customerEmail) lines.push(`✉️ ${order.customerEmail}`);
    if (order.customerLoyaltyBalance != null) {
      lines.push(`★ Loyalty Balance: ${order.customerLoyaltyBalance} pts`);
    }
    if (order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0) {
      lines.push(`*⚠ Account Balance Due: ${fmt(order.customerOutstandingBalance)}*`);
    }
  }

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
  const tierSavings = totalTierSavings(order.items);
  if (tierSavings > 0) {
    lines.push(`💰 You saved: -${fmtNum(tierSavings)} (volume pricing)`);
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
  // Use a hidden iframe instead of window.open. Popups are blocked by
  // default on mobile Chrome (Android) and by many desktop pop-up blockers,
  // which silently drops the print preview. A same-origin iframe always
  // renders, lets us call print() from the iframe's own context, and works
  // identically on desktop and Android.
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );

  const printScript = `<script>(function(){` +
    `function go(){try{window.focus();window.print();}catch(e){}}` +
    `if(document.readyState==='complete'){setTimeout(go,50);}` +
    `else{window.addEventListener('load',function(){setTimeout(go,50);});}` +
    `})();<\/script>`;
  const printableHtml = html.includes("</body>")
    ? html.replace("</body>", `${printScript}</body>`)
    : html + printScript;

  // Remove any leftover print iframe before adding a new one.
  const prev = document.getElementById("nexus-print-frame");
  if (prev) prev.parentNode?.removeChild(prev);

  const iframe = document.createElement("iframe");
  iframe.id = "nexus-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  // Position off-screen but keep it in the layout so Chrome on Android
  // actually paints it before printing. display:none breaks print on some
  // mobile browsers.
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.parentNode?.removeChild(iframe);
    }, 1000);
  };

  iframe.addEventListener("load", () => {
    try {
      const cw = iframe.contentWindow;
      if (cw) {
        cw.focus();
        // The embedded printScript will fire window.print() inside the
        // iframe's own context, which is the only reliable way on Android
        // Chrome. Also try from here as a desktop fallback.
        setTimeout(() => {
          try {
            cw.print();
          } catch {
            /* iframe script will handle */
          }
          cleanup();
        }, 100);
      } else {
        cleanup();
      }
    } catch {
      cleanup();
    }
  });

  // srcdoc renders synchronously and is supported on Android 5+ Chrome.
  iframe.srcdoc = printableHtml;

  // Mobile Chrome (especially Android 8) can ignore srcdoc-triggered print
  // when the page is not user-interaction driven. As a safety net, after a
  // short delay check whether the print dialog actually opened. If not, fall
  // back to a same-tab data URL the user can print manually from the browser
  // menu.
  if (isMobile) {
    setTimeout(() => {
      // If iframe was already cleaned up the print likely succeeded.
      if (!document.getElementById("nexus-print-frame")) return;
      // Otherwise open the receipt in the same tab so the user can use
      // Chrome's "Share → Print" menu.
      try {
        const blob = new Blob([printableHtml], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } catch {
        /* ignore */
      }
    }, 2500);
  }
}
