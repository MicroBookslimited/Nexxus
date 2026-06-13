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
  receipt_template?: string;   // "classic" | "modern" | "minimal" | "bold" | "supermarket" | "convenience" | "staple" | "restaurant" | "hardware"
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
  // Optional product identifiers used by the supermarket template to render a
  // per-line "barcode" column. Both are optional so existing callers stay
  // type-compatible; when missing we derive a stable 12-digit code from the
  // product name + line index so the receipt still looks supermarket-ish.
  productId?: number | null;
  barcode?: string | null;
  // Optional free-text selling unit / UOM label (e.g. "each", "case",
  // "pieces"). When present, surfaced next to the line item on the receipt.
  sellingUnit?: string | null;
  // Optional free-text per-line note (e.g. "cut thin", "extra lean"). When
  // present, surfaced as a sub-line under the item on every receipt template.
  notes?: string | null;
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
  cardType?: string | null;
  splitCardAmount?: number | null;
  splitCashAmount?: number | null;
  cashTendered?: number | null;
  notes?: string | null;
  status?: string;
  orderType?: string | null;
  staffName?: string | null;
  /** Station / till number assigned to the cashier's shift; printed on receipts. */
  stationNumber?: number | null;
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
  /** Code of the gift voucher applied as a tender on this sale, if any. */
  giftVoucherCode?: string | null;
  /** Amount of the sale total paid by a gift voucher (a tender, not a discount). */
  giftVoucherAmount?: number | null;
}

/**
 * Shape of the customer block we splice onto receipts. Matches what
 * `GET /api/customers/:id/receipt-info` returns plus a few aliases for
 * convenience when the caller already has a partial customer object
 * (e.g. the in-memory `selectedCustomer` from the POS cart used during
 * offline sales when we can't reach the server to compute AR).
 */
export interface ReceiptCustomerLike {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  loyaltyPoints?: number | null;
  outstandingBalance?: number | null;
}

/**
 * Build a strictly-typed `ReceiptOrder` from any wider order shape
 * (e.g. an API `Order`, an offline receipt, or a kiosk-charge result)
 * and optionally splice in fetched customer info. Keeping this in one
 * place lets callers pass their native order types without `as any`
 * casts and guarantees the receipt builders only see fields they
 * actually understand.
 */
export function receiptOrderFrom(
  order: {
    orderNumber: string;
    createdAt: string | Date;
    items: ReceiptOrderItem[];
    subtotal: number;
    tax: number;
    total: number;
    discountValue?: number | null;
    paymentMethod?: string | null;
    cardType?: string | null;
    splitCardAmount?: number | null;
    splitCashAmount?: number | null;
    cashTendered?: number | null;
    notes?: string | null;
    status?: string;
    orderType?: string | null;
    staffName?: string | null;
    stationNumber?: number | null;
    guestCount?: number | null;
    customerName?: string | null;
    loyaltyPointsEarned?: number | null;
    loyaltyPointsRedeemed?: number | null;
    giftVoucherCode?: string | null;
    giftVoucherAmount?: number | null;
  },
  customer?: ReceiptCustomerLike | null,
): ReceiptOrder {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    discountValue: order.discountValue ?? null,
    paymentMethod: order.paymentMethod ?? null,
    cardType: order.cardType ?? null,
    splitCardAmount: order.splitCardAmount ?? null,
    splitCashAmount: order.splitCashAmount ?? null,
    cashTendered: order.cashTendered ?? null,
    notes: order.notes ?? null,
    status: order.status,
    orderType: order.orderType ?? null,
    staffName: order.staffName ?? null,
    stationNumber: order.stationNumber ?? null,
    guestCount: order.guestCount ?? null,
    customerName: customer?.name ?? order.customerName ?? null,
    customerPhone: customer?.phone ?? null,
    customerEmail: customer?.email ?? null,
    customerLoyaltyBalance: customer?.loyaltyPoints ?? null,
    customerOutstandingBalance: customer?.outstandingBalance ?? null,
    loyaltyPointsEarned: order.loyaltyPointsEarned ?? null,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed ?? null,
    giftVoucherCode: order.giftVoucherCode ?? null,
    giftVoucherAmount: order.giftVoucherAmount ?? null,
  };
}

