import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { logAudit } from "./audit";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, diningTablesTable, locationInventoryTable, accountsReceivableTable, recipesTable, recipeIngredientsTable, ingredientsTable, ingredientUsageLogsTable, stockMovementsTable, productPricingTiersTable, paymentMethodsTable, compositeProductComponentsTable, variantOptionsTable, variantGroupsTable, variantCombinationsTable, productBatchesTable, giftVouchersTable, giftVoucherTransactionsTable, staffTable } from "@workspace/db";
import { generateVoucherCode, isUniqueViolation, normalizeVoucher } from "../lib/vouchers";
import { applyVolumePricing } from "../lib/pricing";
import { getSetting } from "./settings";
import { logger } from "../lib/logger";
import { sendTemplateEmail } from "./email-templates";

/**
 * Thrown inside the order transaction when an item cannot be sold because
 * doing so would push stock below zero (and overselling is disabled).
 * Carries enough info for the POS to show "only X available".
 */
class InsufficientStockError extends Error {
  constructor(
    public productId: number,
    public productName: string,
    public available: number,
    public requested: number,
  ) {
    super(`Insufficient stock for ${productName}`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Thrown when selling a composite (bundle) parent fails because one of
 * its child components is short on stock. Distinct from
 * InsufficientStockError so the POS can show a clearer message — the
 * customer scanned the parent SKU but it's the *child* that ran out.
 */
class InsufficientComponentStockError extends Error {
  constructor(
    public parentProductId: number,
    public parentName: string,
    public childProductId: number | null,
    public childName: string,
    public available: number,
    public requested: number,
  ) {
    super(`Insufficient component stock for ${parentName}`);
    this.name = "InsufficientComponentStockError";
  }
}

class PaymentMethodDisabledError extends Error {
  constructor(public method: string) {
    super(`Payment method "${method}" is not enabled`);
    this.name = "PaymentMethodDisabledError";
  }
}

/**
 * Thrown inside the order transaction when a gift voucher cannot be redeemed
 * (not found, wrong tenant, cancelled/expired/zero balance). Rolls the whole
 * sale back so stock is never deducted against a failed redemption. `reason`
 * is a stable machine code the POS can switch on; `message` is user-facing.
 */
class VoucherRedemptionError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = "VoucherRedemptionError";
  }
}

import {
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  UpdateOrderStatusResponse,
  ListOrdersResponse,
  ListOrdersQueryParams,
  ChargeOrderParams,
  ChargeOrderBody,
  ChargeOrderResponse,
  RefundOrderItemsParams,
  RefundOrderItemsBody,
  RefundOrderItemsResponse,
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { findActivePromoPrices } from "./promotions";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function normalizeOrder(order: typeof ordersTable.$inferSelect) {
  return {
    ...order,
    kitchenStatus: order.kitchenStatus ?? undefined,
    discountType: order.discountType ?? undefined,
    discountAmount: order.discountAmount ?? undefined,
    discountValue: order.discountValue ?? undefined,
    paymentMethod: order.paymentMethod ?? undefined,
    cardType: order.cardType ?? undefined,
    splitCardAmount: order.splitCardAmount ?? undefined,
    splitCashAmount: order.splitCashAmount ?? undefined,
    cashTendered: order.cashTendered ?? undefined,
    giftVoucherId: order.giftVoucherId ?? undefined,
    giftVoucherCode: order.giftVoucherCode ?? undefined,
    giftVoucherAmount: order.giftVoucherAmount ?? undefined,
    notes: order.notes ?? undefined,
    voidReason: order.voidReason ?? undefined,
    refundMethod: order.refundMethod ?? undefined,
    refundedAt: order.refundedAt ?? undefined,
    customerId: order.customerId ?? undefined,
    tableId: order.tableId ?? undefined,
    staffId: order.staffId ?? undefined,
    orderType: order.orderType ?? undefined,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed ?? undefined,
    loyaltyDiscount: order.loyaltyDiscount ?? undefined,
    completedAt: order.completedAt ?? undefined,
  };
}

/**
 * Look up the current free-text selling unit / UOM label for a set of product
 * ids. Returned so order-item responses can surface it on the POS + receipts.
 * Empty productIds → empty map (no query).
 */
async function sellingUnitMap(tenantId: number, productIds: number[]): Promise<Map<number, string | null>> {
  const ids = [...new Set(productIds)].filter((n): n is number => typeof n === "number");
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: productsTable.id, sellingUnit: productsTable.sellingUnit })
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, ids)));
  return new Map(rows.map((r) => [r.id, r.sellingUnit ?? null]));
}

async function getOrderWithItems(orderId: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));

  const suMap = await sellingUnitMap(order.tenantId, items.map((i) => i.productId));

  // Resolve the cashier's display name from staffId so receipts can print it.
  // The orders table only stores staffId; the name lives on the staff row.
  let staffName: string | null = null;
  if (order.staffId) {
    const [st] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(and(eq(staffTable.id, order.staffId), eq(staffTable.tenantId, order.tenantId)));
    staffName = st?.name ?? null;
  }

  return {
    ...normalizeOrder(order),
    staffName,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      refundedQuantity: item.refundedQuantity ?? undefined,
      unitPrice: item.unitPrice,
      originalUnitPrice: item.originalUnitPrice ?? undefined,
      discountAmount: item.discountAmount ?? undefined,
      variantAdjustment: item.variantAdjustment ?? undefined,
      modifierAdjustment: item.modifierAdjustment ?? undefined,
      variantChoices: (item.variantChoices as any[] | null) ?? undefined,
      modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
      lineTotal: item.lineTotal,
      notes: item.notes ?? undefined,
      sellingUnit: suMap.get(item.productId) ?? undefined,
    })),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Jamaica is UTC-5 year-round (no DST). Local midnight = T05:00:00.000Z in UTC.
  const jamaicaDayStart = (dateStr: string) => new Date(`${dateStr}T05:00:00.000Z`);
  const jamaicaDayEnd   = (dateStr: string) => {
    const d = jamaicaDayStart(dateStr);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };

  const conditions = [eq(ordersTable.tenantId, tenantId)];
  if (query.data.status) conditions.push(eq(ordersTable.status, query.data.status));
  if (query.data.from) {
    conditions.push(gte(ordersTable.createdAt, jamaicaDayStart(query.data.from)));
  }
  if (query.data.to) {
    conditions.push(lt(ordersTable.createdAt, jamaicaDayEnd(query.data.to)));
  }
  if (query.data.staffId) {
    conditions.push(eq(ordersTable.staffId, query.data.staffId));
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt));

  const ordersWithItemsRaw = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return { order, items };
    }),
  );

  // One tenant-scoped lookup for every product referenced across the page,
  // instead of a per-order query, to avoid worsening the existing N+1.
  const suMap = await sellingUnitMap(
    tenantId,
    ordersWithItemsRaw.flatMap((o) => o.items.map((i) => i.productId)),
  );

  // Resolve cashier display names in one tenant-scoped query (avoids N+1) so
  // receipts reprinted from order history can show the cashier name.
  const listStaffIds = [
    ...new Set(
      ordersWithItemsRaw
        .map((o) => o.order.staffId)
        .filter((id): id is number => id != null),
    ),
  ];
  const staffRows = listStaffIds.length
    ? await db
        .select({ id: staffTable.id, name: staffTable.name })
        .from(staffTable)
        .where(and(eq(staffTable.tenantId, tenantId), inArray(staffTable.id, listStaffIds)))
    : [];
  const staffNameMap = new Map(staffRows.map((s) => [s.id, s.name]));

  const ordersWithItems = ordersWithItemsRaw.map(({ order, items }) => ({
    ...normalizeOrder(order),
    staffName: order.staffId != null ? (staffNameMap.get(order.staffId) ?? null) : null,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      refundedQuantity: item.refundedQuantity ?? undefined,
      unitPrice: item.unitPrice,
      originalUnitPrice: item.originalUnitPrice ?? undefined,
      discountAmount: item.discountAmount ?? undefined,
      variantAdjustment: item.variantAdjustment ?? undefined,
      modifierAdjustment: item.modifierAdjustment ?? undefined,
      variantChoices: (item.variantChoices as any[] | null) ?? undefined,
      modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
      lineTotal: item.lineTotal,
      notes: item.notes ?? undefined,
      sellingUnit: suMap.get(item.productId) ?? undefined,
    })),
  }));

  res.json(ListOrdersResponse.parse(ordersWithItems));
});

