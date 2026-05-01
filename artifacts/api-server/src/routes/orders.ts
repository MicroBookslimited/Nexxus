import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { logAudit } from "./audit";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, diningTablesTable, locationInventoryTable, accountsReceivableTable, recipesTable, recipeIngredientsTable, ingredientsTable, ingredientUsageLogsTable, stockMovementsTable, productPricingTiersTable, paymentMethodsTable, compositeProductComponentsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

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
    splitCardAmount: order.splitCardAmount ?? undefined,
    splitCashAmount: order.splitCashAmount ?? undefined,
    cashTendered: order.cashTendered ?? undefined,
    notes: order.notes ?? undefined,
    voidReason: order.voidReason ?? undefined,
    customerId: order.customerId ?? undefined,
    tableId: order.tableId ?? undefined,
    staffId: order.staffId ?? undefined,
    orderType: order.orderType ?? undefined,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed ?? undefined,
    loyaltyDiscount: order.loyaltyDiscount ?? undefined,
    completedAt: order.completedAt ?? undefined,
  };
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

  return {
    ...normalizeOrder(order),
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      originalUnitPrice: item.originalUnitPrice ?? undefined,
      discountAmount: item.discountAmount ?? undefined,
      variantAdjustment: item.variantAdjustment ?? undefined,
      modifierAdjustment: item.modifierAdjustment ?? undefined,
      variantChoices: (item.variantChoices as any[] | null) ?? undefined,
      modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
      lineTotal: item.lineTotal,
      notes: item.notes ?? undefined,
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

  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return {
        ...normalizeOrder(order),
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          originalUnitPrice: item.originalUnitPrice ?? undefined,
          discountAmount: item.discountAmount ?? undefined,
          variantAdjustment: item.variantAdjustment ?? undefined,
          modifierAdjustment: item.modifierAdjustment ?? undefined,
          variantChoices: (item.variantChoices as any[] | null) ?? undefined,
          modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
          lineTotal: item.lineTotal,
          notes: item.notes ?? undefined,
        })),
      };
    }),
  );

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
        message: `Quantity for product ${item.productId} must be a positive number`,
      });
      return;
    }
  }

  // Validate payment method is enabled for this tenant (when one is given).
  // Built-in types (cash, card, split, credit) are always permitted if no
  // payment_methods rows exist at all (back-compat for tenants pre-config).
  if (parsed.data.paymentMethod) {
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
  }> = [];

  for (const item of parsed.data.items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }

    const itemDiscount = item.discountAmount ?? 0;
    const variantAdj = (item.variantChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const modifierAdj = (item.modifierChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);

    // Apply volume pricing tiers (server-authoritative — never trust client tier)
    const tiers = await db
      .select()
      .from(productPricingTiersTable)
      .where(and(
        eq(productPricingTiersTable.tenantId, tenantId),
        eq(productPricingTiersTable.productId, product.id),
      ));
    const { unitPrice: tierUnitPrice } = applyVolumePricing(product.price, item.quantity, tiers);

    const effectiveUnitPrice = tierUnitPrice + variantAdj + modifierAdj;
    const lineTotal = Math.max(0, effectiveUnitPrice * item.quantity - itemDiscount);
    rawSubtotal += lineTotal;
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

  let discountValue = 0;
  if (parsed.data.discountAmount && parsed.data.discountType) {
    discountValue =
      parsed.data.discountType === "percent"
        ? rawSubtotal * (parsed.data.discountAmount / 100)
        : parsed.data.discountAmount;
    discountValue = Math.min(discountValue, rawSubtotal);
  }

  const LOYALTY_REDEEM_RATE = 100;
  const pointsToRedeem = parsed.data.loyaltyPointsToRedeem ?? 0;
  const loyaltyDiscount = pointsToRedeem > 0 ? Math.round((pointsToRedeem / LOYALTY_REDEEM_RATE) * 100) / 100 : 0;

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const discountedSubtotal = Math.max(0, rawSubtotal - discountValue - loyaltyDiscount);

  const taxRateValue = await getSetting("tax_rate", tenantId);
  const taxRate = parseFloat(taxRateValue || "15") / 100;
  const allowOverselling = (await getSetting("allow_overselling", tenantId)) === "true";
  const tax = Math.round(discountedSubtotal * taxRate * 100) / 100;
  const total = Math.round((discountedSubtotal + tax) * 100) / 100;

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

      // 1. Atomically decrement stock per item BEFORE creating the order.
      //    This is the only place that enforces "no negative stock".
      //    For composite parents we decrement each child's stock instead,
      //    multiplied by both the cart quantity and the per-component
      //    quantityRequired. A single failing child rolls back the whole
      //    order.
      for (const item of resolvedItems) {
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
          splitCardAmount: parsed.data.splitCardAmount,
          splitCashAmount: parsed.data.splitCashAmount,
          cashTendered: parsed.data.cashTendered,
          notes: parsed.data.notes,
          customerId: parsed.data.customerId,
          tableId: parsed.data.tableId,
          staffId: parsed.data.staffId,
          locationId: parsed.data.locationId,
          orderType: parsed.data.orderType ?? "counter",
          loyaltyPointsRedeemed: pointsToRedeem > 0 ? pointsToRedeem : undefined,
          loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
          completedAt: isPaid ? new Date() : undefined,
        })
        .returning();

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
        amount: order.total,
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
      .select({ id: productsTable.id, structureType: productsTable.structureType })
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
    await db.transaction(async (tx) => {
      for (const item of items) {
        const isComposite = metaMap.get(item.productId)?.structureType === "composite";

        if (isComposite) {
          const components = componentsByParent.get(item.productId) ?? [];
          for (const comp of components) {
            const restored = comp.quantityRequired * item.quantity;
            await tx
              .update(productsTable)
              .set({
                stockCount: sql`${productsTable.stockCount} + ${restored}`,
                inStock: true,
              })
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
              referenceId: order.id,
              notes: `${noteVerb} of ${item.productName} – Order #${order.id}`,
            });

            if (order.locationId) {
              await tx
                .update(locationInventoryTable)
                .set({
                  stockCount: sql`${locationInventoryTable.stockCount} + ${restored}`,
                  updatedAt: new Date(),
                })
                .where(and(
                  eq(locationInventoryTable.locationId, order.locationId),
                  eq(locationInventoryTable.productId, comp.childProductId),
                ));
            }
          }
          continue;
        }

        await tx
          .update(productsTable)
          .set({
            stockCount: sql`${productsTable.stockCount} + ${item.quantity}`,
            inStock: true,
          })
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

        const [afterReturn] = await tx
          .select({ stockCount: productsTable.stockCount })
          .from(productsTable)
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
        await tx.insert(stockMovementsTable).values({
          tenantId,
          productId: item.productId,
          type: movementType,
          quantity: item.quantity,
          balanceAfter: afterReturn?.stockCount ?? 0,
          referenceType: "order",
          referenceId: order.id,
          notes: `${noteVerb} – Order #${order.id}`,
        });

        if (order.locationId) {
          await tx
            .update(locationInventoryTable)
            .set({
              stockCount: sql`${locationInventoryTable.stockCount} + ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(and(
              eq(locationInventoryTable.locationId, order.locationId),
              eq(locationInventoryTable.productId, item.productId),
            ));
        }
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

export default router;