/** HTML-escaped " (uom)" suffix for a line item, or "" when no selling unit. */
function uomHtml(item: ReceiptOrderItem): string {
  const u = item.sellingUnit?.trim();
  return u ? ` (${escHtml(u)})` : "";
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

  // ── Supermarket template — render its own document and early-return ───────
  if (template === "supermarket") {
    return buildSupermarketReceiptHtml(order, settings, {
      escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
      businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
      taxName, baseFontSize, subFontSize, bodyPadding, is58mm,
      secondaryCurrency, exchangeRate,
    });
  }

  // ── Convenience-store template ─────────────────────────────────────────────
  if (template === "convenience") {
    return buildConvenienceReceiptHtml(order, settings, {
      escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
      businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
      taxName, baseFontSize, subFontSize, bodyPadding, is58mm,
      secondaryCurrency, exchangeRate,
    });
  }

  // ── Staple-store template ──────────────────────────────────────────────────
  if (template === "staple") {
    return buildStapleReceiptHtml(order, settings, {
      escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
      businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
      taxName, baseFontSize, subFontSize, bodyPadding, is58mm,
      secondaryCurrency, exchangeRate,
    });
  }

  // ── Hardware-store half-letter template — full sheet, render & early-return ─
  if (template === "hardware") {
    return buildHardwareReceiptHtml(order, settings, {
      escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
      businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
      taxName, baseFontSize, subFontSize, bodyPadding, is58mm,
      secondaryCurrency, exchangeRate,
    });
  }

  // ── Restaurant template (Loyverse-style) ───────────────────────────────────
  // Bold business name, dotted separators, items with qty×price sub-line,
  // and a large bold Total — mirroring the classic Loyverse receipt look.
  if (template === "restaurant") {
    const totalFontSize = is58mm ? "15px" : "17px";
    const bigNumSize    = is58mm ? "48px" : "60px";

    // Address: split on newlines so multi-line addresses each get their own div
    const addrLines = businessAddress
      ? businessAddress.split(/\n/).filter(l => l.trim())
          .map(l => `<div>${escHtml(l.trim())}</div>`).join("")
      : "";
    const phoneLine = businessPhone
      ? `<div>Tel# ${escHtml(businessPhone)}</div>` : "";

    const logoHtml = businessLogoUrl
      ? `<div style="text-align:center;margin-bottom:4px;"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:60px;max-width:160px;object-fit:contain;" /></div>`
      : "";

    // Items: name + line total on first row, qty × unitPrice on second row,
    // then a dotted separator after each item (matches the Loyverse layout).
    const restItemsHtml = order.items.map(item => {
      const unitPriceStr = item.unitPrice != null
        ? fmt(item.unitPrice)
        : fmt(item.lineTotal / (item.quantity || 1));
      let html = `
        <div class="r-row">
          <span class="r-name">${escHtml(item.productName)}${uomHtml(item)}</span>
          <span class="r-price">${fmt(item.lineTotal)}</span>
        </div>
        <div class="r-sub">${item.quantity} x ${unitPriceStr}</div>`;
      for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
        html += `<div class="r-mod">&nbsp;&#8627; ${escHtml(v.optionName)}</div>`;
      }
      for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
        html += `<div class="r-mod">&nbsp;+ ${escHtml(m.optionName)}</div>`;
      }
      if (item.notes && item.notes.trim()) {
        html += `<div class="r-mod">&nbsp;&#8627; Note: ${escHtml(item.notes.trim())}</div>`;
      }
      if (item.originalUnitPrice != null && item.unitPrice != null && item.originalUnitPrice > item.unitPrice) {
        const saving = (item.originalUnitPrice - item.unitPrice) * item.quantity;
        html += `<div class="r-sub r-save">&nbsp;&#8627; You save: -${fmt(saving)}</div>`;
      }
      html += `<div class="r-sep"></div>`;
      return html;
    }).join("");

    // Totals block — show subtotal + tax only when there's a difference or tax
    const showBreakdown = (order.tax ?? 0) > 0 || (order.discountValue ?? 0) > 0;
    const breakdownHtml = showBreakdown ? `
      <div class="r-row r-light"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>
      ${(order.discountValue ?? 0) > 0 ? `<div class="r-row r-light"><span>Discount</span><span>-${fmt(order.discountValue ?? 0)}</span></div>` : ""}
      ${(order.tax ?? 0) > 0 ? `<div class="r-row r-light"><span>${escHtml(taxName)} (${taxRate}%)</span><span>${fmt(order.tax)}</span></div>` : ""}
      <div class="r-sep"></div>` : "";

    // Payment block. A gift voucher is a TENDER: it pays down `giftAmt` of the
    // total and the remaining `amountDue` is settled by `paymentMethod`.
    const giftAmt = order.giftVoucherAmount ?? 0;
    const amountDue = Math.max(0, Math.round((order.total - giftAmt) * 100) / 100);
    let restPaymentHtml = "";
    if (giftAmt > 0) {
      restPaymentHtml += `<div class="r-row r-light"><span>Gift Voucher${order.giftVoucherCode ? ` (${escHtml(order.giftVoucherCode)})` : ""}</span><span>-${fmt(giftAmt)}</span></div>`;
      restPaymentHtml += `<div class="r-row r-light"><span>Amount Due</span><span>${fmt(amountDue)}</span></div>`;
    }
    const cardKind = order.cardType === "debit" ? "Debit Card" : order.cardType === "credit" ? "Credit Card" : null;
    if (order.paymentMethod === "split") {
      restPaymentHtml += `
        <div class="r-row r-light"><span>${cardKind ?? "Card"}</span><span>${fmt(order.splitCardAmount ?? 0)}</span></div>
        <div class="r-row r-light"><span>Cash</span><span>${fmt(order.splitCashAmount ?? 0)}</span></div>`;
    } else if (order.paymentMethod !== "gift_voucher") {
      const pmLabel = order.paymentMethod === "card" && cardKind
        ? cardKind
        : order.paymentMethod
          ? escHtml(order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1))
          : "Cash";
      restPaymentHtml += `<div class="r-row r-light"><span>${pmLabel}</span><span>${fmt(amountDue)}</span></div>`;
    }
    // Only render Tendered / Total / Change when the cashier entered the cash received.
    if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
      const changeAmt = Math.max(0, order.cashTendered - amountDue);
      restPaymentHtml += `
        <div class="r-row r-light"><span>Tendered</span><span>${fmt(order.cashTendered)}</span></div>
        <div class="r-row r-light"><span>Total</span><span>-${fmt(amountDue)}</span></div>
        <div class="r-row r-light"><span>Change</span><span>${fmt(changeAmt)}</span></div>`;
    }

    const secondaryHtml2 = secondaryCurrency && exchangeRate > 0
      ? `<div class="r-row r-light"><span>&asymp;&nbsp;${escHtml(secondaryCurrency)}</span><span>${fmt(order.total * exchangeRate, secondaryCurrency)}</span></div>` : "";

    const notesHtml2 = order.notes
      ? `<div class="r-note">Note: ${escHtml(order.notes)}</div>` : "";
    const refundedHtml2 = order.status === "refunded"
      ? `<div class="r-refunded">&#9733; REFUNDED &#9733;</div>` : "";

    const loyaltyHtml2 = (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) ? `
      <div class="r-sep"></div>
      ${order.loyaltyPointsEarned   ? `<div class="r-light r-center">Loyalty earned: +${order.loyaltyPointsEarned} pts</div>` : ""}
      ${order.loyaltyPointsRedeemed ? `<div class="r-light r-center">Loyalty redeemed: -${order.loyaltyPointsRedeemed} pts</div>` : ""}
      ${order.customerLoyaltyBalance != null ? `<div class="r-light r-center">Balance: ${order.customerLoyaltyBalance} pts</div>` : ""}` : "";

    const customerHtml2 = order.customerName ? `
      <div class="r-sep"></div>
      <div class="r-light">Customer: ${escHtml(order.customerName)}</div>
      ${order.customerPhone ? `<div class="r-light">Tel: ${escHtml(order.customerPhone)}</div>` : ""}
      ${order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0
        ? `<div class="r-light r-due">Account Balance Due: ${fmt(order.customerOutstandingBalance)}</div>` : ""}` : "";

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
      font-weight: 700;
      line-height: 1.65;
      color: #000;
    }
    .r-biz  { font-size: ${is58mm ? "14px" : "16px"}; font-weight: 900; text-align: center; margin-bottom: 2px; }
    .r-addr { font-size: ${subFontSize}; text-align: center; line-height: 1.5; }
    .r-sep  { border-top: 1px dotted #000; margin: 4px 0; }
    .r-meta { font-size: ${baseFontSize}; margin: 1px 0; }
    .r-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin: 1px 0; }
    .r-name { flex: 1; }
    .r-price{ white-space: nowrap; }
    .r-sub  { font-size: ${subFontSize}; padding-left: 2px; margin-bottom: 2px; }
    .r-mod  { font-size: ${subFontSize}; padding-left: 10px; }
    .r-save { color: #0a7a0a; }
    .r-light{ font-size: ${subFontSize}; display: flex; justify-content: space-between; margin: 1px 0; }
    .r-center{ text-align: center; display: block; }
    .r-total{
      display: flex; justify-content: space-between; align-items: baseline;
      font-weight: 900;
      font-size: ${totalFontSize};
      margin: 4px 0 2px;
    }
    .r-total span { white-space: nowrap; }
    .r-footer { text-align: center; font-size: ${subFontSize}; margin: 6px 0 2px; }
    .r-powered{ text-align: center; font-size: 8px; margin: 2px 0 4px; letter-spacing: 1px; }
    .r-bignum { text-align: center; font-size: ${bigNumSize}; font-weight: 900; letter-spacing: 6px; line-height: 1; margin-top: 6px; }
    .r-note  { font-size: ${subFontSize}; font-style: italic; margin: 3px 0; }
    .r-refunded { color: red; font-weight: 900; text-align: center; font-size: 12px; border: 2px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .r-due   { color: #c00; display: flex; justify-content: space-between; margin: 1px 0; }
  </style>
</head>
<body>

  ${logoHtml}
  <div class="r-biz">${escHtml(businessName)}</div>
  <div class="r-addr">${addrLines}${phoneLine}</div>

  <div class="r-sep"></div>

  ${order.staffName ? `<div class="r-meta">Employee: ${escHtml(order.staffName)}</div>` : ""}
  ${order.stationNumber != null ? `<div class="r-meta">Station: #${order.stationNumber}</div>` : ""}
  <div class="r-meta">${escHtml(order.orderType || "Sale")}</div>
  ${order.customerName && !order.staffName ? "" : ""}
  ${customerHtml2}

  <div class="r-sep"></div>

  ${restItemsHtml}

  ${breakdownHtml}

  <div class="r-total"><span>Total</span><span>${fmt(order.total)}</span></div>
  ${secondaryHtml2}

  <div class="r-sep"></div>

  ${restPaymentHtml}

  <div class="r-sep"></div>

  ${notesHtml2}
  ${refundedHtml2}
  ${loyaltyHtml2}

  ${receiptFooter ? `<div class="r-footer">${escHtml(receiptFooter)}</div>` : ""}
  <div class="r-powered">Powered by NEXXUS POS</div>

  <div class="r-sep"></div>
  <div class="r-bignum">${lastThree}</div>

</body>
</html>`;
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  // Each line shows: "<qty>× <name> @ <unitPrice>" on the left and the line
  // total on the right. When a per-line saving applies (promo or volume tier
  // brought unitPrice below originalUnitPrice), we also render a green
  // "↳ You save: -<amount>" sub-line directly under the item.
  const itemsHtml = order.items.map(item => {
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const unitStr = unit != null ? ` @ ${fmtNum(unit)}` : "";
    let html = `<div class="row item-row"><span class="item-name">${item.quantity}&times; ${escHtml(item.productName)}${uomHtml(item)}${unitStr}</span><span class="nowrap">${fmtNum(item.lineTotal)}</span></div>`;
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      html += `<div class="row sub-row savings"><span>&nbsp;&#8627; You save (was ${fmtNum(orig)})</span><span class="nowrap">-${fmtNum(lineSaving)}</span></div>`;
    }
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="mod-line">&nbsp;&#8627; ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="mod-line">&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    if (item.notes && item.notes.trim()) {
      html += `<div class="mod-line">&nbsp;&#8627; Note: ${escHtml(item.notes.trim())}</div>`;
    }
    return html;
  }).join("");

  // ── Payment ───────────────────────────────────────────────────────────────
  // A gift voucher is a TENDER: it pays down `giftAmt`; `amountDue` is the rest.
  const giftAmt = order.giftVoucherAmount ?? 0;
  const amountDue = Math.max(0, Math.round((order.total - giftAmt) * 100) / 100);
  let paymentHtml = "";
  if (giftAmt > 0) {
    paymentHtml += `<div class="row sub-row"><span>Gift Voucher${order.giftVoucherCode ? ` (${escHtml(order.giftVoucherCode)})` : ""}</span><span class="nowrap">-${fmtNum(giftAmt)}</span></div>`;
    paymentHtml += `<div class="row sub-row"><span>Amount Due</span><span class="nowrap">${fmtNum(amountDue)}</span></div>`;
  }
  const cardKindUpper2 = order.cardType === "debit" ? "DEBIT CARD" : order.cardType === "credit" ? "CREDIT CARD" : null;
  if (order.paymentMethod === "split") {
    paymentHtml += `
      <div class="row sub-row"><span>Payment</span><span class="nowrap">SPLIT</span></div>
      <div class="row sub-row"><span>&nbsp;&nbsp;${cardKindUpper2 ?? "Card"}</span><span class="nowrap">${fmtNum(order.splitCardAmount ?? 0)}</span></div>
      <div class="row sub-row"><span>&nbsp;&nbsp;Cash</span><span class="nowrap">${fmtNum(order.splitCashAmount ?? 0)}</span></div>`;
  } else if (order.paymentMethod !== "gift_voucher") {
    const pmUpper = order.paymentMethod === "card" && cardKindUpper2
      ? cardKindUpper2
      : (order.paymentMethod ?? "—").toUpperCase();
    paymentHtml += `<div class="row sub-row"><span>Payment</span><span class="nowrap">${escHtml(pmUpper)}</span></div>`;
  }
  // Only render Tendered / Total / Change when the cashier entered the cash received.
  if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
    const changeAmt = Math.max(0, order.cashTendered - amountDue);
    paymentHtml += `
      <div class="row sub-row"><span>Tendered</span><span class="nowrap">${fmtNum(order.cashTendered)}</span></div>
      <div class="row sub-row"><span>Total</span><span class="nowrap">-${fmtNum(amountDue)}</span></div>
      <div class="row sub-row"><span>Change</span><span class="nowrap">${fmtNum(changeAmt)}</span></div>`;
  }

  // ── Optional blocks ───────────────────────────────────────────────────────
  const refundedHtml  = order.status === "refunded"
    ? `<div class="refunded">&#9733; REFUNDED &#9733;</div>` : "";
  const discountHtml  = (order.discountValue ?? 0) > 0
    ? `<div class="row sub-row"><span>Discount</span><span class="nowrap discount">-${fmtNum(order.discountValue ?? 0)}</span></div>` : "";
  const tierSavings   = totalTierSavings(order.items);
  const savingsHtml   = tierSavings > 0
    ? `<div class="row sub-row savings"><span>You Save:</span><span class="nowrap">-${fmtNum(tierSavings)}</span></div>` : "";
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
      ${order.stationNumber != null ? `<div>Station: #${order.stationNumber}</div>` : ""}
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
      font-weight: 700;
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

/**
 * Render the "supermarket" receipt template — a US grocery / big-box style
 * receipt with a centered store header, fixed-column item table including
 * a per-line "barcode" code, right-aligned totals, payment-method TEND line,
 * change due, sequence + transaction identifiers, a large CSS-stripe barcode,
 * and a CUSTOMER COPY footer.
 */