router.post("/orders", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Reject any non-positive item quantity early. The DB column is `real`
  // so decimal weights are allowed (e.g. 1.75 kg) but never <= 0.
  for (const item of parsed.data.items) {
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      res.status(400).json({
        error: "INVALID_QUANTITY",
        message: `Quantity for ${item.productId != null ? `product ${item.productId}` : "custom item"} must be a positive number`,
      });
      return;
    }
  }

  // Validate payment method is enabled for this tenant (when one is given).
  // Built-in types (cash, card, split, credit) are always permitted if no
  // payment_methods rows exist at all (back-compat for tenants pre-config).
  // "gift_voucher" is a system tender (used when a voucher covers the whole
  // sale) — never a configurable method, so it bypasses this check.
  if (parsed.data.paymentMethod && parsed.data.paymentMethod !== "gift_voucher") {
    const enabled = await db
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(and(
        eq(paymentMethodsTable.tenantId, tenantId),
        eq(paymentMethodsTable.isEnabled, true),
      ));
    if (enabled.length > 0) {
      const enabledTypes = await db
        .select({ type: paymentMethodsTable.type, name: paymentMethodsTable.name })
        .from(paymentMethodsTable)
        .where(and(
          eq(paymentMethodsTable.tenantId, tenantId),
          eq(paymentMethodsTable.isEnabled, true),
        ));
      const ok = enabledTypes.some(
        m => m.type === parsed.data.paymentMethod || m.name.toLowerCase() === parsed.data.paymentMethod!.toLowerCase()
      );
      if (!ok) {
        res.status(400).json({
          error: "PAYMENT_METHOD_DISABLED",
          message: `Payment method "${parsed.data.paymentMethod}" is not enabled`,
        });
        return;
      }
    }
  }

  let rawSubtotal = 0;
  let taxableRawSubtotal = 0;
  // Promo lines are excluded from order-level discount allocation so they
  // remain truly "locked" (no stacked discounts on top of the promo price).
  // We also track the *taxable* portion of the non-promo subtotal so the
  // discount's tax allocation only reduces tax on the non-promo bucket.
  let nonPromoRawSubtotal = 0;
  let nonPromoTaxableRawSubtotal = 0;

  // Bulk-fetch active promos ONCE with a single timestamp so every line in
  // the order resolves against the same instant (prevents boundary races at
  // promo start/end times and avoids per-item N+1 queries).
  const orderProductIds = parsed.data.items
    .map((i) => i.productId)
    .filter((id): id is number => typeof id === "number");
  const activePromos = await findActivePromoPrices(tenantId, orderProductIds);
  type ChoiceItem = { groupId: number; groupName: string; optionId: number; optionName: string; priceAdjustment: number };
  const resolvedItems: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    discountAmount: number | undefined;
    variantAdjustment: number | undefined;
    modifierAdjustment: number | undefined;
    variantChoices: ChoiceItem[] | undefined;
    modifierChoices: ChoiceItem[] | undefined;
    lineTotal: number;
    notes: string | undefined;
    /** Custom/miscellaneous item not in the catalog: no product lookup,
     * no stock/promo/tier/recipe side effects. Stored with productId 0. */
    isCustom?: boolean;
  }> = [];

  for (const item of parsed.data.items) {
    // ── Custom / miscellaneous item (not in the catalog) ─────────────────
    // No product lookup, promo, tier, stock, or recipe logic. The cashier
    // supplies the price (and optionally a name); it is taxable by default
    // and stored with the sentinel productId 0 (order_items has no FK).
    if (item.productId == null) {
      const customPrice = item.customPrice;
      if (typeof customPrice !== "number" || !Number.isFinite(customPrice) || customPrice < 0) {
        res.status(400).json({
          error: "INVALID_CUSTOM_PRICE",
          message: "A custom item requires a non-negative customPrice",
        });
        return;
      }
      const customName = (item.customName ?? "").trim() || "Custom Item";
      const itemDiscount = item.discountAmount ?? 0;
      const lineTotal = Math.max(0, customPrice * item.quantity - itemDiscount);
      rawSubtotal += lineTotal;
      nonPromoRawSubtotal += lineTotal;
      taxableRawSubtotal += lineTotal;
      nonPromoTaxableRawSubtotal += lineTotal;
      resolvedItems.push({
        productId: 0,
        productName: customName,
        quantity: item.quantity,
        unitPrice: customPrice,
        originalUnitPrice: customPrice,
        discountAmount: itemDiscount > 0 ? itemDiscount : undefined,
        variantAdjustment: undefined,
        modifierAdjustment: undefined,
        variantChoices: undefined,
        modifierChoices: undefined,
        lineTotal,
        notes: undefined,
        isCustom: true,
      });
      continue;
    }

    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }

    const variantAdj = (item.variantChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const modifierAdj = (item.modifierChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);

    // Time-based promotions take precedence over volume tiers and lock the line
    // price: any client-side itemDiscount on a promo line is ignored so the
    // promo price is the final unit price. The active-promos map was resolved
    // once above against a single timestamp, so order lines are consistent.
    const promoPrice = activePromos.get(product.id);
    const isPromoLine = promoPrice !== undefined;

    let tierUnitPrice: number;
    let itemDiscount: number;
    if (isPromoLine) {
      tierUnitPrice = promoPrice!;
      itemDiscount = 0;
    } else {
      const tiers = await db
        .select()
        .from(productPricingTiersTable)
        .where(and(
          eq(productPricingTiersTable.tenantId, tenantId),
          eq(productPricingTiersTable.productId, product.id),
        ));
      const tierResult = applyVolumePricing(product.price, item.quantity, tiers);
      tierUnitPrice = tierResult.unitPrice;
      itemDiscount = item.discountAmount ?? 0;
    }

    const effectiveUnitPrice = tierUnitPrice + variantAdj + modifierAdj;
    const lineTotal = Math.max(0, effectiveUnitPrice * item.quantity - itemDiscount);
    rawSubtotal += lineTotal;
    if (!isPromoLine) nonPromoRawSubtotal += lineTotal;
    if (product.isTaxable !== false) {
      taxableRawSubtotal += lineTotal;
      if (!isPromoLine) nonPromoTaxableRawSubtotal += lineTotal;
    }
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: tierUnitPrice,
      originalUnitPrice: product.price,
      discountAmount: itemDiscount > 0 ? itemDiscount : undefined,
      variantAdjustment: variantAdj !== 0 ? variantAdj : undefined,
      modifierAdjustment: modifierAdj !== 0 ? modifierAdj : undefined,
      variantChoices: item.variantChoices && item.variantChoices.length > 0 ? item.variantChoices : undefined,
      modifierChoices: item.modifierChoices && item.modifierChoices.length > 0 ? item.modifierChoices : undefined,
      lineTotal,
      notes: item.notes || undefined,
    });
  }

  // Order-level discount allocation: promo lines are locked, so the discount
  // is computed against (and capped by) the non-promo subtotal only. Percent
  // discounts are applied to the non-promo portion to honor "promo replaces
  // and locks price — no stacked discounts".
  let discountValue = 0;
  if (parsed.data.discountAmount && parsed.data.discountType) {
    discountValue =
      parsed.data.discountType === "percent"
        ? nonPromoRawSubtotal * (parsed.data.discountAmount / 100)
        : parsed.data.discountAmount;
    discountValue = Math.min(discountValue, nonPromoRawSubtotal);
  }

  const LOYALTY_REDEEM_RATE = 100;
  const pointsToRedeem = parsed.data.loyaltyPointsToRedeem ?? 0;
  const loyaltyDiscount = pointsToRedeem > 0 ? Math.round((pointsToRedeem / LOYALTY_REDEEM_RATE) * 100) / 100 : 0;

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const discountedSubtotal = Math.max(0, rawSubtotal - discountValue - loyaltyDiscount);

  const taxRateValue = await getSetting("tax_rate", tenantId);
  const taxRate = parseFloat(taxRateValue || "15") / 100;
  const taxModeValue = (await getSetting("tax_mode", tenantId)) ?? "exclusive";
  const allowOverselling = (await getSetting("allow_overselling", tenantId)) === "true";

  // Apply order-level discount/loyalty proportionally to the taxable bucket
  // so that non-taxable items never inflate the tax base. Promo lines are
  // locked, so the discount's taxable share is computed from the non-promo
  // taxable portion only — preventing the discount from indirectly reducing
  // the promo line's contribution to the tax base.
  const taxableFraction = nonPromoRawSubtotal > 0
    ? nonPromoTaxableRawSubtotal / nonPromoRawSubtotal
    : (rawSubtotal > 0 ? taxableRawSubtotal / rawSubtotal : 1);
  const taxableDiscountedSubtotal = Math.max(
    0,
    taxableRawSubtotal - discountValue * taxableFraction - loyaltyDiscount * taxableFraction,
  );
  const tax = taxModeValue === "inclusive"
    ? Math.round(taxableDiscountedSubtotal * taxRate / (1 + taxRate) * 100) / 100
    : Math.round(taxableDiscountedSubtotal * taxRate * 100) / 100;
  const total = taxModeValue === "inclusive"
    ? Math.round(discountedSubtotal * 100) / 100
    : Math.round((discountedSubtotal + tax) * 100) / 100;

  const isOpenOrder = parsed.data.orderType === "dine-in" && !parsed.data.paymentMethod;
  const isPaid = !!parsed.data.paymentMethod;

  // Generate sequential order number: ORD-YY-DD-XXXXXX
  // Jamaica is UTC-5 year-round; shift UTC time back 5 hours to get local date
  const nowJamaica = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const yymm = String(nowJamaica.getUTCFullYear()).slice(-2) + String(nowJamaica.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowJamaica.getUTCDate()).padStart(2, "0");
  // Count orders already placed today (Jamaica time) for this tenant to get next seq
  const dayStart = new Date(`${nowJamaica.getUTCFullYear()}-${String(nowJamaica.getUTCMonth() + 1).padStart(2, "0")}-${String(nowJamaica.getUTCDate()).padStart(2, "0")}T05:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const [{ todayCount }] = await db
    .select({ todayCount: sql<number>`cast(count(*) as int)` })
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tenantId), gte(ordersTable.createdAt, dayStart), lt(ordersTable.createdAt, dayEnd)));
  const seq = String((todayCount ?? 0) + 1).padStart(6, "0");
  const orderNumber = `ORD-${yymm}-${dd}-${seq}`;

  // ──────────────────────────────────────────────────────────────────────
  // Everything that mutates the DB happens inside a single transaction.
  // If any per-item stock check fails (and overselling is off) we throw
  // InsufficientStockError; the transaction rolls back cleanly and the
  // POS gets a structured 409 it can surface in a modal.
  // ──────────────────────────────────────────────────────────────────────
  let order: typeof ordersTable.$inferSelect;
  try {
    order = await db.transaction(async (tx) => {
      // 0. Pre-fetch structure type for every product in the order so
      //    the loops below can dispatch on simple vs composite without
      //    issuing N extra round-trips. Composite parents have stock
      //    deducted from their *children*, not themselves.
      const productIds = Array.from(new Set(resolvedItems.map(i => i.productId)));
      const productMeta = productIds.length === 0 ? [] : await tx
        .select({
          id: productsTable.id,
          structureType: productsTable.structureType,
          trackBatches: productsTable.trackBatches,
          stockMethodOverride: productsTable.stockMethodOverride,
        })
        .from(productsTable)
        .where(and(
          inArray(productsTable.id, productIds),
          eq(productsTable.tenantId, tenantId),
        ));
      const metaMap = new Map(productMeta.map(p => [p.id, p]));

      const compositeParentIds = productMeta
        .filter(p => p.structureType === "composite")
        .map(p => p.id);
      const componentsByParent = new Map<number, Array<{
        childProductId: number;
        quantityRequired: number;
        childName: string;
      }>>();
      if (compositeParentIds.length > 0) {
        const compRows = await tx
          .select({
            parentId: compositeProductComponentsTable.parentProductId,
            childId: compositeProductComponentsTable.childProductId,
            qty: compositeProductComponentsTable.quantityRequired,
            childName: productsTable.name,
          })
          .from(compositeProductComponentsTable)
          .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
          .where(and(
            eq(compositeProductComponentsTable.tenantId, tenantId),
            inArray(compositeProductComponentsTable.parentProductId, compositeParentIds),
          ));
        for (const r of compRows) {
          const arr = componentsByParent.get(r.parentId) ?? [];
          arr.push({
            childProductId: r.childId,
            quantityRequired: r.qty,
            childName: r.childName ?? "(deleted product)",
          });
          componentsByParent.set(r.parentId, arr);
        }
      }

      // Pre-fetch variant option stock for items that carry variant choices.
      // When any chosen option has a non-null stockCount the product uses
      // per-variant tracking; product.stockCount becomes SUM(option.stockCount).
      const allChosenOptionIds = resolvedItems
        .flatMap((i) => (i.variantChoices ?? []).map((c) => c.optionId))
        .filter((id): id is number => typeof id === "number" && id > 0);

      type VORow = { optionId: number; stockCount: number | null; productId: number };
      const variantOptionRows: VORow[] = allChosenOptionIds.length > 0
        ? await tx
          .select({
            optionId: variantOptionsTable.id,
            stockCount: variantOptionsTable.stockCount,
            productId: variantGroupsTable.productId,
          })
          .from(variantOptionsTable)
          .innerJoin(variantGroupsTable, eq(variantGroupsTable.id, variantOptionsTable.groupId))
          .where(inArray(variantOptionsTable.id, allChosenOptionIds))
        : [];

      const optionStockMap = new Map<number, VORow>(variantOptionRows.map((r) => [r.optionId, r]));

      // Pre-fetch combinations for products with 2+ variant choices per item.
      // A product uses combination tracking when it has variant_combinations rows with non-null stock_count.
      const itemProductIds = [...new Set(resolvedItems.map((i) => i.productId))];
      type VCRow = { id: number; productId: number; optionIds: number[]; stockCount: number | null; label: string };
      const variantCombinationRows: VCRow[] = itemProductIds.length > 0
        ? (await tx
          .select({
            id:        variantCombinationsTable.id,
            productId: variantCombinationsTable.productId,
            optionIds: variantCombinationsTable.optionIds,
            stockCount: variantCombinationsTable.stockCount,
            label:     variantCombinationsTable.label,
          })
          .from(variantCombinationsTable)
          .where(and(
            inArray(variantCombinationsTable.productId, itemProductIds),
            isNotNull(variantCombinationsTable.stockCount),
          ))) as VCRow[]
        : [];

      // Products where combination tracking is active (any combination has non-null stockCount)
      const combinationTrackedProducts = new Set<number>(variantCombinationRows.map((r) => r.productId));

      // Index: productId → (sorted-optionIds-key → combination row)
      const combinationIndex = new Map<number, Map<string, VCRow>>();
      for (const row of variantCombinationRows) {
        const key = [...row.optionIds].sort((a, b) => a - b).join(",");
        if (!combinationIndex.has(row.productId)) combinationIndex.set(row.productId, new Map());
        combinationIndex.get(row.productId)!.set(key, row);
      }

      // Products where at least one chosen option has per-variant stock configured (single-group path)
      const variantTrackedProducts = new Set<number>(
        variantOptionRows.filter((r) => r.stockCount !== null && !combinationTrackedProducts.has(r.productId)).map((r) => r.productId),
      );
      // Track which products need product.stockCount re-synced after the loop
      const variantSyncIds = new Set<number>();
      const combinationSyncIds = new Set<number>();

      // 1. Atomically decrement stock per item BEFORE creating the order.
      //    This is the only place that enforces "no negative stock".
      //    For composite parents we decrement each child's stock instead,
      //    multiplied by both the cart quantity and the per-component
      //    quantityRequired. A single failing child rolls back the whole
      //    order.
      for (const item of resolvedItems) {
        // Custom/miscellaneous items have no catalog product → no stock to deduct.
        if (item.isCustom) continue;
        const isComposite = metaMap.get(item.productId)?.structureType === "composite";

        if (isComposite) {
          const components = componentsByParent.get(item.productId) ?? [];
          if (components.length === 0) {
            // Selling a "composite" with no components configured would
            // silently bypass all stock guards. Fail loud instead.
            logger.warn(
              { tenantId, productId: item.productId },
              "[composite] sale rejected — no components configured",
            );
            throw new InsufficientComponentStockError(
              item.productId,
              item.productName,
              null,
              "(no components configured)",
              0,
              1,
            );
          }
          for (const comp of components) {
            const need = comp.quantityRequired * item.quantity;
            if (allowOverselling) {
              await tx
                .update(productsTable)
                .set({ stockCount: sql`${productsTable.stockCount} - ${need}` })
                .where(and(
                  eq(productsTable.id, comp.childProductId),
                  eq(productsTable.tenantId, tenantId),
                ));
            } else {
              const updated = await tx
                .update(productsTable)
                .set({
                  stockCount: sql`${productsTable.stockCount} - ${need}`,
                  inStock: sql`CASE WHEN ${productsTable.stockCount} - ${need} <= 0 THEN false ELSE ${productsTable.inStock} END`,
                })
                .where(and(
                  eq(productsTable.id, comp.childProductId),
                  eq(productsTable.tenantId, tenantId),
                  gte(productsTable.stockCount, need),
                ))
                .returning({ stockCount: productsTable.stockCount });

              if (updated.length === 0) {
                const [cur] = await tx
                  .select({ stockCount: productsTable.stockCount })
                  .from(productsTable)
                  .where(and(
                    eq(productsTable.id, comp.childProductId),
                    eq(productsTable.tenantId, tenantId),
                  ));
                logger.info(
                  { tenantId, parentId: item.productId, childId: comp.childProductId, requested: need, available: cur?.stockCount ?? 0 },
                  "[composite] sale blocked by INSUFFICIENT_COMPONENT_STOCK",
                );
                throw new InsufficientComponentStockError(
                  item.productId,
                  item.productName,
                  comp.childProductId,
                  comp.childName,
                  cur?.stockCount ?? 0,
                  need,
                );
              }
            }
          }
          continue;
        }

        // ── Combination stock deduction (multi-group variants) ───────────────
        // When the product uses combination tracking (2+ variant groups), look
        // up the matching combination by the sorted set of chosen optionIds and
        // deduct from that combination's stockCount.
        if (combinationTrackedProducts.has(item.productId) && (item.variantChoices ?? []).length > 0) {
          const chosenIds = (item.variantChoices ?? [])
            .map((c) => c.optionId)
            .filter((id): id is number => typeof id === "number" && id > 0);
          const key = [...chosenIds].sort((a, b) => a - b).join(",");
          const combo = combinationIndex.get(item.productId)?.get(key);

          if (combo) {
            if (allowOverselling) {
              await tx.update(variantCombinationsTable)
                .set({ stockCount: sql`${variantCombinationsTable.stockCount} - ${item.quantity}` })
                .where(eq(variantCombinationsTable.id, combo.id));
            } else {
              const updated = await tx.update(variantCombinationsTable)
                .set({ stockCount: sql`${variantCombinationsTable.stockCount} - ${item.quantity}` })
                .where(and(
                  eq(variantCombinationsTable.id, combo.id),
                  sql`${variantCombinationsTable.stockCount} >= ${item.quantity}`,
                ))
                .returning({ stockCount: variantCombinationsTable.stockCount });

              if (updated.length === 0) {
                const [cur] = await tx
                  .select({ stockCount: variantCombinationsTable.stockCount })
                  .from(variantCombinationsTable)
                  .where(eq(variantCombinationsTable.id, combo.id));
                throw new InsufficientStockError(
                  item.productId,
                  `${item.productName} – ${combo.label}`,
                  cur?.stockCount ?? 0,
                  item.quantity,
                );
              }
            }
          }
          combinationSyncIds.add(item.productId);
          continue;
        }

        // ── Per-variant stock deduction (single-group variants) ──────────────
        // If any chosen option for this product has per-variant stock, deduct
        // from that option rather than the product row directly.
        // product.stockCount is reconciled as SUM(option.stockCount) below.
        if (variantTrackedProducts.has(item.productId) && (item.variantChoices ?? []).length > 0) {
          for (const choice of (item.variantChoices ?? [])) {
            const optRow = optionStockMap.get(choice.optionId);
            if (!optRow || optRow.stockCount === null) continue;

            if (allowOverselling) {
              await tx.update(variantOptionsTable)
                .set({ stockCount: sql`${variantOptionsTable.stockCount} - ${item.quantity}` })
                .where(eq(variantOptionsTable.id, choice.optionId));
            } else {
              const updated = await tx.update(variantOptionsTable)
                .set({ stockCount: sql`${variantOptionsTable.stockCount} - ${item.quantity}` })
                .where(and(
                  eq(variantOptionsTable.id, choice.optionId),
                  sql`${variantOptionsTable.stockCount} >= ${item.quantity}`,
                ))
                .returning({ stockCount: variantOptionsTable.stockCount });

              if (updated.length === 0) {
                const [cur] = await tx
                  .select({ stockCount: variantOptionsTable.stockCount })
                  .from(variantOptionsTable)
                  .where(eq(variantOptionsTable.id, choice.optionId));
                throw new InsufficientStockError(
                  item.productId,
                  `${item.productName} – ${choice.optionName}`,
                  cur?.stockCount ?? 0,
                  item.quantity,
                );
              }
            }
          }
          variantSyncIds.add(item.productId);
          continue; // skip product-level deduction for variant-tracked products
        }

        if (allowOverselling) {
          // Unconditional deduction; no guard.
          await tx
            .update(productsTable)
            .set({ stockCount: sql`${productsTable.stockCount} - ${item.quantity}` })
            .where(and(
              eq(productsTable.id, item.productId),
              eq(productsTable.tenantId, tenantId),
            ));
        } else {
          // Conditional deduction: only succeeds if enough stock exists.
          // Drizzle's `update().returning()` with a WHERE clause that
          // includes the stock check is the atomic primitive we want.
          const updated = await tx
            .update(productsTable)
            .set({
              stockCount: sql`${productsTable.stockCount} - ${item.quantity}`,
              inStock: sql`CASE WHEN ${productsTable.stockCount} - ${item.quantity} <= 0 THEN false ELSE ${productsTable.inStock} END`,
            })
            .where(and(
              eq(productsTable.id, item.productId),
              eq(productsTable.tenantId, tenantId),
              gte(productsTable.stockCount, item.quantity),
            ))
            .returning({ stockCount: productsTable.stockCount });

          if (updated.length === 0) {
            // Fetch the current stock so we can report exactly how much is
            // available. If the product was removed mid-flight, treat as 0.
            const [cur] = await tx
              .select({ stockCount: productsTable.stockCount })
              .from(productsTable)
              .where(and(
                eq(productsTable.id, item.productId),
                eq(productsTable.tenantId, tenantId),
              ));
            logger.info(
              { tenantId, productId: item.productId, requested: item.quantity, available: cur?.stockCount ?? 0 },
              "[oversell] blocked by INSUFFICIENT_STOCK guard",
            );
            throw new InsufficientStockError(
              item.productId,
              item.productName,
              cur?.stockCount ?? 0,
              item.quantity,
            );
          }
        }

        // ── Batch (FIFO/LIFO) deduction ────────────────────────────────────
        // For batch-tracked simple products, the product.stockCount above is
        // the source of truth; the per-batch rows mirror the same total so
        // expiry/lot reports stay accurate. Resolve method:
        //   product override > tenant setting > 'fifo' default.
        const meta = metaMap.get(item.productId);
        if (meta?.trackBatches) {
          const method = (meta.stockMethodOverride
            ?? (await getSetting("stock_method", tenantId))
            ?? "fifo").toLowerCase() === "lifo" ? "lifo" : "fifo";
          const batches = await tx
            .select({
              id: productBatchesTable.id,
              quantityRemaining: productBatchesTable.quantityRemaining,
            })
            .from(productBatchesTable)
            .where(and(
              eq(productBatchesTable.tenantId, tenantId),
              eq(productBatchesTable.productId, item.productId),
              sql`${productBatchesTable.quantityRemaining} > 0`,
            ))
            .orderBy(method === "fifo"
              ? sql`${productBatchesTable.receivedAt} ASC, ${productBatchesTable.id} ASC`
              : sql`${productBatchesTable.receivedAt} DESC, ${productBatchesTable.id} DESC`);
          let need = item.quantity;
          for (const b of batches) {
            if (need <= 0) break;
            const take = Math.min(b.quantityRemaining, need);
            await tx.update(productBatchesTable)
              .set({ quantityRemaining: sql`${productBatchesTable.quantityRemaining} - ${take}` })
              .where(eq(productBatchesTable.id, b.id));
            need -= take;
          }
          if (need > 0) {
            // Drift recovery: stock_count says we had enough but batches
            // don't sum to it. Create a legacy batch for the shortfall so
            // SUM(batches) reconciles with stock_count again.
            logger.warn(
              { tenantId, productId: item.productId, shortfall: need },
              "[batch] drift detected — creating legacy batch for shortfall",
            );
            await tx.insert(productBatchesTable).values({
              tenantId,
              productId: item.productId,
              quantityRemaining: -need,
              sourceType: "legacy",
              notes: "Auto-created to reconcile drift between stock_count and batches",
            });
          }
        }
      }

      // Reconcile product.stockCount for per-variant-tracked products (single group):
      // set it to SUM of all non-null option stockCounts.
      for (const pid of variantSyncIds) {
        await tx.execute(sql`
          UPDATE products
          SET
            stock_count = COALESCE((
              SELECT SUM(vo.stock_count)
              FROM variant_options vo
              JOIN variant_groups vg ON vg.id = vo.group_id
              WHERE vg.product_id = ${pid} AND vo.stock_count IS NOT NULL
            ), 0),
            in_stock = CASE
              WHEN COALESCE((
                SELECT SUM(vo.stock_count)
                FROM variant_options vo
                JOIN variant_groups vg ON vg.id = vo.group_id
                WHERE vg.product_id = ${pid} AND vo.stock_count IS NOT NULL
              ), 0) > 0 THEN true
              ELSE false
            END
          WHERE id = ${pid} AND tenant_id = ${tenantId}
        `);
      }

      // Reconcile product.stockCount for combination-tracked products (multi-group):
      // set it to SUM of all non-null combination stockCounts.
      for (const pid of combinationSyncIds) {
        await tx.execute(sql`
          UPDATE products
          SET
            stock_count = COALESCE((
              SELECT SUM(vc.stock_count)
              FROM variant_combinations vc
              WHERE vc.product_id = ${pid} AND vc.stock_count IS NOT NULL
            ), 0),
            in_stock = CASE
              WHEN COALESCE((
                SELECT SUM(vc.stock_count)
                FROM variant_combinations vc
                WHERE vc.product_id = ${pid} AND vc.stock_count IS NOT NULL
              ), 0) > 0 THEN true
              ELSE false
            END
          WHERE id = ${pid} AND tenant_id = ${tenantId}
        `);
      }

      // ── Gift voucher redemption (a TENDER, not a discount) ─────────────
      // Lock the voucher row FOR UPDATE so two concurrent sales can never
      // both spend the same balance. The sale total is UNCHANGED; the voucher
      // pays down `giftVoucherAmount` and the remainder (total - applied) is
      // collected via paymentMethod. Any failure throws and rolls the whole
      // sale back so stock is never deducted against a bad redemption.
      let voucherApplied = 0;
      let voucherRow: typeof giftVouchersTable.$inferSelect | null = null;
      const redeemCode = parsed.data.giftVoucherCode
        ? parsed.data.giftVoucherCode.trim().toUpperCase().replace(/\s+/g, "")
        : "";
      if (redeemCode) {
        const [v] = await tx
          .select()
          .from(giftVouchersTable)
          .where(and(
            eq(giftVouchersTable.tenantId, tenantId),
            eq(giftVouchersTable.code, redeemCode),
          ))
          .for("update");
        if (!v) {
          throw new VoucherRedemptionError("VOUCHER_NOT_FOUND", `Gift voucher "${redeemCode}" was not found`);
        }
        if (v.status === "cancelled") {
          throw new VoucherRedemptionError("VOUCHER_CANCELLED", "This gift voucher has been cancelled");
        }
        if (v.expiryDate && v.expiryDate.getTime() < Date.now()) {
          throw new VoucherRedemptionError("VOUCHER_EXPIRED", "This gift voucher has expired");
        }
        if (v.status === "redeemed" || v.balance <= 0) {
          throw new VoucherRedemptionError("VOUCHER_EMPTY", "This gift voucher has no remaining balance");
        }
        voucherApplied = Math.round(Math.min(Math.round(v.balance * 100) / 100, total) * 100) / 100;
        if (voucherApplied <= 0) {
          throw new VoucherRedemptionError("VOUCHER_EMPTY", "This gift voucher has no remaining balance");
        }
        voucherRow = v;
      }

      // Server-side payment invariants (defence-in-depth — never trust client):
      // (a) The "gift_voucher" sentinel claims the voucher pays the WHOLE sale.
      //     Reject it unless a redeemable voucher actually covers the total, or
      //     a crafted request could create a free completed order.
      if (parsed.data.paymentMethod === "gift_voucher" && voucherApplied + 0.005 < total) {
        throw new VoucherRedemptionError(
          "VOUCHER_INSUFFICIENT",
          "Gift voucher does not cover the full sale total",
        );
      }
      // (b) A voucher may only be spent on a finalized (paid) sale — never on an
      //     open/unpaid order — so balance can't be burned before payment.
      if (voucherRow && isOpenOrder) {
        throw new VoucherRedemptionError(
          "VOUCHER_OPEN_ORDER",
          "Gift vouchers can only be redeemed when the sale is paid",
        );
      }

      // 2. Create the order header now that all stock is reserved.
      const [created] = await tx
        .insert(ordersTable)
        .values({
          tenantId,
          orderNumber,
          status: isOpenOrder ? "open" : isPaid ? "completed" : "pending",
          kitchenStatus: "pending",
          subtotal,
          discountType: parsed.data.discountType,
          discountAmount: parsed.data.discountAmount,
          discountValue: discountValue > 0 ? Math.round(discountValue * 100) / 100 : undefined,
          tax,
          total,
          paymentMethod: parsed.data.paymentMethod,
          cardType: parsed.data.cardType,
          splitCardAmount: parsed.data.splitCardAmount,
          splitCashAmount: parsed.data.splitCashAmount,
          cashTendered: parsed.data.cashTendered,
          giftVoucherId: voucherRow ? voucherRow.id : undefined,
          giftVoucherCode: voucherRow ? voucherRow.code : undefined,
          giftVoucherAmount: voucherApplied > 0 ? voucherApplied : undefined,
          notes: parsed.data.notes,
          customerId: parsed.data.customerId,
          tableId: parsed.data.tableId,
          staffId: parsed.data.staffId,
          locationId: parsed.data.locationId,
          stationNumber: parsed.data.stationNumber,
          orderType: parsed.data.orderType ?? "counter",
          loyaltyPointsRedeemed: pointsToRedeem > 0 ? pointsToRedeem : undefined,
          loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
          completedAt: isPaid ? new Date() : undefined,
        })
        .returning();

      // 2b. Apply the locked voucher now that the order id exists: decrement
      // the balance, flip status, and write an immutable "redeem" ledger row
      // pointing back at this sale.
      if (voucherRow && voucherApplied > 0) {
        const balanceBefore = Math.round(voucherRow.balance * 100) / 100;
        const balanceAfter = Math.round((balanceBefore - voucherApplied) * 100) / 100;
        await tx
          .update(giftVouchersTable)
          .set({
            balance: balanceAfter,
            status: balanceAfter <= 0 ? "redeemed" : "partially_redeemed",
            updatedAt: new Date(),
          })
          .where(eq(giftVouchersTable.id, voucherRow.id));
        await tx.insert(giftVoucherTransactionsTable).values({
          tenantId,
          voucherId: voucherRow.id,
          action: "redeem",
          amount: voucherApplied,
          balanceBefore,
          balanceAfter,
          relatedOrderId: created.id,
          staffId: parsed.data.staffId,
          notes: `Redeemed on ${created.orderNumber}`,
        });
      }

      // 3. Insert order_items.
      await tx.insert(orderItemsTable).values(
        resolvedItems.map((item) => ({
          orderId: created.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          originalUnitPrice: item.originalUnitPrice,
          discountAmount: item.discountAmount,
          variantAdjustment: item.variantAdjustment,
          modifierAdjustment: item.modifierAdjustment,
          variantChoices: item.variantChoices ?? null,
          modifierChoices: item.modifierChoices ?? null,
          lineTotal: item.lineTotal,
          notes: item.notes ?? null,
        })),
      );

      // 4. Per-item stock-movement audit + location inventory + recipe BOM.
      for (const item of resolvedItems) {
        // Custom/miscellaneous items have no catalog product → no movements/inventory/recipe.
        if (item.isCustom) continue;
        const isComposite = metaMap.get(item.productId)?.structureType === "composite";

        if (isComposite) {
          // Audit/decrement happens at the *child* level — the parent
          // has no stock and is not tracked in stock_movements. Each
          // child gets its own composite_sale row so reports can
          // attribute the deduction back to the parent SKU.
          const components = componentsByParent.get(item.productId) ?? [];
          for (const comp of components) {
            const used = comp.quantityRequired * item.quantity;
            const [afterSale] = await tx
              .select({ stockCount: productsTable.stockCount })
              .from(productsTable)
              .where(and(eq(productsTable.id, comp.childProductId), eq(productsTable.tenantId, tenantId)));
            await tx.insert(stockMovementsTable).values({
              tenantId,
              productId: comp.childProductId,
              type: "composite_sale",
              quantity: -used,
              balanceAfter: afterSale?.stockCount ?? 0,
              referenceType: "order",
              referenceId: created.id,
              notes: `Sold as ${item.productName} – ${orderNumber}`,
            });
            if (parsed.data.locationId) {
              await tx
                .update(locationInventoryTable)
                .set({
                  stockCount: allowOverselling
                    ? sql`${locationInventoryTable.stockCount} - ${used}`
                    : sql`GREATEST(0, ${locationInventoryTable.stockCount} - ${used})`,
                  updatedAt: new Date(),
                })
                .where(and(
                  eq(locationInventoryTable.locationId, parsed.data.locationId),
                  eq(locationInventoryTable.productId, comp.childProductId),
                ));
            }
          }
          await logAudit({
            tenantId,
            staffId: parsed.data.staffId,
            action: "order.composite_sale",
            entityType: "order",
            entityId: created.id,
            details: {
              parentProductId: item.productId,
              parentName: item.productName,
              parentQuantity: item.quantity,
              componentCount: components.length,
            },
          });
          continue;
        }

        const [afterSale] = await tx
          .select({ stockCount: productsTable.stockCount })
          .from(productsTable)
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
        await tx.insert(stockMovementsTable).values({
          tenantId,
          productId: item.productId,
          type: "sale",
          quantity: -item.quantity,
          balanceAfter: afterSale?.stockCount ?? 0,
          referenceType: "order",
          referenceId: created.id,
          notes: `Sale – ${orderNumber}`,
        });

        if (parsed.data.locationId) {
          await tx
            .update(locationInventoryTable)
            .set({
              stockCount: allowOverselling
                ? sql`${locationInventoryTable.stockCount} - ${item.quantity}`
                : sql`GREATEST(0, ${locationInventoryTable.stockCount} - ${item.quantity})`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(locationInventoryTable.locationId, parsed.data.locationId),
                eq(locationInventoryTable.productId, item.productId),
              )
            );
        }

        // Deduct ingredients from stock if this product has a recipe (BOM)
        const [recipe] = await tx.select().from(recipesTable)
          .where(and(eq(recipesTable.productId, item.productId), eq(recipesTable.tenantId, tenantId)));

        if (recipe) {
          const rIngredients = await tx
            .select({
              ingredientId: recipeIngredientsTable.ingredientId,
              quantity: recipeIngredientsTable.quantity,
            })
            .from(recipeIngredientsTable)
            .where(eq(recipeIngredientsTable.recipeId, recipe.id));

          for (const ri of rIngredients) {
            const toDeduct = (ri.quantity / recipe.yieldQuantity) * item.quantity;
            await tx.update(ingredientsTable)
              .set({ stockQuantity: sql`GREATEST(0, ${ingredientsTable.stockQuantity} - ${toDeduct})`, updatedAt: new Date() })
              .where(eq(ingredientsTable.id, ri.ingredientId));

            await tx.insert(ingredientUsageLogsTable).values({
              tenantId,
              ingredientId: ri.ingredientId,
              quantity: toDeduct,
              reason: "sale",
              referenceId: created.id,
              referenceType: "order",
            });
          }
        }
      }

      return created;
    });
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      res.status(409).json({
        error: "INSUFFICIENT_STOCK",
        message: `Only ${e.available} of "${e.productName}" available (you tried to sell ${e.requested})`,
        productId: e.productId,
        productName: e.productName,
        available: e.available,
        requested: e.requested,
      });
      return;
    }
    if (e instanceof VoucherRedemptionError) {
      res.status(400).json({ error: e.reason, message: e.message });
      return;
    }
    if (e instanceof InsufficientComponentStockError) {
      res.status(409).json({
        error: "INSUFFICIENT_COMPONENT_STOCK",
        message: `Cannot sell "${e.parentName}": only ${e.available} of "${e.childName}" available (need ${e.requested})`,
        parentProductId: e.parentProductId,
        parentName: e.parentName,
        childProductId: e.childProductId,
        childName: e.childName,
        available: e.available,
        requested: e.requested,
        required: e.requested,
      });
      return;
    }
    throw e;
  }

  if (!isOpenOrder && parsed.data.customerId) {
    const LOYALTY_EARN_RATE = 10;
    const pointsEarned = Math.floor(total / LOYALTY_EARN_RATE);
    const netPoints = pointsEarned - pointsToRedeem;
    const [updatedCustomer] = await db
      .update(customersTable)
      .set({
        totalSpent: sql`${customersTable.totalSpent} + ${total}`,
        orderCount: sql`${customersTable.orderCount} + 1`,
        loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${netPoints})`,
      })
      .where(and(eq(customersTable.id, parsed.data.customerId), eq(customersTable.tenantId, tenantId)))
      .returning();

    if (pointsEarned > 0 && updatedCustomer?.email) {
      const businessName = (await getSetting("business_name", tenantId)) ?? "NEXXUS POS";
      sendTemplateEmail({
        tenantId,
        templateKey: "loyalty_earned",
        to: updatedCustomer.email,
        vars: {
          business_name: businessName,
          customer_name: updatedCustomer.name,
          points_earned: pointsEarned,
          points_balance: updatedCustomer.loyaltyPoints ?? 0,
          order_total: total.toFixed(2),
          order_date: new Date().toLocaleDateString("en-JM"),
        },
      }).catch(() => {});
    }
  }

  if (parsed.data.tableId) {
    if (isOpenOrder) {
      await db
        .update(diningTablesTable)
        .set({ status: "occupied", currentOrderId: order.id })
        .where(and(eq(diningTablesTable.id, parsed.data.tableId), eq(diningTablesTable.tenantId, tenantId)));
    } else if (parsed.data.orderType === "counter" || !parsed.data.orderType) {
      await db
        .update(diningTablesTable)
        .set({ status: "available", currentOrderId: null })
        .where(and(eq(diningTablesTable.id, parsed.data.tableId), eq(diningTablesTable.tenantId, tenantId)));
    }
  }

  if (parsed.data.paymentMethod === "credit" && parsed.data.customerId) {
    const [cust] = await db
      .select({ name: customersTable.name })
      .from(customersTable)
      .where(and(
        eq(customersTable.id, parsed.data.customerId),
        eq(customersTable.tenantId, tenantId),
      ));
    if (cust) {
      await db.insert(accountsReceivableTable).values({
        tenantId,
        customerId: parsed.data.customerId,
        customerName: cust.name,
        orderId: order.id,
        orderNumber: order.orderNumber,
        // A gift voucher is a tender, so the receivable is only the UNPAID
        // remainder (total minus the amount the voucher covered).
        amount: Math.max(0, Math.round((order.total - (order.giftVoucherAmount ?? 0)) * 100) / 100),
        amountPaid: 0,
        status: "open",
      });
    }
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.status(201).json(GetOrderResponse.parse(fullOrder));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [orderRow] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
  if (!orderRow) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = await getOrderWithItems(params.data.id);
  res.json(GetOrderResponse.parse(order));
});

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Restore inventory for a single order line, mirroring the structure-aware
 * logic used by full refund/void. `restoreQty` is the quantity to put back —
 * the whole line for a full refund/void, or just the refunded slice for a
 * partial (per-item) refund. Custom/miscellaneous lines (productId 0) had no
 * stock side-effects at checkout, so they are skipped. Must run inside a
 * transaction.
 */
async function restoreLineStock(
  tx: OrderTx,
  opts: {
    item: typeof orderItemsTable.$inferSelect;
    restoreQty: number;
    tenantId: number;
    orderId: number;
    locationId: number | null;
    meta?: { structureType: string | null; trackBatches: boolean | null };
    components: Array<{ childProductId: number; quantityRequired: number }>;
    movementType: string;
    compositeMovementType: string;
    noteVerb: string;
    batchSourceType: string;
  },
): Promise<void> {
  const {
    item, restoreQty, tenantId, orderId, locationId, meta, components,
    movementType, compositeMovementType, noteVerb, batchSourceType,
  } = opts;
  if (item.productId === 0 || restoreQty <= 0) return;

  const isComposite = meta?.structureType === "composite";
  if (isComposite) {
    for (const comp of components) {
      const restored = comp.quantityRequired * restoreQty;
      await tx
        .update(productsTable)
        .set({ stockCount: sql`${productsTable.stockCount} + ${restored}`, inStock: true })
        .where(and(eq(productsTable.id, comp.childProductId), eq(productsTable.tenantId, tenantId)));

      const [afterReturn] = await tx
        .select({ stockCount: productsTable.stockCount })
        .from(productsTable)
        .where(and(eq(productsTable.id, comp.childProductId), eq(productsTable.tenantId, tenantId)));
      await tx.insert(stockMovementsTable).values({
        tenantId,
        productId: comp.childProductId,
        type: compositeMovementType,
        quantity: restored,
        balanceAfter: afterReturn?.stockCount ?? 0,
        referenceType: "order",
        referenceId: orderId,
        notes: `${noteVerb} of ${item.productName} – Order #${orderId}`,
      });

      if (locationId) {
        await tx
          .update(locationInventoryTable)
          .set({ stockCount: sql`${locationInventoryTable.stockCount} + ${restored}`, updatedAt: new Date() })
          .where(and(
            eq(locationInventoryTable.locationId, locationId),
            eq(locationInventoryTable.productId, comp.childProductId),
          ));
      }
    }
    return;
  }

  // Restore per-combination or per-option stock for variant products
  {
    const choices = (item.variantChoices as Array<{ optionId: number; optionName: string }> | null) ?? [];
    if (choices.length > 0) {
      const choiceOptIds = choices.map((c) => c.optionId).filter((id): id is number => typeof id === "number");

      // ── Try combination-tracked restore first (multi-group) ──────────
      if (choiceOptIds.length >= 2) {
        const key = [...choiceOptIds].sort((a, b) => a - b).join(",");
        const allCombos = await tx
          .select({ id: variantCombinationsTable.id, optionIds: variantCombinationsTable.optionIds, stockCount: variantCombinationsTable.stockCount })
          .from(variantCombinationsTable)
          .where(and(
            eq(variantCombinationsTable.productId, item.productId),
            isNotNull(variantCombinationsTable.stockCount),
          ));
        const combo = allCombos.find((c) => {
          const ck = [...(c.optionIds as number[])].sort((a, b) => a - b).join(",");
          return ck === key;
        });
        if (combo) {
          await tx.update(variantCombinationsTable)
            .set({ stockCount: sql`${variantCombinationsTable.stockCount} + ${restoreQty}` })
            .where(eq(variantCombinationsTable.id, combo.id));
          await tx.execute(sql`
            UPDATE products
            SET
              stock_count = COALESCE((
                SELECT SUM(vc.stock_count) FROM variant_combinations vc
                WHERE vc.product_id = ${item.productId} AND vc.stock_count IS NOT NULL
              ), 0),
              in_stock = true
            WHERE id = ${item.productId} AND tenant_id = ${tenantId}
          `);
          return;
        }
      }

      // ── Fall back to option-tracked restore (single-group) ──────────
      if (choiceOptIds.length > 0) {
        const trackedOpts = await tx
          .select({ id: variantOptionsTable.id })
          .from(variantOptionsTable)
          .where(and(inArray(variantOptionsTable.id, choiceOptIds), isNotNull(variantOptionsTable.stockCount)));
        if (trackedOpts.length > 0) {
          for (const opt of trackedOpts) {
            await tx.update(variantOptionsTable)
              .set({ stockCount: sql`${variantOptionsTable.stockCount} + ${restoreQty}` })
              .where(eq(variantOptionsTable.id, opt.id));
          }
          await tx.execute(sql`
            UPDATE products
            SET
              stock_count = COALESCE((
                SELECT SUM(vo.stock_count) FROM variant_options vo
                JOIN variant_groups vg ON vg.id = vo.group_id
                WHERE vg.product_id = ${item.productId} AND vo.stock_count IS NOT NULL
              ), 0),
              in_stock = true
            WHERE id = ${item.productId} AND tenant_id = ${tenantId}
          `);
          return;
        }
      }
    }
  }

  // Simple product restore
  await tx
    .update(productsTable)
    .set({ stockCount: sql`${productsTable.stockCount} + ${restoreQty}`, inStock: true })
    .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

  if (meta?.trackBatches) {
    await tx.insert(productBatchesTable).values({
      tenantId,
      productId: item.productId,
      quantityRemaining: restoreQty,
      sourceType: batchSourceType,
      notes: `${noteVerb} of ${item.productName} – Order #${orderId}`,
    });
  }

  const [afterReturn] = await tx
    .select({ stockCount: productsTable.stockCount })
    .from(productsTable)
    .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
  await tx.insert(stockMovementsTable).values({
    tenantId,
    productId: item.productId,
    type: movementType,
    quantity: restoreQty,
    balanceAfter: afterReturn?.stockCount ?? 0,
    referenceType: "order",
    referenceId: orderId,
    notes: `${noteVerb} – Order #${orderId}`,
  });

  if (locationId) {
    await tx
      .update(locationInventoryTable)
      .set({ stockCount: sql`${locationInventoryTable.stockCount} + ${restoreQty}`, updatedAt: new Date() })
      .where(and(
        eq(locationInventoryTable.locationId, locationId),
        eq(locationInventoryTable.productId, item.productId),
      ));
  }
}