function buildSupermarketReceiptHtml(
  order: ReceiptOrder,
  _settings: ReceiptSettings,
  ctx: {
    escHtml: (s: string) => string;
    fmt: (n: number, cur?: string) => string;
    fmtNum: (n: number) => string;
    dateStr: string;
    orderNum: string;
    businessName: string;
    businessAddress: string;
    businessPhone: string;
    businessLogoUrl: string;
    receiptFooter: string;
    receiptSize: string;
    taxRate: string;
    taxName: string;
    baseFontSize: string;
    subFontSize: string;
    bodyPadding: string;
    is58mm: boolean;
    secondaryCurrency: string;
    exchangeRate: number;
  },
): string {
  const {
    escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
    businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
    taxName, baseFontSize, subFontSize, bodyPadding, is58mm,
    secondaryCurrency, exchangeRate,
  } = ctx;

  // Stable 12-digit numeric code from a string — used as a derived "barcode"
  // when an item has no productId / barcode of its own. djb2-ish hash so the
  // same product always gets the same code on every reprint.
  const hashCode = (s: string): string => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return String(h).padStart(12, "0").slice(-12);
  };
  const lineBarcode = (item: ReceiptOrderItem): string => {
    if (item.barcode && item.barcode.trim()) return item.barcode.replace(/\s+/g, "").slice(0, 14);
    if (item.productId != null) return String(item.productId).padStart(12, "0");
    return hashCode(item.productName);
  };

  // Map our internal payment method onto a supermarket-style TEND label.

  const totalQty = order.items.reduce((s, i) => s + (i.quantity || 0), 0);
  const itemsSold = Number.isInteger(totalQty) ? totalQty : Math.round(totalQty * 100) / 100;

  // Cash → real change. Card/credit → 0.00 (matches reference receipt where
  // CREDIT TEND line is followed by CHANGE DUE 0.00).
  const changeDue = (order.paymentMethod === "cash" && order.cashTendered)
    ? Math.max(0, order.cashTendered - order.total)
    : 0;


  // ── Items table ──────────────────────────────────────────────────────────
  // Three columns: name (left), barcode (center, monospace), price + " X"
  // taxable indicator (right, only when the order is taxed). Modifier/variant
  // lines are indented under their parent.
  const taxIndicator = order.tax > 0 ? "&nbsp;X" : "";
  const itemRowsHtml = order.items.map(item => {
    const bc = lineBarcode(item);
    const qtyPrefix = item.quantity !== 1 ? `${item.quantity}× ` : "";
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const unitStr = unit != null ? ` @ ${fmtNum(unit)}` : "";
    let html = `
      <div class="sm-item">
        <span class="sm-item-name">${escHtml(qtyPrefix + item.productName.toUpperCase())}${uomHtml(item)}${unitStr}</span>
        <span class="sm-item-bc">${escHtml(bc)}</span>
        <span class="sm-item-price">${fmtNum(item.lineTotal)}${taxIndicator}</span>
      </div>`;
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      html += `<div class="sm-mod" style="color:#0a7a0a;font-weight:700;">&nbsp;&nbsp;↳ You save (was ${fmtNum(orig)}) -${fmtNum(lineSaving)}</div>`;
    }
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="sm-mod">&nbsp;&nbsp;↳ ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="sm-mod">&nbsp;&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    if (item.notes && item.notes.trim()) {
      html += `<div class="sm-mod">&nbsp;&nbsp;↳ Note: ${escHtml(item.notes.trim())}</div>`;
    }
    return html;
  }).join("");

  // ── Header identifier row: ST# / OP# / TE# / TR# ─────────────────────────
  // We have no real terminal/operator IDs, so derive from order number and
  // staff name. The point is to look like a supermarket header — these are
  // informational only.
  const orderDigits = orderNum.replace(/\D/g, "").padStart(4, "0");
  const stNum = orderDigits.slice(-4);
  const trNum = orderDigits.slice(-4).split("").reverse().join("");
  const opCode = order.staffName
    ? hashCode(order.staffName).slice(-8)
    : "00000000";
  const teNum = String((parseInt(orderDigits, 10) % 99) + 1).padStart(2, "0");

  const idRowHtml = `
    <div class="sm-id-row">
      <span>ST# ${stNum}</span>
      <span>OP# ${opCode}</span>
      <span>TE# ${teNum}</span>
      <span>TR# ${trNum}</span>
    </div>`;

  // ── Tax line(s) — the reference image shows two tax bands but we only have
  // one configured rate, so render a single TAX line matching settings. If
  // the order has no taxable amount, suppress.
  const taxLineHtml = order.tax > 0 ? `
    <div class="sm-tot-row">
      <span class="sm-tot-label">${escHtml(taxName)} ${escHtml(taxRate)}%</span>
      <span class="sm-tot-val">${fmtNum(order.tax)}</span>
    </div>` : "";

  const discountLineHtml = (order.discountValue ?? 0) > 0 ? `
    <div class="sm-tot-row">
      <span class="sm-tot-label">DISCOUNT</span>
      <span class="sm-tot-val">-${fmtNum(order.discountValue ?? 0)}</span>
    </div>` : "";

  // Secondary-currency conversion line (≈ USD 12.34) shown right under TOTAL
  // when the business has a secondary currency + non-zero rate configured.
  const secondaryLineHtml = (secondaryCurrency && exchangeRate > 0) ? `
    <div class="sm-tot-row">
      <span class="sm-tot-label">≈ ${escHtml(secondaryCurrency)}</span>
      <span class="sm-tot-val">${fmt(order.total * exchangeRate, secondaryCurrency)}</span>
    </div>` : "";

  // Order note line (italic, full-width) — only when the cashier added one.
  const notesLineHtml = order.notes ? `
    <div class="sm-note">Note: ${escHtml(order.notes)}</div>` : "";

  // Loyalty earned/redeemed block — mirrors the standard templates so customers
  // still see their points activity on supermarket-style receipts.
  const loyaltyHtml = (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) ? `
    <div class="sm-loyalty">
      ★ LOYALTY POINTS ★
      ${order.loyaltyPointsEarned   ? `<div>+ ${order.loyaltyPointsEarned} pts earned</div>`   : ""}
      ${order.loyaltyPointsRedeemed ? `<div>- ${order.loyaltyPointsRedeemed} pts redeemed</div>` : ""}
    </div>` : "";

  // Customer outstanding-balance warning — same as classic templates.
  const customerOutstandingHtml = (order.customerName && order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0) ? `
    <div class="sm-balance-due">ACCOUNT BALANCE DUE: ${fmt(order.customerOutstandingBalance)}</div>` : "";

  // ── Account / approval / ref / terminal block ────────────────────────────
  // Card data isn't captured by the POS today, so for non-card payments we
  // show all four lines blanked out (matches the reference's spacing). For
  // card/credit we still don't have a PAN — show masked all-stars.
  const isCardish = order.paymentMethod === "card" || order.paymentMethod === "split" || order.paymentMethod === "credit";
  const acctMasked = isCardish ? "**** **** **** ****" : "&nbsp;";
  const approvalHash = isCardish ? hashCode(orderNum + "ap").slice(-6).toUpperCase() : "";
  const refHash      = isCardish ? hashCode(orderNum + "rf").slice(-12) : "";
  const termHash     = isCardish ? hashCode(orderNum + "tm").slice(-10) : "";
  const accountBlockHtml = `
    <div class="sm-acct">
      <div class="sm-acct-row"><span>ACCOUNT  #</span><span class="sm-acct-val">${acctMasked}</span></div>
      <div class="sm-acct-row"><span>APPROVAL #</span><span class="sm-acct-val">${escHtml(approvalHash)}</span></div>
      <div class="sm-acct-row"><span>REF      #</span><span class="sm-acct-val">${escHtml(refHash)}</span></div>
      <div class="sm-acct-row"><span>TERMINAL #</span><span class="sm-acct-val">${escHtml(termHash)}</span></div>
    </div>`;

  // ── Big TC# transaction code (groups of 4 digits) ────────────────────────
  const tcRaw = (hashCode(orderNum + "tc") + hashCode(dateStr + "tc")).slice(0, 20);
  const tcGrouped = tcRaw.match(/.{1,4}/g)?.join(" ") ?? tcRaw;

  // ── CSS stripe barcode (deterministic widths from order number) ──────────
  // Generates ~50 vertical bars with widths driven by char codes in orderNum
  // so reprints render the same pattern.
  const seed = orderNum.repeat(8);
  const bars: string[] = [];
  for (let i = 0; i < 60; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const w = 1 + (code % 4); // 1–4 px
    const isBar = (i + code) % 2 === 0;
    bars.push(`<span class="sm-bar" style="width:${w}px;background:${isBar ? "#000" : "transparent"};"></span>`);
  }
  const barcodeHtml = `
    <div class="sm-barcode-wrap">
      <div class="sm-barcode">${bars.join("")}</div>
      <div class="sm-barcode-num">${escHtml(tcGrouped.slice(0, 19))}</div>
    </div>`;

  const refundedHtml = order.status === "refunded"
    ? `<div class="sm-refunded">★ REFUNDED ★</div>` : "";

  const logoHtml = businessLogoUrl
    ? `<div style="text-align:center;margin-bottom:4px;"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:60px;max-width:160px;object-fit:contain;" /></div>`
    : "";

  // Address may contain commas / line breaks — split on commas/newlines so each
  // chunk renders on its own centered line like the reference image.
  const addressLines = (businessAddress || "")
    .split(/\r?\n|,/)
    .map(s => s.trim())
    .filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt — ${escHtml(orderNum)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: ${receiptSize} auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: ${bodyPadding};
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      font-weight: 700;
      line-height: 1.5;
      color: #000;
    }
    .sm-store-name {
      text-align: center;
      font-weight: 900;
      font-size: ${is58mm ? "16px" : "20px"};
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .sm-center  { text-align: center; }
    .sm-sub     { font-size: ${subFontSize}; }
    .sm-blank   { height: 6px; }

    .sm-id-row {
      display: flex; justify-content: space-between; gap: 6px;
      font-size: ${subFontSize};
      margin: 6px 0 4px;
      border-top: 1px dashed #555;
      border-bottom: 1px dashed #555;
      padding: 3px 0;
    }
    .sm-id-row span { white-space: nowrap; }

    .sm-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 6px;
      font-size: ${baseFontSize};
      align-items: baseline;
      margin: 1px 0;
    }
    .sm-item-name  { font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sm-item-bc    { font-family: 'Courier New', Courier, monospace; color: #222; letter-spacing: 0.5px; }
    .sm-item-price { white-space: nowrap; font-weight: 700; }
    .sm-mod        { padding-left: 12px; font-size: ${subFontSize}; color: #444; }

    .sm-tot-block {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dashed #555;
    }
    .sm-tot-row {
      display: flex; justify-content: flex-end; gap: 16px;
      font-size: ${baseFontSize};
      margin: 1px 0;
    }
    .sm-tot-label { text-align: right; min-width: 90px; }
    .sm-tot-val   { text-align: right; min-width: 60px; white-space: nowrap; }
    .sm-tot-row.total { font-weight: 900; font-size: ${is58mm ? "13px" : "14px"}; margin-top: 2px; }

    .sm-acct {
      margin-top: 6px;
      font-size: ${subFontSize};
    }
    .sm-acct-row { display: flex; gap: 8px; }
    .sm-acct-val { flex: 1; text-align: right; letter-spacing: 1px; }

    .sm-items-sold {
      text-align: center;
      font-weight: 900;
      font-size: ${is58mm ? "16px" : "20px"};
      letter-spacing: 2px;
      margin: 10px 0 4px;
    }
    .sm-tc { text-align: center; font-size: ${subFontSize}; letter-spacing: 1px; margin: 2px 0 6px; }

    .sm-barcode-wrap { text-align: center; margin: 4px 0; }
    .sm-barcode {
      display: inline-flex; align-items: stretch;
      height: ${is58mm ? "40px" : "52px"};
      padding: 0 4px;
    }
    .sm-bar { display: inline-block; height: 100%; }
    .sm-barcode-num { font-size: ${subFontSize}; letter-spacing: 2px; margin-top: 2px; }

    .sm-footer {
      text-align: center;
      margin-top: 8px;
      font-size: ${baseFontSize};
    }
    .sm-footer .line { margin: 1px 0; }
    .sm-customer-copy {
      text-align: center;
      font-weight: 700;
      letter-spacing: 2px;
      margin-top: 4px;
      font-size: ${baseFontSize};
    }
    .sm-powered { text-align: center; font-size: 8px; color: #aaa; margin-top: 6px; letter-spacing: 1px; }
    .sm-refunded { color: red; font-weight: bold; text-align: center; font-size: 12px; border: 1px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .sm-note { font-size: ${subFontSize}; font-style: italic; margin: 4px 0; }
    .sm-loyalty { text-align: center; font-weight: bold; font-size: ${baseFontSize}; margin: 6px 0 2px; }
    .sm-balance-due { font-size: ${subFontSize}; font-weight: 700; color: #c00; margin: 4px 0; text-align: center; }
  </style>
</head>
<body>

  ${logoHtml}
  <div class="sm-store-name">${escHtml(businessName.toUpperCase())}</div>
  ${businessPhone ? `<div class="sm-center sm-sub">${escHtml(businessPhone)}</div>` : ""}
  ${order.staffName ? `<div class="sm-center sm-sub">CASHIER ${escHtml(order.staffName.toUpperCase())}</div>` : ""}
  ${order.stationNumber != null ? `<div class="sm-center sm-sub">STATION #${order.stationNumber}</div>` : ""}
  ${addressLines.map(l => `<div class="sm-center sm-sub">${escHtml(l.toUpperCase())}</div>`).join("")}

  ${idRowHtml}

  ${itemRowsHtml}

  <div class="sm-tot-block">
    <div class="sm-tot-row"><span class="sm-tot-label">SUBTOTAL</span><span class="sm-tot-val">${fmtNum(order.subtotal)}</span></div>
    ${discountLineHtml}
    ${taxLineHtml}
    <div class="sm-tot-row total"><span class="sm-tot-label">TOTAL</span><span class="sm-tot-val">${fmtNum(order.total)}</span></div>
    ${secondaryLineHtml}
    ${(order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) ? `
    <div class="sm-tot-row"><span class="sm-tot-label">CASH TEND</span><span class="sm-tot-val">${fmtNum(order.cashTendered)}</span></div>
    <div class="sm-tot-row"><span class="sm-tot-label">TOTAL</span><span class="sm-tot-val">-${fmtNum(order.total)}</span></div>
    <div class="sm-tot-row"><span class="sm-tot-label">CHANGE DUE</span><span class="sm-tot-val">${fmtNum(changeDue)}</span></div>` : ""}
    ${order.paymentMethod === "split" ? `
    <div class="sm-tot-row"><span class="sm-tot-label">${order.cardType === "debit" ? "DEBIT CARD" : order.cardType === "credit" ? "CREDIT CARD" : "CARD"}</span><span class="sm-tot-val">${fmtNum(order.splitCardAmount ?? 0)}</span></div>
    <div class="sm-tot-row"><span class="sm-tot-label">CASH</span><span class="sm-tot-val">${fmtNum(order.splitCashAmount ?? 0)}</span></div>` : ""}
  </div>

  ${accountBlockHtml}
  ${notesLineHtml}
  ${customerOutstandingHtml}
  ${loyaltyHtml}
  ${refundedHtml}

  <div class="sm-items-sold"># ITEMS SOLD ${itemsSold}</div>
  <div class="sm-tc">TC# ${escHtml(tcGrouped)}</div>

  ${barcodeHtml}

  <div class="sm-footer">
    <div class="line">${escHtml(receiptFooter)}</div>
    <div class="line">${escHtml(dateStr)}</div>
  </div>
  <div class="sm-customer-copy">*** CUSTOMER COPY ***</div>
  <div class="sm-powered">Powered by NEXXUS POS</div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience-store receipt — 7-Eleven / corner store style
// Header: centered name → address → phone → "THANKS FOR SHOPPING"
// Items: QTY  Name                       Price T/B
// Totals: SUBTOTAL / TOTAL DUE
// Payment: large bold method name + amount (real tender only — no fabricated
//          card/terminal data)
// Footer: marketing message + date
// ─────────────────────────────────────────────────────────────────────────────
type ReceiptCtx = {
  escHtml: (s: string) => string;
  fmt: (n: number, cur?: string) => string;
  fmtNum: (n: number) => string;
  dateStr: string;
  orderNum: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessLogoUrl: string;
  receiptFooter: string;
  receiptSize: string;
  taxRate: string;
  taxName: string;
  baseFontSize: string;
  subFontSize: string;
  bodyPadding: string;
  is58mm: boolean;
  secondaryCurrency: string;
  exchangeRate: number;
};

function buildConvenienceReceiptHtml(
  order: ReceiptOrder,
  _settings: ReceiptSettings,
  ctx: ReceiptCtx,
): string {
  const {
    escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
    businessPhone, businessLogoUrl, receiptFooter, receiptSize,
    baseFontSize, subFontSize, bodyPadding, is58mm,
    secondaryCurrency, exchangeRate,
  } = ctx;

  // Tax indicator: "T" for taxable (when order has tax), "B" for non-taxable
  const taxInd = order.tax > 0 ? "T" : "B";

  // Address lines
  const addressLines = (businessAddress || "")
    .split(/\r?\n|,/)
    .map(s => s.trim())
    .filter(Boolean);

  // Logo
  const logoHtml = businessLogoUrl
    ? `<div class="cv-center"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:54px;max-width:140px;object-fit:contain;margin-bottom:3px;" /></div>`
    : "";

  // Items — each line: QTY  Name @ unit  Price T/B
  const itemRowsHtml = order.items.map(item => {
    const qtyStr = String(item.quantity).padStart(1, " ");
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const unitStr = unit != null ? ` @ ${fmtNum(unit)}` : "";
    let html = `
      <div class="cv-item">
        <span class="cv-item-qty">${escHtml(qtyStr)}</span>
        <span class="cv-item-name">${escHtml(item.productName)}${uomHtml(item)}${unitStr}</span>
        <span class="cv-item-price">${fmtNum(item.lineTotal)}${taxInd}</span>
      </div>`;
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      html += `<div class="cv-mod" style="color:#0a7a0a;font-weight:700;">&nbsp;&nbsp;↳ You save (was ${fmtNum(orig)}) -${fmtNum(lineSaving)}</div>`;
    }
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="cv-mod">&nbsp;&nbsp;↳ ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="cv-mod">&nbsp;&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    if (item.notes && item.notes.trim()) {
      html += `<div class="cv-mod">&nbsp;&nbsp;↳ Note: ${escHtml(item.notes.trim())}</div>`;
    }
    return html;
  }).join("");

  // Discount as a negative line item (like the "1 PROMOTION" line in the reference)
  const discountLineHtml = (order.discountValue ?? 0) > 0 ? `
    <div class="cv-item">
      <span class="cv-item-qty">1</span>
      <span class="cv-item-name">PROMOTION / DISCOUNT</span>
      <span class="cv-item-price" style="color:#c00;">-${fmtNum(order.discountValue ?? 0)}${taxInd}</span>
    </div>` : "";

  // Totals
  const secondaryLineHtml = (secondaryCurrency && exchangeRate > 0) ? `
    <div class="cv-tot-row cv-sub">
      <span>≈ ${escHtml(secondaryCurrency)}</span>
      <span>${fmt(order.total * exchangeRate, secondaryCurrency)}</span>
    </div>` : "";

  // Payment block — large bold method + amount like "CARD  14.00"
  const isCard   = order.paymentMethod === "card" || order.paymentMethod === "credit";
  const isSplit  = order.paymentMethod === "split";
  const isCash   = order.paymentMethod === "cash";
  const cardKindUpper3 = order.cardType === "debit" ? "DEBIT CARD" : order.cardType === "credit" ? "CREDIT CARD" : null;
  const methodLabel = (() => {
    if (isCash)   return "CASH";
    if (order.paymentMethod === "card" && cardKindUpper3) return cardKindUpper3;
    if (isCard)   return "CARD";
    if (isSplit)  return "SPLIT";
    if (order.paymentMethod === "topup") return "TOPUP";
    if (order.paymentMethod === "loyalty") return "LOYALTY";
    return (order.paymentMethod ?? "TENDER").toUpperCase();
  })();
  const paymentHeaderHtml = `
    <div class="cv-payment-row">
      <span class="cv-payment-method">${escHtml(methodLabel)}</span>
      <span class="cv-payment-amount">${fmtNum(order.total)}</span>
    </div>`;

  // Only show Tendered / Total / Change when the cashier entered the cash received.
  const cashChangeHtml = (isCash && order.cashTendered && order.cashTendered > 0) ? `
    <div class="cv-card-row"><span>CASH TENDERED</span><span>${fmtNum(order.cashTendered)}</span></div>
    <div class="cv-card-row"><span>TOTAL</span><span>-${fmtNum(order.total)}</span></div>
    <div class="cv-card-row"><span>CHANGE DUE</span><span>${fmtNum(Math.max(0, order.cashTendered - order.total))}</span></div>` : "";

  const splitHtml = isSplit ? `
    <div class="cv-card-row"><span>${cardKindUpper3 ?? "CARD"}</span><span>${fmtNum(order.splitCardAmount ?? 0)}</span></div>
    <div class="cv-card-row"><span>CASH</span><span>${fmtNum(order.splitCashAmount ?? 0)}</span></div>` : "";

  // Loyalty
  const loyaltyHtml = (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) ? `
    <div class="cv-center cv-loyalty">
      ★ LOYALTY POINTS ★
      ${order.loyaltyPointsEarned   ? `<div>+ ${order.loyaltyPointsEarned} pts earned</div>`   : ""}
      ${order.loyaltyPointsRedeemed ? `<div>- ${order.loyaltyPointsRedeemed} pts redeemed</div>` : ""}
    </div>` : "";

  const refundedHtml = order.status === "refunded" ? `<div class="cv-refunded">★ REFUNDED ★</div>` : "";

  const outstandingHtml = (order.customerName && order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0)
    ? `<div class="cv-center cv-outstanding">ACCOUNT BALANCE DUE: ${fmt(order.customerOutstandingBalance)}</div>` : "";

  const notesHtml = order.notes ? `<div class="cv-note">Note: ${escHtml(order.notes)}</div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt — ${escHtml(orderNum)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: ${receiptSize} auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: ${bodyPadding};
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      font-weight: 700;
      line-height: 1.55;
      color: #000;
    }
    .cv-center { text-align: center; }
    .cv-sub    { font-size: ${subFontSize}; }
    .cv-blank  { height: 5px; }
    .cv-name {
      text-align: center;
      font-weight: 900;
      font-size: ${is58mm ? "16px" : "18px"};
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .cv-div    { border-top: 1px solid #555; margin: 4px 0; }
    .cv-div-d  { border-top: 1px dashed #888; margin: 3px 0; }

    .cv-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 4px;
      font-size: ${baseFontSize};
      margin: 1px 0;
    }
    .cv-item-qty   { white-space: nowrap; }
    .cv-item-name  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cv-item-price { white-space: nowrap; text-align: right; }
    .cv-mod        { padding-left: 14px; font-size: ${subFontSize}; color: #444; }

    .cv-tot-row {
      display: flex; justify-content: space-between;
      font-size: ${baseFontSize};
      margin: 1px 0;
    }
    .cv-tot-row.cv-total { font-weight: 900; font-size: ${is58mm ? "13px" : "14px"}; margin-top: 2px; }

    .cv-payment-row {
      display: flex; justify-content: space-between; align-items: baseline;
      font-weight: 900;
      font-size: ${is58mm ? "18px" : "22px"};
      letter-spacing: 1px;
      margin: 4px 0 2px;
    }
    .cv-payment-method { }
    .cv-payment-amount { }

    .cv-card-row {
      display: flex; justify-content: space-between; gap: 6px;
      font-size: ${subFontSize};
      margin: 0.5px 0;
    }
    .cv-card-single { font-size: ${subFontSize}; margin: 1px 0; }

    .cv-agreement {
      text-align: center;
      font-size: ${subFontSize};
      margin: 5px 0 3px;
      line-height: 1.5;
    }
    .cv-footer-line {
      text-align: center;
      font-size: ${subFontSize};
      margin: 1px 0;
    }
    .cv-footer-marketing {
      text-align: center;
      font-weight: 700;
      font-size: ${baseFontSize};
      margin: 5px 0 3px;
    }
    .cv-tid {
      text-align: center;
      font-size: ${subFontSize};
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .cv-loyalty { font-weight: bold; font-size: ${baseFontSize}; margin: 5px 0 2px; }
    .cv-outstanding { font-size: ${subFontSize}; font-weight: 700; color: #c00; margin: 3px 0; }
    .cv-note { font-size: ${subFontSize}; font-style: italic; margin: 3px 0; }
    .cv-refunded { color: red; font-weight: bold; text-align: center; font-size: 12px; border: 1px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .cv-powered { text-align: center; font-size: 8px; color: #aaa; margin-top: 6px; letter-spacing: 1px; }
  </style>
</head>
<body>

  ${logoHtml}
  <div class="cv-name">${escHtml(businessName.toUpperCase())}</div>
  ${addressLines.map(l => `<div class="cv-center cv-sub">${escHtml(l.toUpperCase())}</div>`).join("")}
  ${businessPhone ? `<div class="cv-center cv-sub">${escHtml(businessPhone)}</div>` : ""}
  ${order.staffName ? `<div class="cv-center cv-sub">CASHIER ${escHtml(order.staffName.toUpperCase())}</div>` : ""}
  ${order.stationNumber != null ? `<div class="cv-center cv-sub">STATION #${order.stationNumber}</div>` : ""}
  <div class="cv-center cv-sub">THANKS FOR SHOPPING</div>
  <div class="cv-center cv-sub">with ${escHtml(businessName)}</div>

  <div class="cv-blank"></div>
  <div class="cv-div"></div>

  ${itemRowsHtml}
  ${discountLineHtml}

  <div class="cv-div"></div>

  <div class="cv-tot-row"><span>SUBTOTAL</span><span>${fmtNum(order.subtotal)}</span></div>
  <div class="cv-tot-row cv-total"><span>TOTAL DUE</span><span>${fmtNum(order.total)}</span></div>
  ${secondaryLineHtml}

  <div class="cv-div"></div>

  ${paymentHeaderHtml}
  ${cashChangeHtml}
  ${splitHtml}
  ${notesHtml}
  ${loyaltyHtml}
  ${refundedHtml}
  ${outstandingHtml}

  <div class="cv-div"></div>

  ${receiptFooter ? `<div class="cv-footer-marketing">${escHtml(receiptFooter)}</div>` : ""}

  <div class="cv-div-d"></div>
  <div class="cv-tid">${escHtml(dateStr)}</div>
  <div class="cv-powered">Powered by NEXXUS POS</div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staple-store receipt — large-format retail / office-supply store style
// Header: very large bold store name + tagline + address
// SALE row: transaction ID + HH:MM + date
// Table: QTY | product name / SKU | PRICE N
// Totals: SUBTOTAL $x / Tax x.xx% $x / TOTAL $x
// Payment: CREDIT/CASH + card no. + chip + auth + AID
// Footer: large "# TOTAL ITEMS N" + CSS barcode + *** CUSTOMER COPY ***
// ─────────────────────────────────────────────────────────────────────────────
function buildStapleReceiptHtml(
  order: ReceiptOrder,
  _settings: ReceiptSettings,
  ctx: ReceiptCtx,
): string {
  const {
    escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
    businessPhone, businessLogoUrl, receiptFooter, receiptSize, taxRate,
    baseFontSize, subFontSize, bodyPadding, is58mm,
    secondaryCurrency, exchangeRate,
  } = ctx;

  // Stable hash helper
  const hashStr = (s: string, len: number) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return String(h).padStart(len, "0").slice(-len);
  };

  // Parse time for the SALE row
  const createdAt = typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const saleTime  = `${createdAt.getHours().toString().padStart(2,"0")}:${createdAt.getMinutes().toString().padStart(2,"0")}`;
  const saleDate  = `${(createdAt.getMonth()+1).toString().padStart(2,"0")}/${createdAt.getDate().toString().padStart(2,"0")}/${createdAt.getFullYear()}`;

  // SKU: use barcode if present, else productId padded, else hash
  const itemSku = (item: ReceiptOrderItem, idx: number): string => {
    if (item.barcode && item.barcode.trim()) return item.barcode.replace(/\s+/g,"").slice(0,13);
    if (item.productId != null) return String(item.productId).padStart(12,"0");
    return hashStr(item.productName + idx, 12);
  };

  // Tax indicator — "N" means non-exempt taxable (reference shows N on all items)
  const taxInd = order.tax > 0 ? " N" : "";

  const logoHtml = businessLogoUrl
    ? `<div class="st-center"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:60px;max-width:160px;object-fit:contain;margin-bottom:4px;" /></div>`
    : "";

  const addressLines = (businessAddress || "")
    .split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

  // Item rows — QTY | name\nSKU\n@unit | price N
  const itemRowsHtml = order.items.map((item, i) => {
    const sku = itemSku(item, i);
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const subLines: string[] = [];
    if (unit != null) subLines.push(`@ ${fmtNum(unit)}`);
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      subLines.push(`You save (was ${fmtNum(orig)}) -${fmtNum(lineSaving)}`);
    }
    const mods = [
      ...((item.variantChoices as { optionName: string }[] | null) ?? []).map(v => `↳ ${v.optionName}`),
      ...((item.modifierChoices as { optionName: string }[] | null) ?? []).map(m => `+ ${m.optionName}`),
      ...(item.notes && item.notes.trim() ? [`↳ Note: ${item.notes.trim()}`] : []),
    ];
    const savingsIdx = (orig != null && unit != null && orig > unit) ? subLines.length - 1 : -1;
    return `
      <div class="st-item-row">
        <span class="st-qty">${item.quantity}</span>
        <span class="st-name-sku">
          <span class="st-name">${escHtml(item.productName)}${uomHtml(item)}</span>
          <span class="st-sku">${escHtml(sku)}</span>
          ${subLines.map((s, idx) => `<span class="st-mod"${idx === savingsIdx ? ' style="color:#0a7a0a;font-weight:700;"' : ""}>${escHtml(s)}</span>`).join("")}
          ${mods.map(m => `<span class="st-mod">${escHtml(m)}</span>`).join("")}
        </span>
        <span class="st-price">${fmtNum(item.lineTotal)}${escHtml(taxInd)}</span>
      </div>`;
  }).join("");

  const discountLineHtml = (order.discountValue ?? 0) > 0 ? `
    <div class="st-tot-row">
      <span class="st-tot-label">DISCOUNT</span>
      <span class="st-tot-val" style="color:#c00;">-$${fmtNum(order.discountValue ?? 0)}</span>
    </div>` : "";

  const secondaryLineHtml = (secondaryCurrency && exchangeRate > 0) ? `
    <div class="st-tot-row">
      <span class="st-tot-label">≈ ${escHtml(secondaryCurrency)}</span>
      <span class="st-tot-val">${fmt(order.total * exchangeRate, secondaryCurrency)}</span>
    </div>` : "";

  // Payment block
  const isCard  = order.paymentMethod === "card" || order.paymentMethod === "credit";
  const isSplit = order.paymentMethod === "split";
  const isCash  = order.paymentMethod === "cash";
  const payLabel = (() => {
    if (isCash)  return "CASH";
    if (isCard)  return "CREDIT";
    if (isSplit) return "SPLIT";
    if (order.paymentMethod === "topup") return "TOPUP";
    if (order.paymentMethod === "loyalty") return "LOYALTY";
    return (order.paymentMethod ?? "PAYMENT").toUpperCase();
  })();
  const paymentBlockHtml = `
    <div class="st-pay-label">${escHtml(payLabel)}</div>
    ${isSplit ? `
    <div class="st-pay-row"><span>CARD</span><span>$${fmtNum(order.splitCardAmount ?? 0)}</span></div>
    <div class="st-pay-row"><span>CASH</span><span>$${fmtNum(order.splitCashAmount ?? 0)}</span></div>` : ""}
    ${(isCash && order.cashTendered && order.cashTendered > 0) ? `
    <div class="st-pay-row"><span>CASH TENDERED</span><span>$${fmtNum(order.cashTendered)}</span></div>
    <div class="st-pay-row"><span>TOTAL</span><span>-$${fmtNum(order.total)}</span></div>
    <div class="st-pay-row"><span>CHANGE DUE</span><span>$${fmtNum(Math.max(0, order.cashTendered - order.total))}</span></div>` : ""}` ;

  // Total items count
  const totalQty  = order.items.reduce((s, i) => s + (i.quantity || 0), 0);
  const itemCount = Number.isInteger(totalQty) ? totalQty : Math.round(totalQty * 100) / 100;

  // Loyalty
  const loyaltyHtml = (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) ? `
    <div class="st-center st-loyalty">
      ★ LOYALTY POINTS ★
      ${order.loyaltyPointsEarned   ? `<div>+ ${order.loyaltyPointsEarned} pts earned</div>`   : ""}
      ${order.loyaltyPointsRedeemed ? `<div>- ${order.loyaltyPointsRedeemed} pts redeemed</div>` : ""}
    </div>` : "";

  const notesHtml = order.notes ? `<div class="st-note">Note: ${escHtml(order.notes)}</div>` : "";
  const refundedHtml = order.status === "refunded" ? `<div class="st-refunded">★ REFUNDED ★</div>` : "";
  const outstandingHtml = (order.customerName && order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0)
    ? `<div class="st-center" style="font-size:${subFontSize};font-weight:700;color:#c00;margin:3px 0;">ACCOUNT BALANCE DUE: ${fmt(order.customerOutstandingBalance)}</div>` : "";

  // CSS barcode (same deterministic approach as supermarket template)
  const seed = orderNum.repeat(8);
  const bars: string[] = [];
  for (let i = 0; i < 60; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const w = 1 + (code % 4);
    const isBar = (i + code) % 2 === 0;
    bars.push(`<span style="display:inline-block;width:${w}px;height:100%;background:${isBar?"#000":"transparent"};"></span>`);
  }
  const barcodeHtml = `
    <div style="text-align:center;margin:6px 0 2px;">
      <div style="display:inline-flex;align-items:stretch;height:${is58mm?"40px":"52px"};padding:0 4px;">${bars.join("")}</div>
      <div style="font-size:${subFontSize};letter-spacing:2px;margin-top:2px;">${escHtml(orderNum.slice(-16).padStart(16,"0"))}</div>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt — ${escHtml(orderNum)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: ${receiptSize} auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: ${bodyPadding};
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      font-weight: 700;
      line-height: 1.55;
      color: #000;
    }
    .st-center { text-align: center; }
    .st-sub    { font-size: ${subFontSize}; }
    .st-div    { border-top: 1px solid #666; margin: 4px 0; }
    .st-div-d  { border-top: 1px dashed #999; margin: 3px 0; }

    .st-store-name {
      text-align: center;
      font-weight: 900;
      font-size: ${is58mm ? "22px" : "28px"};
      letter-spacing: 1px;
      line-height: 1.15;
      margin-bottom: 3px;
    }
    .st-tagline {
      text-align: center;
      font-size: ${subFontSize};
      margin-bottom: 2px;
    }

    .st-sale-row {
      display: flex; justify-content: space-between;
      font-size: ${baseFontSize};
      margin: 2px 0;
    }
    .st-sale-label { font-weight: 700; }

    /* 3-column item grid: QTY | name+sku | price */
    .st-col-header {
      display: grid;
      grid-template-columns: ${is58mm ? "24px 1fr auto" : "28px 1fr auto"};
      gap: 4px;
      font-weight: 700;
      font-size: ${baseFontSize};
      border-bottom: 1px solid #666;
      padding-bottom: 2px;
      margin-bottom: 2px;
    }
    .st-item-row {
      display: grid;
      grid-template-columns: ${is58mm ? "24px 1fr auto" : "28px 1fr auto"};
      gap: 4px;
      font-size: ${baseFontSize};
      margin: 2px 0;
      align-items: start;
    }
    .st-qty   { }
    .st-name-sku { display: flex; flex-direction: column; }
    .st-name  { font-weight: 700; word-break: break-word; }
    .st-sku   { font-size: ${subFontSize}; color: #444; }
    .st-mod   { font-size: ${subFontSize}; color: #555; padding-left: 8px; }
    .st-price { text-align: right; white-space: nowrap; }

    .st-tot-row {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: ${baseFontSize}; margin: 1px 0;
    }
    .st-tot-label { }
    .st-tot-val   { text-align: right; white-space: nowrap; }
    .st-tot-row.st-total { font-weight: 900; font-size: ${is58mm?"13px":"14px"}; margin-top: 2px; }

    .st-pay-label  { font-size: ${baseFontSize}; font-weight: 700; margin: 3px 0 1px; }
    .st-pay-row    { display: flex; justify-content: space-between; gap: 6px; font-size: ${subFontSize}; margin: 0.5px 0; }
    .st-pay-single { font-size: ${subFontSize}; margin: 1px 0; }

    .st-items-sold {
      text-align: center;
      font-weight: 900;
      font-size: ${is58mm?"18px":"24px"};
      letter-spacing: 2px;
      margin: 10px 0 4px;
    }
    .st-customer-copy {
      text-align: center;
      font-weight: 700;
      letter-spacing: 2px;
      font-size: ${baseFontSize};
      margin-top: 4px;
    }
    .st-loyalty { font-weight: bold; font-size: ${baseFontSize}; margin: 5px 0 2px; }
    .st-note    { font-size: ${subFontSize}; font-style: italic; margin: 3px 0; }
    .st-refunded { color: red; font-weight: bold; text-align: center; font-size: 12px; border: 1px solid red; padding: 3px; margin: 4px 0; letter-spacing: 1px; }
    .st-powered { text-align: center; font-size: 8px; color: #aaa; margin-top: 6px; letter-spacing: 1px; }
  </style>
</head>
<body>

  ${logoHtml}
  <div class="st-store-name">${escHtml(businessName.toUpperCase())}</div>
  ${receiptFooter ? `<div class="st-tagline">${escHtml(receiptFooter)}</div>` : ""}
  ${addressLines.map(l => `<div class="st-center st-sub">${escHtml(l)}</div>`).join("")}
  ${businessPhone ? `<div class="st-center st-sub">${escHtml(businessPhone)}</div>` : ""}

  <div class="st-div"></div>

  <div class="st-sale-row">
    <span class="st-sale-label">SALE</span>
    <span class="st-sub" style="text-align:right;">${escHtml(orderNum)}<br>${escHtml(saleDate)}</span>
    <span class="st-sub" style="text-align:right;white-space:nowrap;">&nbsp;${escHtml(saleTime)}</span>
  </div>

  ${order.staffName ? `<div class="st-sub">Cashier: ${escHtml(order.staffName)}</div>` : ""}
  ${order.stationNumber != null ? `<div class="st-sub">Station: #${order.stationNumber}</div>` : ""}
  ${order.customerName ? `<div class="st-sub">Customer: ${escHtml(order.customerName)}</div>` : ""}

  <div class="st-div"></div>

  <div class="st-col-header">
    <span>QTY</span>
    <span>SKU</span>
    <span>PRICE</span>
  </div>

  ${itemRowsHtml}

  <div class="st-div"></div>

  <div class="st-tot-row"><span class="st-tot-label">SUBTOTAL</span><span class="st-tot-val">$${fmtNum(order.subtotal)}</span></div>
  ${discountLineHtml}
  ${order.tax > 0 ? `<div class="st-tot-row"><span class="st-tot-label">Simple Tax&nbsp;&nbsp;${escHtml(taxRate)}%</span><span class="st-tot-val">$${fmtNum(order.tax)}</span></div>` : ""}
  <div class="st-tot-row st-total"><span class="st-tot-label">TOTAL</span><span class="st-tot-val">$${fmtNum(order.total)}</span></div>
  ${secondaryLineHtml}

  <div class="st-div"></div>

  ${paymentBlockHtml}
  ${notesHtml}
  ${loyaltyHtml}
  ${refundedHtml}
  ${outstandingHtml}

  <div class="st-items-sold"># TOTAL ITEMS ${itemCount}</div>

  ${barcodeHtml}

  <div class="st-customer-copy">*** CUSTOMER COPY ***</div>
  <div class="st-powered">Powered by NEXXUS POS</div>

</body>
</html>`;
}

/**
 * Render the "hardware" receipt template — a half-letter (9in × 5.5in) landscape
 * sheet styled after a hardware / building-supply invoice (see the VALU FRAME
 * sample). Unlike the thermal templates this is a full sheet-fed page: centered
 * business header, a Bill-To block, a multi-column line-item table
 * (Item / Qty / Attribute / Size / Price / Ext Price), boxed totals, a payment
 * line, a CSS barcode and a footer. Every value is mapped from the live
 * ReceiptOrder / ReceiptSettings — nothing is hard-coded sample data.
 */
function buildHardwareReceiptHtml(
  order: ReceiptOrder,
  _settings: ReceiptSettings,
  ctx: ReceiptCtx,
): string {
  const {
    escHtml, fmt, fmtNum, dateStr, orderNum, businessName, businessAddress,
    businessPhone, businessLogoUrl, receiptFooter, taxRate, taxName,
    secondaryCurrency, exchangeRate,
  } = ctx;

  const addressLines = (businessAddress || "")
    .split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const logoHtml = businessLogoUrl
    ? `<div style="text-align:center;margin-bottom:4px;"><img src="${businessLogoUrl}" alt="${escHtml(businessName)}" style="max-height:54px;max-width:220px;object-fit:contain;" /></div>`
    : "";

  // Choices → comma-joined text for the Attribute / Size columns.
  const joinChoices = (
    choices: Array<{ optionName: string }> | null | undefined,
  ): string =>
    (choices ?? []).map(c => c.optionName).filter(Boolean).join(", ");

  // Item rows — Item Name | Qty | Attribute | Size | Price (unit) | Ext Price.
  const itemRowsHtml = order.items.map((item) => {
    const attribute = joinChoices(item.variantChoices as { optionName: string }[] | null);
    const size      = joinChoices(item.modifierChoices as { optionName: string }[] | null);
    const unit      = item.unitPrice != null
      ? item.unitPrice
      : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    return `
      <tr>
        <td class="hw-item">${escHtml(item.productName)}${uomHtml(item)}${item.notes && item.notes.trim() ? `<div style="font-size:9px;color:#444;font-style:italic;">Note: ${escHtml(item.notes.trim())}</div>` : ""}</td>
        <td class="hw-num">${fmtNum(item.quantity)}</td>
        <td class="hw-attr">${escHtml(attribute || "—")}</td>
        <td class="hw-attr">${escHtml(size || "—")}</td>
        <td class="hw-num">${fmtNum(unit)}</td>
        <td class="hw-num">${fmtNum(item.lineTotal)}</td>
      </tr>`;
  }).join("");

  const discountLineHtml = (order.discountValue ?? 0) > 0 ? `
    <div class="hw-tot-row">
      <span class="hw-tot-label">Discount</span>
      <span class="hw-tot-val" style="color:#c00;">-$${fmtNum(order.discountValue ?? 0)}</span>
    </div>` : "";

  const secondaryLineHtml = (secondaryCurrency && exchangeRate > 0) ? `
    <div class="hw-tot-row">
      <span class="hw-tot-label">≈ ${escHtml(secondaryCurrency)}</span>
      <span class="hw-tot-val">${fmt(order.total * exchangeRate, secondaryCurrency)}</span>
    </div>` : "";

  // Payment line — mirror the sample's single "Cash: $X" line, with change due
  // when the customer tendered more than the total.
  const isCash  = order.paymentMethod === "cash";
  const isSplit = order.paymentMethod === "split";
  const payLabel = (() => {
    if (isCash)  return "Cash";
    if (order.paymentMethod === "card" || order.paymentMethod === "credit") return "Card";
    if (isSplit) return "Split";
    if (order.paymentMethod === "topup")   return "Top-up";
    if (order.paymentMethod === "loyalty") return "Loyalty";
    return order.paymentMethod
      ? order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)
      : "Payment";
  })();
  // Tendered + Change Due only rendered when cashier entered the cash received.
  const paymentBlockHtml = isSplit
    ? `
      <div class="hw-tot-row"><span class="hw-tot-label">Card</span><span class="hw-tot-val">$${fmtNum(order.splitCardAmount ?? 0)}</span></div>
      <div class="hw-tot-row"><span class="hw-tot-label">Cash</span><span class="hw-tot-val">$${fmtNum(order.splitCashAmount ?? 0)}</span></div>`
    : `
      <div class="hw-tot-row"><span class="hw-tot-label">${escHtml(payLabel)}</span><span class="hw-tot-val">$${fmtNum(order.total)}</span></div>
      ${(isCash && order.cashTendered && order.cashTendered > 0) ? `
      <div class="hw-tot-row"><span class="hw-tot-label">Tendered</span><span class="hw-tot-val">$${fmtNum(order.cashTendered)}</span></div>
      <div class="hw-tot-row"><span class="hw-tot-label">Change Due</span><span class="hw-tot-val">$${fmtNum(Math.max(0, order.cashTendered - order.total))}</span></div>` : ""}`;

  const taxPct = parseFloat(taxRate) || 0;
  const refundedHtml = order.status === "refunded"
    ? `<div class="hw-refunded">★ REFUNDED ★</div>` : "";
  const notesHtml = order.notes
    ? `<div class="hw-note">Note: ${escHtml(order.notes)}</div>` : "";
  const outstandingHtml = (order.customerName && order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0)
    ? `<div class="hw-note" style="color:#c00;font-weight:700;">Account Balance Due: ${fmt(order.customerOutstandingBalance)}</div>` : "";

  // CSS barcode — deterministic from the order number (same approach as the
  // staple/supermarket templates).
  const seed = orderNum.repeat(8);
  const bars: string[] = [];
  for (let i = 0; i < 56; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const w = 1 + (code % 3);
    const isBar = (i + code) % 2 === 0;
    bars.push(`<span style="display:inline-block;width:${w}px;height:100%;background:${isBar ? "#000" : "transparent"};"></span>`);
  }
  const barcodeDigits = orderNum.replace(/\D/g, "") || orderNum;
  const barcodeHtml = `
    <div class="hw-barcode">
      <div style="display:inline-flex;align-items:stretch;height:34px;">${bars.join("")}</div>
      <div class="hw-barcode-num">${escHtml(barcodeDigits)}</div>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt — ${escHtml(orderNum)}</title>
  <meta charset="utf-8">
  <style>
    @page { size: 9in 5.5in; margin: 0.3in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      padding: 4px;
    }
    .hw-topbar {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      gap: 8px;
      align-items: start;
      margin-bottom: 6px;
    }
    .hw-meta-left  { font-size: 10px; }
    .hw-meta-right { font-size: 10px; text-align: right; }
    .hw-receipt-no { font-size: 14px; font-weight: 800; margin-bottom: 2px; }
    .hw-biz-name   { font-size: 17px; font-weight: 800; text-align: center; line-height: 1.15; }
    .hw-biz-line   { font-size: 10px; text-align: center; }
    .hw-rule { border: 0; border-top: 1px solid #000; margin: 5px 0; }
    .hw-billto { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
    .hw-billto span { font-weight: 400; }
    table.hw-items {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 4px;
    }
    table.hw-items th {
      text-align: left;
      font-weight: 700;
      border-bottom: 1px solid #000;
      padding: 2px 4px;
      white-space: nowrap;
    }
    table.hw-items td {
      padding: 2px 4px;
      vertical-align: top;
      border-bottom: 1px dotted #bbb;
    }
    .hw-item { width: 38%; word-break: break-word; }
    .hw-attr { width: 16%; }
    .hw-num  { text-align: right; white-space: nowrap; }
    th.hw-num { text-align: right; }
    .hw-totals {
      width: 46%;
      margin-left: auto;
      margin-top: 4px;
    }
    .hw-tot-row {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 11px; padding: 1px 0;
    }
    .hw-tot-label { }
    .hw-tot-val   { text-align: right; white-space: nowrap; }
    .hw-tot-row.hw-grand {
      font-size: 13px; font-weight: 800;
      border-top: 1px solid #000; border-bottom: 1px solid #000;
      padding: 3px 0; margin: 2px 0;
    }
    .hw-note { font-size: 10px; margin-top: 4px; }
    .hw-refunded { text-align: center; font-weight: 800; color: #c00; margin: 4px 0; }
    .hw-barcode { text-align: center; margin-top: 8px; }
    .hw-barcode-num { font-size: 10px; letter-spacing: 2px; margin-top: 2px; }
    .hw-footer { text-align: center; font-size: 11px; margin-top: 6px; }
    .hw-powered { text-align: center; font-size: 8px; color: #666; margin-top: 2px; }
  </style>
</head>
<body>
  ${logoHtml}
  <div class="hw-topbar">
    <div class="hw-meta-left">
      <div>Printed: ${escHtml(dateStr)}</div>
      ${order.staffName ? `<div>Cashier: ${escHtml(order.staffName)}</div>` : ""}
      ${order.stationNumber != null ? `<div>Station: #${order.stationNumber}</div>` : ""}
    </div>
    <div>
      <div class="hw-biz-name">${escHtml(businessName)}</div>
      ${addressLines.map(l => `<div class="hw-biz-line">${escHtml(l)}</div>`).join("")}
      ${businessPhone ? `<div class="hw-biz-line">Tel: ${escHtml(businessPhone)}</div>` : ""}
    </div>
    <div class="hw-meta-right">
      <div class="hw-receipt-no">Sales Receipt #${escHtml(orderNum)}</div>
      <div>${escHtml(dateStr)}</div>
      <div>Page 1</div>
    </div>
  </div>

  <hr class="hw-rule" />

  ${order.customerName ? `<div class="hw-billto">Bill To: <span>${escHtml(order.customerName)}</span></div>` : ""}

  <table class="hw-items">
    <thead>
      <tr>
        <th class="hw-item">Item Name</th>
        <th class="hw-num">Qty</th>
        <th class="hw-attr">Attribute</th>
        <th class="hw-attr">Size</th>
        <th class="hw-num">Price</th>
        <th class="hw-num">Ext Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
    </tbody>
  </table>

  <div class="hw-totals">
    <div class="hw-tot-row">
      <span class="hw-tot-label">Subtotal</span>
      <span class="hw-tot-val">$${fmtNum(order.subtotal)}</span>
    </div>
    ${discountLineHtml}
    <div class="hw-tot-row">
      <span class="hw-tot-label">${escHtml(taxName)} (${taxPct}%)</span>
      <span class="hw-tot-val">+$${fmtNum(order.tax)}</span>
    </div>
    <div class="hw-tot-row hw-grand">
      <span class="hw-tot-label">Receipt Total</span>
      <span class="hw-tot-val">${fmt(order.total)}</span>
    </div>
    ${secondaryLineHtml}
    ${paymentBlockHtml}
  </div>

  ${notesHtml}
  ${outstandingHtml}
  ${refundedHtml}

  ${barcodeHtml}

  <div class="hw-footer">${escHtml(receiptFooter)}</div>
  <div class="hw-powered">Powered by NEXXUS POS</div>
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
  if (order.staffName) lines.push(`🧑 Cashier: ${order.staffName}`);
  if (order.stationNumber != null) lines.push(`🏪 Station #${order.stationNumber}`);

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
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const unitStr = unit != null ? ` @ ${fmtNum(unit)}` : "";
    lines.push(`${item.quantity}× ${item.productName}${item.sellingUnit?.trim() ? ` (${item.sellingUnit.trim()})` : ""}${unitStr}  ${fmtNum(item.lineTotal)}`);
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      lines.push(`   ↳ You save (was ${fmtNum(orig)}) -${fmtNum(lineSaving)}`);
    }
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      lines.push(`   ↳ ${v.optionName}`);
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      lines.push(`   + ${m.optionName}`);
    }
    if (item.notes && item.notes.trim()) {
      lines.push(`   ↳ Note: ${item.notes.trim()}`);
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
  }
  // Only show Tendered / Total / Change when the cashier entered the cash received.
  if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
    lines.push(`Tendered:  ${fmtNum(order.cashTendered)}`);
    lines.push(`Total:    -${fmtNum(order.total)}`);
    lines.push(`Change:    ${fmtNum(Math.max(0, order.cashTendered - order.total))}`);
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

/**
 * Lightweight, image-free, plain-text receipt for printing through Android
 * ESC/POS pass-through print services (e.g. Looped Labs "ESC POS USB Print
 * Service"). Those services choke and crash when handed a heavy styled page
 * (logo image, giant order number, rich CSS) because the rendered bitmap is too
 * large. This builder strips all of that out: no logo, no big pickup number, no
 * colors — just compact monospace text sized to the paper width, which renders
 * to a small bitmap the service can reliably print.
 *
 * Used ONLY on Android (see `print-receipt.ts`); desktop/Windows keeps the full
 * styled receipt from `buildReceiptHtml`.
 */
export function buildPlainReceiptHtml(order: ReceiptOrder, settings: ReceiptSettings = {}): string {
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
  const is58mm            = receiptSize === "58mm";

  const fmt = (n: number, cur = baseCurrency) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n));
    } catch {
      return `${cur} ${Math.abs(n).toFixed(2)}`;
    }
  };
  const fmtNum = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const createdAt = typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const dateStr   = createdAt.toLocaleString("en-JM", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const orderNum  = String(order.orderNumber);

  const row = (left: string, right: string, cls = "") =>
    `<div class="r ${cls}"><span class="l">${left}</span><span class="v">${right}</span></div>`;

  // ── Items ────────────────────────────────────────────────────────────────
  const itemsHtml = order.items.map(item => {
    const unit = item.unitPrice != null ? item.unitPrice : (item.quantity ? item.lineTotal / item.quantity : item.lineTotal);
    const orig = item.originalUnitPrice;
    const unitStr = unit != null ? ` @ ${fmtNum(unit)}` : "";
    let html = row(`${item.quantity}&times; ${escHtml(item.productName)}${uomHtml(item)}${unitStr}`, fmtNum(item.lineTotal), "item");
    if (orig != null && unit != null && orig > unit) {
      const lineSaving = (orig - unit) * item.quantity;
      html += row(`&nbsp;&#8627; You save (was ${fmtNum(orig)})`, `-${fmtNum(lineSaving)}`, "sub");
    }
    for (const v of (item.variantChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="sub">&nbsp;&#8627; ${escHtml(v.optionName)}</div>`;
    }
    for (const m of (item.modifierChoices as { optionName: string }[] | null) ?? []) {
      html += `<div class="sub">&nbsp;+ ${escHtml(m.optionName)}</div>`;
    }
    if (item.notes && item.notes.trim()) {
      html += `<div class="sub">&nbsp;&#8627; Note: ${escHtml(item.notes.trim())}</div>`;
    }
    return html;
  }).join("");

  // ── Payment ──────────────────────────────────────────────────────────────
  // A gift voucher is a TENDER: it pays down `giftAmt`; `amountDue` is the rest.
  const giftAmt = order.giftVoucherAmount ?? 0;
  const amountDue = Math.max(0, Math.round((order.total - giftAmt) * 100) / 100);
  let paymentHtml = "";
  if (giftAmt > 0) {
    paymentHtml +=
      row(`Gift Voucher${order.giftVoucherCode ? ` (${escHtml(order.giftVoucherCode)})` : ""}`, `-${fmtNum(giftAmt)}`, "sub") +
      row("Amount Due", fmtNum(amountDue), "sub");
  }
  if (order.paymentMethod === "split") {
    paymentHtml +=
      row("Payment", "SPLIT", "sub") +
      row("&nbsp;&nbsp;Card", fmtNum(order.splitCardAmount ?? 0), "sub") +
      row("&nbsp;&nbsp;Cash", fmtNum(order.splitCashAmount ?? 0), "sub");
  } else if (order.paymentMethod !== "gift_voucher") {
    paymentHtml += row("Payment", escHtml((order.paymentMethod ?? "—").toUpperCase()), "sub");
  }
  // Only show Tendered / Total / Change when the cashier entered the cash received.
  if (order.paymentMethod === "cash" && order.cashTendered && order.cashTendered > 0) {
    const changeAmt = Math.max(0, order.cashTendered - amountDue);
    paymentHtml +=
      row("Tendered", fmtNum(order.cashTendered), "sub") +
      row("Total", `-${fmtNum(amountDue)}`, "sub") +
      row("Change", fmtNum(changeAmt), "sub");
  }

  // ── Optional blocks ──────────────────────────────────────────────────────
  const discountHtml = (order.discountValue ?? 0) > 0
    ? row("Discount", `-${fmtNum(order.discountValue ?? 0)}`, "sub") : "";
  const tierSavings  = totalTierSavings(order.items);
  const savingsHtml  = tierSavings > 0 ? row("You Save:", `-${fmtNum(tierSavings)}`, "sub") : "";
  const secondaryHtml = secondaryCurrency && exchangeRate > 0
    ? row(`&asymp;&nbsp;${escHtml(secondaryCurrency)}`, fmt(order.total * exchangeRate, secondaryCurrency), "sub") : "";
  const refundedHtml = order.status === "refunded" ? `<div class="center bold">*** REFUNDED ***</div>` : "";
  const notesHtml    = order.notes ? `<div class="sub">Note: ${escHtml(order.notes)}</div>` : "";

  let customerHtml = "";
  if (order.customerName) {
    customerHtml += `<div class="hr"></div>`;
    customerHtml += `<div class="bold">Customer: ${escHtml(order.customerName)}</div>`;
    if (order.customerPhone) customerHtml += `<div class="sub">Tel: ${escHtml(order.customerPhone)}</div>`;
    if (order.customerEmail) customerHtml += `<div class="sub">${escHtml(order.customerEmail)}</div>`;
    if (order.customerLoyaltyBalance != null) customerHtml += `<div class="sub">Loyalty: ${order.customerLoyaltyBalance} pts</div>`;
    if (order.customerOutstandingBalance != null && order.customerOutstandingBalance > 0) {
      customerHtml += `<div class="sub bold">Account Balance Due: ${fmt(order.customerOutstandingBalance)}</div>`;
    }
  }

  let loyaltyHtml = "";
  if (order.loyaltyPointsEarned || order.loyaltyPointsRedeemed) {
    loyaltyHtml += `<div class="hr"></div><div class="center bold">LOYALTY POINTS</div>`;
    if (order.loyaltyPointsEarned) loyaltyHtml += `<div class="center">+ ${order.loyaltyPointsEarned} pts earned</div>`;
    if (order.loyaltyPointsRedeemed) loyaltyHtml += `<div class="center">- ${order.loyaltyPointsRedeemed} pts redeemed</div>`;
  }

  const addressHtml = (businessAddress || businessPhone)
    ? `<div class="hr"></div>` +
      (businessAddress ? `<div class="center sub">${escHtml(businessAddress)}</div>` : "") +
      (businessPhone   ? `<div class="center sub">Tel: ${escHtml(businessPhone)}</div>` : "")
    : "";

  const fontSize = is58mm ? "11px" : "12px";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt &ndash; ${escHtml(orderNum)}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Pin the page to the exact thermal paper width with NO page margins so
       Android ESC/POS pass-through print services (Looped Labs) rasterise a
       small, clean strip instead of a Letter/A4-sized canvas (which crashes
       them). margin:0 + an explicit body width are the two critical levers. */
    @page { size: ${receiptSize} auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${receiptSize}; max-width: ${receiptSize}; background: #fff; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize};
      font-weight: 700;
      line-height: 1.35;
      color: #000;
      padding: 0 2mm 4mm;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .name { text-align: center; font-weight: 700; font-size: ${is58mm ? "13px" : "14px"}; margin-bottom: 2px; }
    .r { display: flex; justify-content: space-between; gap: 6px; }
    .r .l { flex: 1; word-break: break-word; }
    .r .v { white-space: nowrap; }
    .item { font-weight: 700; margin-top: 2px; }
    .sub { font-size: ${is58mm ? "10px" : "11px"}; }
    .total { font-weight: 700; font-size: ${is58mm ? "13px" : "14px"}; margin: 2px 0; }
    .hr { border-top: 1px dashed #000; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="name">${escHtml(businessName)}</div>
  <div class="center bold">${order.orderType ? escHtml(order.orderType) : "Sale"}${order.guestCount ? ` &middot; ${order.guestCount} Guest${order.guestCount !== 1 ? "s" : ""}` : ""}</div>
  <div class="center sub">Order #: ${escHtml(orderNum)}</div>
  ${order.staffName ? `<div class="center sub">Cashier: ${escHtml(order.staffName)}</div>` : ""}
  ${order.stationNumber != null ? `<div class="center sub">Station: #${order.stationNumber}</div>` : ""}
  <div class="center sub">${dateStr}</div>
  ${customerHtml}
  <div class="hr"></div>
  ${itemsHtml}
  <div class="hr"></div>
  ${row("Subtotal:", fmtNum(order.subtotal), "sub")}
  ${discountHtml}
  ${savingsHtml}
  ${row(`${escHtml(taxName)} (${escHtml(taxRate)}%):`, fmtNum(order.tax), "sub")}
  ${row("Total:", fmt(order.total), "total")}
  ${secondaryHtml}
  <div class="hr"></div>
  ${paymentHtml}
  ${notesHtml}
  ${refundedHtml}
  ${loyaltyHtml}
  ${addressHtml}
  <div class="hr"></div>
  <div class="center sub">${escHtml(receiptFooter)}</div>
  <div class="center sub">Powered by NEXXUS POS</div>
</body>
</html>`;
}

// sessionStorage key shared with KioskLock in App.tsx.
// Set to "1" while the browser print dialog is open so the kiosk's
// fullscreenchange handler knows the exit was intentional (not an escape).
const KIOSK_PRINTING_KEY = "nexxus_kiosk_printing";

/** Mark printing as in-progress so KioskLock skips the PIN gate. */
function setPrintingFlag(): void {
  try { sessionStorage.setItem(KIOSK_PRINTING_KEY, "1"); } catch { /* ignore */ }
}

/** Clear the printing flag. Called after afterprint fires or on timeout. */
function clearPrintingFlag(): void {
  try { sessionStorage.removeItem(KIOSK_PRINTING_KEY); } catch { /* ignore */ }
}

export function openReceiptWindow(html: string, opts?: { receiptPageSize?: string }): void {
  // DESKTOP: hidden same-origin iframe. The print dialog is triggered exactly
  // once from the iframe's `load` handler below. We deliberately do NOT inject a
  // separate auto-print script into the iframe HTML — doing both made the print
  // preview re-open a second time after the first print finished.
  if (!opts?.receiptPageSize) {
    const iframe = document.createElement('iframe');
    iframe.id = 'nexus-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    let printed = false;
    const cleanup = () => setTimeout(() => { iframe.parentNode?.removeChild(iframe); }, 1000);
    iframe.addEventListener('load', () => {
      if (printed) return; // guard against any duplicate load events
      printed = true;
      const cw = iframe.contentWindow;
      if (cw) { cw.focus(); setTimeout(() => { try { cw.print(); } catch { /* ignore */ } cleanup(); }, 100); }
      else { cleanup(); }
    });
    iframe.srcdoc = html;
    return;
  }

  // ANDROID CHROME: blob URL with embedded auto-print script
  // document.write() to a blank window hangs Chrome Android print preview.
  // Loading from a blob URL works reliably.
  const receiptSize = opts.receiptPageSize ?? '80mm';
  let fullHtml = html;
  if (!fullHtml.includes('@page')) {
    fullHtml = fullHtml.replace('</head>', `<style>@page{size:${receiptSize} auto;margin:0;}</style></head>`);
  }
  // Embed auto-print + auto-close script inside the receipt page itself
  const autoScript = `<scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);window.addEventListener('afterprint',function(){window.close();});setTimeout(function(){window.close();},120000);})<\/scr` + `ipt>`;
  const printableHtml = fullHtml.includes('</body>') ? fullHtml.replace('</body>', autoScript + '</body>') : fullHtml + autoScript;
  const blob = new Blob([printableHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  // Clean up blob URL after a minute
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  if (!newWin) {
    // Popup blocked - user must tap the blob URL manually
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
  }
}

/** A single line on a refund slip — what was returned, how many, at what price. */
export interface RefundReceiptLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  /** Money refunded for this line (gross of the item: quantity × unitPrice). */
  amount: number;
  sellingUnit?: string | null;
}

/**
 * Data for a dedicated refund slip. Distinct from a full sale receipt: it shows
 * only the items being returned, the amount refunded, the reason, and how the
 * money was returned (cash or store-credit voucher).
 */
export interface RefundReceiptData {
  orderNumber: string;
  /** When the original sale happened (printed for reference). */
  originalDate?: string | Date | null;
  /** When this refund was processed. */
  refundDate: string | Date;
  staffName?: string | null;
  stationNumber?: number | null;
  customerName?: string | null;
  items: RefundReceiptLine[];
  /** Tax/discount-aware breakdown of the refund; optional (only known at refund time, not on reprint). */
  subtotalRefunded?: number | null;
  taxRefunded?: number | null;
  discountRefunded?: number | null;
  /** Authoritative total returned to the customer (tax + discounts accounted for). */
  refundTotal: number;
  reason?: string | null;
  refundMethod?: "cash" | "voucher" | null;
  voucherCode?: string | null;
  voucherBalance?: number | null;
  fullyRefunded?: boolean;
  isReprint?: boolean;
}

/**
 * Build the HTML for a dedicated refund slip. Image-free and text-only by
 * design so it prints safely on Android ESC/POS pass-through services and on
 * desktop thermal/inkjet printers alike. Honors receipt size (58mm/80mm) and
 * the business header/footer from settings.
 */
export function buildRefundReceiptHtml(data: RefundReceiptData, settings: ReceiptSettings = {}): string {
  const baseCurrency    = settings.base_currency    || "JMD";
  const businessName    = settings.business_name    || "NEXXUS POS";
  const businessAddress = settings.business_address || "";
  const businessPhone   = settings.business_phone   || "";
  const receiptFooter   = settings.receipt_footer   || "Thank you for your business!";
  const receiptSize     = settings.receipt_size     || "80mm";
  const taxName         = settings.tax_name         || "GCT";
  const is58mm          = receiptSize === "58mm";

  const fmt = (n: number, cur = baseCurrency) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n)); }
    catch { return `${cur} ${Math.abs(n).toFixed(2)}`; }
  };
  const fmtNum = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string | Date | null | undefined) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleString("en-JM", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  };

  const itemsHtml = data.items.map((it) => {
    const uom = it.sellingUnit?.trim() ? ` (${escHtml(it.sellingUnit.trim())})` : "";
    const qtyStr = Number.isInteger(it.quantity)
      ? String(it.quantity)
      : it.quantity.toFixed(3).replace(/\.?0+$/, "");
    return `
      <div class="rf-item">
        <div class="rf-item-name">${escHtml(it.productName)}${uom}</div>
        <div class="rf-item-line"><span>${qtyStr} &times; ${fmtNum(it.unitPrice)}</span><span>${fmtNum(it.amount)}</span></div>
      </div>`;
  }).join("");

  const breakdownRows: string[] = [];
  if (data.subtotalRefunded != null) {
    breakdownRows.push(`<div class="rf-row"><span>Items refunded</span><span>${fmtNum(data.subtotalRefunded)}</span></div>`);
  }
  if (data.discountRefunded != null && Math.abs(data.discountRefunded) > 0.001) {
    breakdownRows.push(`<div class="rf-row"><span>Discount reversed</span><span>-${fmtNum(data.discountRefunded)}</span></div>`);
  }
  if (data.taxRefunded != null && Math.abs(data.taxRefunded) > 0.001) {
    breakdownRows.push(`<div class="rf-row"><span>${escHtml(taxName)} refunded</span><span>${fmtNum(data.taxRefunded)}</span></div>`);
  }

  const methodHtml = data.refundMethod === "voucher"
    ? `<div class="rf-method"><div class="rf-row"><span>Refund method</span><span>Store credit</span></div>${
        data.voucherCode ? `<div class="rf-row"><span>Voucher</span><span>${escHtml(data.voucherCode)}</span></div>` : ""
      }${
        data.voucherBalance != null ? `<div class="rf-row"><span>Voucher balance</span><span>${fmt(data.voucherBalance)}</span></div>` : ""
      }</div>`
    : data.refundMethod === "cash"
      ? `<div class="rf-method"><div class="rf-row"><span>Refund method</span><span>Cash</span></div></div>`
      : "";

  const cashierHtml  = data.staffName ? `<div class="rf-meta"><span>Cashier</span><span>${escHtml(data.staffName)}</span></div>` : "";
  const stationHtml  = data.stationNumber != null ? `<div class="rf-meta"><span>Station</span><span>#${data.stationNumber}</span></div>` : "";
  const customerHtml = data.customerName ? `<div class="rf-meta"><span>Customer</span><span>${escHtml(data.customerName)}</span></div>` : "";
  const reasonHtml   = data.reason?.trim()
    ? `<div class="rf-reason"><div class="rf-reason-label">Reason</div><div>${escHtml(data.reason.trim())}</div></div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Refund ${escHtml(data.orderNumber)}</title>
  <style>
    @page { size: ${receiptSize} auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; width: ${is58mm ? "54mm" : "76mm"}; margin: 0 auto; padding: ${is58mm ? "4px 6px 14px" : "6px 8px 16px"}; color: #000; font-size: 12px; line-height: 1.35; }
    .rf-center { text-align: center; }
    .rf-biz { font-size: 14px; font-weight: 800; }
    .rf-sub { font-size: 10px; }
    .rf-badge { margin: 6px 0; text-align: center; color: #c00; font-weight: 900; border: 2px solid #c00; padding: 3px; letter-spacing: 1px; font-size: 13px; }
    .rf-hr { border-top: 1px dashed #000; margin: 6px 0; }
    .rf-meta, .rf-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
    .rf-item { margin: 3px 0; }
    .rf-item-name { font-weight: 600; }
    .rf-item-line { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
    .rf-total { display: flex; justify-content: space-between; gap: 8px; font-weight: 800; font-size: 13px; margin-top: 4px; }
    .rf-method { margin-top: 4px; }
    .rf-reason { margin-top: 6px; font-size: 11px; }
    .rf-reason-label { font-weight: 700; }
    .rf-footer { text-align: center; margin-top: 8px; font-size: 10px; }
    .rf-reprint { text-align: center; font-size: 10px; font-style: italic; margin-top: 4px; }
  </style></head>
  <body>
    <div class="rf-center rf-biz">${escHtml(businessName)}</div>
    ${businessAddress ? `<div class="rf-center rf-sub">${escHtml(businessAddress)}</div>` : ""}
    ${businessPhone ? `<div class="rf-center rf-sub">${escHtml(businessPhone)}</div>` : ""}
    <div class="rf-badge">${data.fullyRefunded ? "FULL REFUND" : "PARTIAL REFUND"}</div>
    <div class="rf-meta"><span>Order</span><span>${escHtml(data.orderNumber)}</span></div>
    ${data.originalDate ? `<div class="rf-meta"><span>Sold</span><span>${fmtDate(data.originalDate)}</span></div>` : ""}
    <div class="rf-meta"><span>Refunded</span><span>${fmtDate(data.refundDate)}</span></div>
    ${cashierHtml}
    ${stationHtml}
    ${customerHtml}
    <div class="rf-hr"></div>
    ${itemsHtml}
    <div class="rf-hr"></div>
    ${breakdownRows.join("")}
    <div class="rf-total"><span>TOTAL REFUNDED</span><span>${fmt(data.refundTotal)}</span></div>
    ${methodHtml}
    ${reasonHtml}
    <div class="rf-hr"></div>
    <div class="rf-footer">${escHtml(receiptFooter)}</div>
    ${data.isReprint ? `<div class="rf-reprint">*** REPRINT ***</div>` : ""}
  </body></html>`;
}