router.patch("/orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateOrderStatusParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({
      status: parsed.data.status,
      voidReason: parsed.data.voidReason,
      completedAt: parsed.data.status === "completed" ? new Date() : undefined,
    })
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (parsed.data.status === "refunded" || parsed.data.status === "voided") {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    const itemProductIds = Array.from(new Set(items.map(i => i.productId)));

    // Pre-fetch structure type so refunds restore stock to the right
    // place — composite parents return product to their *children*,
    // simple products restore their own stock_count.
    const productMeta = itemProductIds.length === 0 ? [] : await db
      .select({
        id: productsTable.id,
        structureType: productsTable.structureType,
        trackBatches: productsTable.trackBatches,
      })
      .from(productsTable)
      .where(and(
        inArray(productsTable.id, itemProductIds),
        eq(productsTable.tenantId, tenantId),
      ));
    const metaMap = new Map(productMeta.map(p => [p.id, p]));

    const compositeIds = productMeta.filter(p => p.structureType === "composite").map(p => p.id);
    const componentsByParent = new Map<number, Array<{
      childProductId: number;
      quantityRequired: number;
    }>>();
    if (compositeIds.length > 0) {
      const compRows = await db
        .select({
          parentId: compositeProductComponentsTable.parentProductId,
          childId: compositeProductComponentsTable.childProductId,
          qty: compositeProductComponentsTable.quantityRequired,
        })
        .from(compositeProductComponentsTable)
        .where(and(
          eq(compositeProductComponentsTable.tenantId, tenantId),
          inArray(compositeProductComponentsTable.parentProductId, compositeIds),
        ));
      for (const r of compRows) {
        const arr = componentsByParent.get(r.parentId) ?? [];
        arr.push({ childProductId: r.childId, quantityRequired: r.qty });
        componentsByParent.set(r.parentId, arr);
      }
    }

    const movementType = parsed.data.status === "refunded" ? "refund" : "void";
    const compositeMovementType = parsed.data.status === "refunded" ? "composite_refund" : "composite_void";
    const noteVerb = parsed.data.status === "refunded" ? "Refund" : "Void";

    // Wrap all stock restores + movement inserts in a single
    // transaction so a partial failure (e.g. a single bad row) cannot
    // leave inventory + movements out of sync.
    const batchSourceType = parsed.data.status === "refunded" ? "refund" : "void";
    await db.transaction(async (tx) => {
      for (const item of items) {
        await restoreLineStock(tx, {
          item,
          restoreQty: item.quantity,
          tenantId,
          orderId: order.id,
          locationId: order.locationId ?? null,
          meta: metaMap.get(item.productId),
          components: componentsByParent.get(item.productId) ?? [],
          movementType,
          compositeMovementType,
          noteVerb,
          batchSourceType,
        });
      }
    });
  }

  if (parsed.data.status === "voided" || parsed.data.status === "refunded") {
    await logAudit({ tenantId, staffId: order.staffId, action: `order.${parsed.data.status}`, entityType: "order", entityId: order.id, details: { total: order.total, reason: parsed.data.voidReason } });
  } else if (parsed.data.status === "completed") {
    await logAudit({ tenantId, staffId: order.staffId, action: "order.complete", entityType: "order", entityId: order.id, details: { total: order.total } });
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(UpdateOrderStatusResponse.parse(fullOrder));
});

router.post("/orders/:id/charge", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ChargeOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ChargeOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (existing.paymentMethod) {
    res.status(400).json({ error: "Order is already paid" });
    return;
  }
  if (!["open", "pending", "preparing", "ready"].includes(existing.status)) {
    res.status(400).json({ error: "Order cannot be charged in its current status" });
    return;
  }

  // Validate the chosen payment method is currently enabled for this tenant.
  {
    const all = await db
      .select({ name: paymentMethodsTable.name, type: paymentMethodsTable.type, isEnabled: paymentMethodsTable.isEnabled })
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.tenantId, tenantId));
    if (all.length > 0) {
      const v = parsed.data.paymentMethod.toLowerCase();
      const match = all.find(m => m.type.toLowerCase() === v || m.name.toLowerCase() === v);
      if (!match || !match.isEnabled) {
        res.status(400).json({
          error: "PAYMENT_METHOD_DISABLED",
          message: `Payment method "${parsed.data.paymentMethod}" is not enabled`,
        });
        return;
      }
    }
  }

  const [order] = await db
    .update(ordersTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      paymentMethod: parsed.data.paymentMethod,
      cardType: parsed.data.cardType,
      splitCardAmount: parsed.data.splitCardAmount,
      splitCashAmount: parsed.data.splitCashAmount,
    })
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)))
    .returning();

  if (existing.customerId) {
    const LOYALTY_EARN_RATE = 10;
    const pointsEarned = Math.floor(existing.total / LOYALTY_EARN_RATE);
    const pointsRedeemed = existing.loyaltyPointsRedeemed ?? 0;
    const netPoints = pointsEarned - pointsRedeemed;
    await db
      .update(customersTable)
      .set({
        totalSpent: sql`${customersTable.totalSpent} + ${existing.total}`,
        orderCount: sql`${customersTable.orderCount} + 1`,
        loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${netPoints})`,
      })
      .where(and(eq(customersTable.id, existing.customerId), eq(customersTable.tenantId, tenantId)));
  }

  if (existing.tableId) {
    await db
      .update(diningTablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(and(eq(diningTablesTable.id, existing.tableId), eq(diningTablesTable.tenantId, tenantId)));
  }

  const fullOrder = await getOrderWithItems(order.id);
  await logAudit({ tenantId, staffId: existing.staffId, action: "order.sale", entityType: "order", entityId: order.id, details: { total: existing.total, paymentMethod: parsed.data.paymentMethod } });
  res.json(ChargeOrderResponse.parse(fullOrder));
});

/**
 * Partial (per-item) refund — refund specific items / quantities from a
 * completed order. Revenue-adjusting: the order's monetary totals are scaled
 * down by the refunded fraction so reports reflect the net (kept) revenue
 * without any separate report changes. The line's `quantity` + `lineTotal`
 * are reduced in place and `refundedQuantity` / `refundedTotal` accumulate.
 * Status stays `completed` while any quantity remains; it flips to `refunded`
 * once every line is fully refunded. Stock for refunded units is restored via
 * the same structure-aware logic as a full refund.
 */
router.post("/orders/:id/refund-items", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RefundOrderItemsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RefundOrderItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Quick existence check up front so we can 404 cleanly before locking.
  const [pre] = await db.select({ id: ordersTable.id }).from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
  if (!pre) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // A single request may list the same line more than once — aggregate the
  // requested quantities per orderItemId so the cap is enforced against the
  // TOTAL requested, not each entry independently (prevents over-refund).
  const requestedByItemId = new Map<number, number>();
  for (const reqItem of parsed.data.items) {
    if (!(reqItem.quantity > 0)) {
      res.status(400).json({ error: `Refund quantity for item ${reqItem.orderItemId} must be greater than 0` });
      return;
    }
    requestedByItemId.set(reqItem.orderItemId, (requestedByItemId.get(reqItem.orderItemId) ?? 0) + reqItem.quantity);
  }
  if (requestedByItemId.size === 0) {
    res.status(400).json({ error: "No items to refund" });
    return;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  type RefundErr = { httpStatus: number; httpMessage: string };
  const isRefundErr = (e: unknown): e is RefundErr =>
    typeof e === "object" && e !== null && typeof (e as RefundErr).httpStatus === "number";

  let refundAmount = 0;
  let fullyRefunded = false;
  let auditItems: Array<{ orderItemId: number; productName: string; quantity: number }> = [];
  let auditStaffId: number | null = null;
  let refundVoucher: typeof giftVouchersTable.$inferSelect | null = null;

  try {
    await db.transaction(async (tx) => {
      // Lock the order row so concurrent refunds on the same order serialize —
      // the second refund re-reads the already-reduced quantities and can't
      // double-restore stock or over-refund money.
      const [existing] = await tx.select().from(ordersTable)
        .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)))
        .for("update");
      if (!existing) throw { httpStatus: 404, httpMessage: "Order not found" } satisfies RefundErr;
      if (existing.status !== "completed") throw { httpStatus: 400, httpMessage: "Only completed orders can be partially refunded" } satisfies RefundErr;
      if (!(existing.subtotal > 0)) throw { httpStatus: 400, httpMessage: "Order subtotal must be positive to refund" } satisfies RefundErr;
      auditStaffId = existing.staffId;

      const items = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, existing.id));
      const itemsById = new Map(items.map(i => [i.id, i]));

      // Validate aggregated quantities against the CURRENT remaining quantity
      // (read under the row lock) and compute each line's refund value.
      const refundReqs: Array<{ item: typeof orderItemsTable.$inferSelect; refundQty: number }> = [];
      let totalLineRefundValue = 0;
      for (const [orderItemId, refundQty] of requestedByItemId) {
        const item = itemsById.get(orderItemId);
        if (!item) throw { httpStatus: 400, httpMessage: `Order item ${orderItemId} is not part of this order` } satisfies RefundErr;
        if (refundQty > item.quantity) throw { httpStatus: 400, httpMessage: `Cannot refund ${refundQty} of "${item.productName}" — only ${item.quantity} remaining` } satisfies RefundErr;
        const perUnit = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
        totalLineRefundValue += perUnit * refundQty;
        refundReqs.push({ item, refundQty });
      }

      // Scale the order's monetary fields by the fraction that is kept.
      const refundFraction = Math.min(1, totalLineRefundValue / existing.subtotal);
      const keepRatio = 1 - refundFraction;
      const newSubtotal = round2(existing.subtotal * keepRatio);
      const newTax = round2((existing.tax ?? 0) * keepRatio);
      const newDiscountValue = existing.discountValue == null ? existing.discountValue : round2(existing.discountValue * keepRatio);
      const newLoyaltyDiscount = existing.loyaltyDiscount == null ? existing.loyaltyDiscount : round2(existing.loyaltyDiscount * keepRatio);
      const newTotal = round2(existing.total * keepRatio);
      refundAmount = round2(existing.total - newTotal);
      const newRefundedTotal = round2((existing.refundedTotal ?? 0) + refundAmount);

      // Pre-fetch product structure + composite components for stock restore.
      const itemProductIds = Array.from(new Set(refundReqs.map(r => r.item.productId).filter(id => id !== 0)));
      const productMeta = itemProductIds.length === 0 ? [] : await tx
        .select({ id: productsTable.id, structureType: productsTable.structureType, trackBatches: productsTable.trackBatches })
        .from(productsTable)
        .where(and(inArray(productsTable.id, itemProductIds), eq(productsTable.tenantId, tenantId)));
      const metaMap = new Map(productMeta.map(p => [p.id, p]));
      const compositeIds = productMeta.filter(p => p.structureType === "composite").map(p => p.id);
      const componentsByParent = new Map<number, Array<{ childProductId: number; quantityRequired: number }>>();
      if (compositeIds.length > 0) {
        const compRows = await tx
          .select({ parentId: compositeProductComponentsTable.parentProductId, childId: compositeProductComponentsTable.childProductId, qty: compositeProductComponentsTable.quantityRequired })
          .from(compositeProductComponentsTable)
          .where(and(eq(compositeProductComponentsTable.tenantId, tenantId), inArray(compositeProductComponentsTable.parentProductId, compositeIds)));
        for (const r of compRows) {
          const arr = componentsByParent.get(r.parentId) ?? [];
          arr.push({ childProductId: r.childId, quantityRequired: r.qty });
          componentsByParent.set(r.parentId, arr);
        }
      }

      // Will every line be fully refunded after this? If so, flip to "refunded".
      const refundedQtyById = new Map(refundReqs.map(r => [r.item.id, r.refundQty]));
      fullyRefunded = items.every(it => (it.quantity - (refundedQtyById.get(it.id) ?? 0)) <= 0);

      for (const { item, refundQty } of refundReqs) {
        const perUnit = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
        const newQty = item.quantity - refundQty;
        const newLineTotal = round2(perUnit * newQty);
        // Conditional update (quantity >= refundQty) as defence-in-depth on top
        // of the row lock; if the line moved underneath us, abort the refund.
        const updated = await tx.update(orderItemsTable)
          .set({
            quantity: newQty,
            lineTotal: newLineTotal,
            refundedQuantity: sql`${orderItemsTable.refundedQuantity} + ${refundQty}`,
          })
          .where(and(eq(orderItemsTable.id, item.id), gte(orderItemsTable.quantity, refundQty)))
          .returning({ id: orderItemsTable.id });
        if (updated.length === 0) {
          throw { httpStatus: 409, httpMessage: `"${item.productName}" changed during refund — please retry` } satisfies RefundErr;
        }

        await restoreLineStock(tx, {
          item,
          restoreQty: refundQty,
          tenantId,
          orderId: existing.id,
          locationId: existing.locationId ?? null,
          meta: metaMap.get(item.productId),
          components: componentsByParent.get(item.productId) ?? [],
          movementType: "refund",
          compositeMovementType: "composite_refund",
          noteVerb: "Partial refund",
          batchSourceType: "refund",
        });
      }

      await tx.update(ordersTable)
        .set({
          subtotal: newSubtotal,
          tax: newTax,
          discountValue: newDiscountValue,
          loyaltyDiscount: newLoyaltyDiscount,
          total: newTotal,
          refundedTotal: newRefundedTotal,
          refundMethod: parsed.data.refundToVoucher ? "voucher" : "cash",
          refundedAt: new Date(),
          status: fullyRefunded ? "refunded" : "completed",
          voidReason: parsed.data.reason,
        })
        .where(and(eq(ordersTable.id, existing.id), eq(ordersTable.tenantId, tenantId)));

      auditItems = refundReqs.map(r => ({ orderItemId: r.item.id, productName: r.item.productName, quantity: r.refundQty }));

      // Refund-to-voucher: issue a NEW store-credit voucher for the refunded
      // amount instead of cash (works regardless of how the order was paid).
      // Created inside the same transaction so a failure can't leave a refund
      // without its store credit (or vice-versa). Each insert attempt runs in a
      // savepoint so a (vanishingly rare) code collision rolls back only the
      // attempt, not the whole refund.
      if (parsed.data.refundToVoucher && refundAmount > 0) {
        // Validate the staff attribution against THIS tenant — never persist a
        // caller-supplied id that doesn't resolve to a tenant staff row (avoids
        // cross-tenant / spoofed attribution on the issued voucher).
        const requestedStaffId = parsed.data.staffId ?? existing.staffId ?? null;
        let actingStaffId: number | null = null;
        let actingStaffName: string | null = null;
        if (requestedStaffId != null) {
          const [s] = await tx
            .select({ id: staffTable.id, name: staffTable.name })
            .from(staffTable)
            .where(and(eq(staffTable.id, requestedStaffId), eq(staffTable.tenantId, tenantId)));
          if (s) {
            actingStaffId = s.id;
            actingStaffName = s.name ?? null;
          }
        }
        const voucherValue = round2(refundAmount);
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = generateVoucherCode();
          try {
            refundVoucher = await tx.transaction(async (sp) => {
              const [v] = await sp
                .insert(giftVouchersTable)
                .values({
                  tenantId,
                  code,
                  originalValue: voucherValue,
                  balance: voucherValue,
                  status: "active",
                  customerId: existing.customerId ?? null,
                  paymentMethod: null,
                  amountPaid: null,
                  notes: `Store credit for refund on order #${existing.id}`,
                  issuedByStaffId: actingStaffId,
                  issuedByName: actingStaffName,
                })
                .returning();
              await sp.insert(giftVoucherTransactionsTable).values({
                tenantId,
                voucherId: v!.id,
                action: "issue",
                amount: voucherValue,
                balanceBefore: 0,
                balanceAfter: voucherValue,
                relatedOrderId: existing.id,
                staffId: actingStaffId,
                staffName: actingStaffName,
                notes: `Store credit issued for refund on order #${existing.id}`,
              });
              return v!;
            });
            break;
          } catch (e) {
            if (isUniqueViolation(e)) continue; // code collided — retry
            throw e;
          }
        }
        if (!refundVoucher) {
          throw { httpStatus: 500, httpMessage: "Could not generate a unique voucher code, please try again" } satisfies RefundErr;
        }
      }
    });
  } catch (e) {
    if (isRefundErr(e)) {
      res.status(e.httpStatus).json({ error: e.httpMessage });
      return;
    }
    throw e;
  }

  const fullOrder = await getOrderWithItems(params.data.id);
  await logAudit({
    tenantId,
    staffId: auditStaffId,
    action: "order.refund_items",
    entityType: "order",
    entityId: params.data.id,
    details: {
      reason: parsed.data.reason,
      refundAmount,
      fullyRefunded,
      items: auditItems,
      refundVoucherId: refundVoucher ? (refundVoucher as typeof giftVouchersTable.$inferSelect).id : undefined,
    },
  });
  res.json(RefundOrderItemsResponse.parse({
    order: fullOrder,
    refundVoucher: refundVoucher ? normalizeVoucher(refundVoucher) : null,
  }));
});

export default router;
