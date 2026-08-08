import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  productsTable,
  compositeProductComponentsTable,
  locationInventoryTable,
  variantOptionsTable,
  variantGroupsTable,
} from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { logAudit } from "./audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ─── Auth helper (matches the rest of the API) ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

async function ensureProduct(tenantId: number, productId: number) {
  const [p] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  return p ?? null;
}

/**
 * Walk the composite tree starting at `startId` looking for `targetId`.
 * Returns true if `targetId` appears anywhere in the descendant set of
 * `startId`. Used to block circular references when saving components.
 *
 * Tenant-scoped — never traverses cross-tenant data.
 */
async function isDescendant(tenantId: number, startId: number, targetId: number): Promise<boolean> {
  const visited = new Set<number>([startId]);
  let frontier: number[] = [startId];
  while (frontier.length > 0) {
    const rows = await db
      .select({
        parentId: compositeProductComponentsTable.parentProductId,
        childId: compositeProductComponentsTable.childProductId,
      })
      .from(compositeProductComponentsTable)
      .where(and(
        eq(compositeProductComponentsTable.tenantId, tenantId),
        inArray(compositeProductComponentsTable.parentProductId, frontier),
      ));
    if (rows.length === 0) return false;
    const next: number[] = [];
    for (const r of rows) {
      if (r.childId === targetId) return true;
      if (!visited.has(r.childId)) {
        visited.add(r.childId);
        next.push(r.childId);
      }
    }
    frontier = next;
  }
  return false;
}

const ComponentInput = z.object({
  childProductId: z.number().int().positive(),
  quantityRequired: z.number().positive(),
  unitId: z.number().int().nullable().optional(),
  // Optional link to one of the PARENT product's variant options. NULL/omitted
  // means the component is deducted on every sale of the bundle; set means it
  // is deducted only when that option is chosen (e.g. Colour: Red).
  variantOptionId: z.number().int().positive().nullable().optional(),
});
const SaveBody = z.object({ components: z.array(ComponentInput) });

/** Shared select fragment: component rows joined with child product info and
 *  the linked variant option / group names (for display). */
async function selectComponents(tenantId: number, productId: number) {
  return db
    .select({
      id: compositeProductComponentsTable.id,
      parentProductId: compositeProductComponentsTable.parentProductId,
      childProductId: compositeProductComponentsTable.childProductId,
      quantityRequired: compositeProductComponentsTable.quantityRequired,
      unitId: compositeProductComponentsTable.unitId,
      variantOptionId: compositeProductComponentsTable.variantOptionId,
      variantOptionName: variantOptionsTable.name,
      variantGroupId: variantGroupsTable.id,
      variantGroupName: variantGroupsTable.name,
      childName: productsTable.name,
      childSku: productsTable.barcode,
      childCostPrice: productsTable.costPrice,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
    .leftJoin(variantOptionsTable, eq(variantOptionsTable.id, compositeProductComponentsTable.variantOptionId))
    .leftJoin(variantGroupsTable, eq(variantGroupsTable.id, variantOptionsTable.groupId))
    .where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));
}

type ComponentRow = Awaited<ReturnType<typeof selectComponents>>[number];

function toComponentJson(r: ComponentRow) {
  return {
    id: r.id,
    parentProductId: r.parentProductId,
    childProductId: r.childProductId,
    childName: r.childName ?? "(deleted product)",
    childSku: r.childSku ?? null,
    childCostPrice: r.childCostPrice,
    quantityRequired: r.quantityRequired,
    unitId: r.unitId,
    variantOptionId: r.variantOptionId ?? null,
    variantOptionName: r.variantOptionId != null ? (r.variantOptionName ?? "(deleted option)") : null,
    variantGroupName: r.variantOptionId != null ? (r.variantGroupName ?? null) : null,
    lineCost: (r.childCostPrice ?? 0) * r.quantityRequired,
  };
}

/**
 * Derived cost of a composite whose components may be variant-scoped: always
 * count the unscoped rows, and for each variant group count the most expensive
 * option's subtotal (a sale picks exactly one option per group, so this is the
 * conservative "worst case" cost).
 */
function deriveCost(rows: ComponentRow[]): number {
  const base = rows
    .filter((r) => r.variantOptionId == null)
    .reduce((s, r) => s + (r.childCostPrice ?? 0) * r.quantityRequired, 0);
  const byOption = new Map<number, { groupKey: number | string; subtotal: number }>();
  for (const r of rows) {
    if (r.variantOptionId == null) continue;
    const e = byOption.get(r.variantOptionId) ?? { groupKey: r.variantGroupId ?? `o${r.variantOptionId}`, subtotal: 0 };
    e.subtotal += (r.childCostPrice ?? 0) * r.quantityRequired;
    byOption.set(r.variantOptionId, e);
  }
  const maxByGroup = new Map<number | string, number>();
  for (const { groupKey, subtotal } of byOption.values()) {
    maxByGroup.set(groupKey, Math.max(maxByGroup.get(groupKey) ?? 0, subtotal));
  }
  let cost = base;
  for (const v of maxByGroup.values()) cost += v;
  return cost;
}

/* ────────────────────────────────────────────────────────────────────
 * GET /products/:id/composite-components
 *   Returns the component list of a composite parent, joined with each
 *   child's name / barcode / cost so the editor and POS can render
 *   "Coke Single Bottle — qty 24 @ $100 = $2,400" without extra round
 *   trips.
 * ────────────────────────────────────────────────────────────────────*/
router.get("/products/:id/composite-components", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parent = await ensureProduct(tenantId, productId);
  if (!parent) { res.status(404).json({ error: "Product not found" }); return; }

  const rows = await selectComponents(tenantId, productId);
  res.json(rows.map(toComponentJson));
});

/* ────────────────────────────────────────────────────────────────────
 * PUT /products/:id/composite-components
 *   Replace-all save of the component list. Mirrors the pattern used
 *   by pricing-tiers / purchase-units. Validation:
 *     - parent owned by tenant + structureType='composite'
 *     - each child exists, owned by tenant, not the parent itself
 *     - quantityRequired > 0
 *     - no duplicate child rows in the payload
 *     - no circular reference (parent must not appear in any child's
 *       descendant tree)
 * ────────────────────────────────────────────────────────────────────*/
router.put("/products/:id/composite-components", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_INPUT", message: parsed.error.message });
    return;
  }

  const parent = await ensureProduct(tenantId, productId);
  if (!parent) { res.status(404).json({ error: "Product not found" }); return; }

  // Spec: a composite product must have at least one component. Empty
  // saves are rejected so callers cannot leave an orphaned composite
  // parent that would derive cost=0 and available=0.
  if (parsed.data.components.length === 0) {
    res.status(400).json({
      error: "COMPOSITE_REQUIRES_COMPONENT",
      message: "A composite product must include at least one component",
    });
    return;
  }

  // Detect duplicate children inside the submitted payload up front. The same
  // child may appear once per variant option (and once unscoped), but never
  // twice under the same scope.
  const seen = new Set<string>();
  for (const c of parsed.data.components) {
    if (c.childProductId === productId) {
      res.status(400).json({
        error: "COMPOSITE_SELF_REFERENCE",
        message: `A composite product cannot contain itself`,
      });
      return;
    }
    const key = `${c.childProductId}:${c.variantOptionId ?? "always"}`;
    if (seen.has(key)) {
      res.status(400).json({
        error: "COMPOSITE_DUPLICATE_CHILD",
        message: `Child product ${c.childProductId} is listed more than once for the same variant scope`,
      });
      return;
    }
    seen.add(key);
  }

  // Every referenced variant option must belong to a variant group of THIS
  // parent product — never another product's options.
  const optionIds = Array.from(new Set(
    parsed.data.components
      .map((c) => c.variantOptionId)
      .filter((id): id is number => typeof id === "number"),
  ));
  if (optionIds.length > 0) {
    const validOptions = await db
      .select({ id: variantOptionsTable.id })
      .from(variantOptionsTable)
      .innerJoin(variantGroupsTable, eq(variantGroupsTable.id, variantOptionsTable.groupId))
      .where(and(
        inArray(variantOptionsTable.id, optionIds),
        eq(variantGroupsTable.productId, productId),
      ));
    const validSet = new Set(validOptions.map((o) => o.id));
    for (const id of optionIds) {
      if (!validSet.has(id)) {
        res.status(400).json({
          error: "COMPOSITE_INVALID_VARIANT_OPTION",
          message: `Variant option ${id} does not belong to this product`,
        });
        return;
      }
    }
  }

  // Validate every child product exists in this tenant.
  if (parsed.data.components.length > 0) {
    const childIds = parsed.data.components.map(c => c.childProductId);
    const children = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(
        inArray(productsTable.id, childIds),
        eq(productsTable.tenantId, tenantId),
      ));
    const foundIds = new Set(children.map(c => c.id));
    for (const id of childIds) {
      if (!foundIds.has(id)) {
        res.status(400).json({
          error: "COMPOSITE_CHILD_NOT_FOUND",
          message: `Child product ${id} does not exist`,
        });
        return;
      }
    }

    // Circular-reference check: for each candidate child, walk the
    // existing composite tree from that child and refuse if the parent
    // we're saving appears anywhere underneath. We do this BEFORE the
    // delete + insert so the DB never enters an inconsistent state.
    for (const c of parsed.data.components) {
      if (await isDescendant(tenantId, c.childProductId, productId)) {
        res.status(400).json({
          error: "COMPOSITE_CIRCULAR_REFERENCE",
          message: `Cannot include product ${c.childProductId}: it would create a circular reference`,
          childProductId: c.childProductId,
        });
        return;
      }
    }
  }

  // Replace-all inside a transaction so a half-saved composite never
  // exists. Other endpoints (cost / availability / sale flow) read the
  // full set, so partial state would produce wrong numbers. Also flip
  // the parent to structureType='composite' and zero its stock_count
  // here — a composite product owns no inventory of its own.
  await db.transaction(async (tx) => {
    await tx.delete(compositeProductComponentsTable).where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

    await tx.insert(compositeProductComponentsTable).values(
      parsed.data.components.map(c => ({
        tenantId,
        parentProductId: productId,
        childProductId: c.childProductId,
        quantityRequired: c.quantityRequired,
        unitId: c.unitId ?? null,
        variantOptionId: c.variantOptionId ?? null,
      })),
    );

    if (parent.structureType !== "composite" || (parent.stockCount ?? 0) !== 0) {
      await tx
        .update(productsTable)
        .set({ structureType: "composite", stockCount: 0 })
        .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
    }
  });

  await logAudit({
    tenantId,
    action: "composite.update",
    entityType: "product",
    entityId: productId,
    details: {
      parentName: parent.name,
      componentCount: parsed.data.components.length,
      components: parsed.data.components.map(c => ({
        childProductId: c.childProductId,
        quantityRequired: c.quantityRequired,
        variantOptionId: c.variantOptionId ?? null,
      })),
    },
  });

  // Re-read with joins so the response shape exactly matches GET.
  const rows = await selectComponents(tenantId, productId);

  logger.info(
    { tenantId, productId, count: rows.length },
    "[composite] components saved",
  );

  res.json(rows.map(toComponentJson));
});

/* ────────────────────────────────────────────────────────────────────
 * GET /products/:id/composite-cost
 *   derivedCost  = SUM(child.costPrice * quantityRequired)  (null → 0)
 *   grossProfit  = sellingPrice - derivedCost
 *   grossMargin% = (grossProfit / sellingPrice) * 100  (or 0 if price is 0)
 * ────────────────────────────────────────────────────────────────────*/
router.get("/products/:id/composite-cost", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parent = await ensureProduct(tenantId, productId);
  if (!parent) { res.status(404).json({ error: "Product not found" }); return; }

  const rows = await selectComponents(tenantId, productId);
  const components = rows.map(toComponentJson);

  // Variant-scoped rows are alternatives (one option per group is sold), so
  // cost counts unscoped rows plus the most expensive option per group.
  const derivedCost = Math.round(deriveCost(rows) * 100) / 100;
  const sellingPrice = parent.price;
  const grossProfit = Math.round((sellingPrice - derivedCost) * 100) / 100;
  const grossMarginPct = sellingPrice > 0
    ? Math.round((grossProfit / sellingPrice) * 10000) / 100
    : 0;

  res.json({
    productId,
    sellingPrice,
    derivedCost,
    grossProfit,
    grossMarginPct,
    components,
  });
});

/* ────────────────────────────────────────────────────────────────────
 * GET /products/:id/available-composite-quantity?locationId=
 *   For each child:
 *     possibleBundles = floor(stock / quantityRequired)
 *   available = MIN(possibleBundles)  (0 if any child is out of stock)
 *
 *   When ?locationId=N is supplied, child stock comes from
 *   location_inventory rather than the global product.stock_count.
 * ────────────────────────────────────────────────────────────────────*/
router.get("/products/:id/available-composite-quantity", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const locationIdRaw = req.query.locationId as string | undefined;
  const locationId = locationIdRaw ? Number(locationIdRaw) : null;
  if (locationIdRaw && !Number.isFinite(locationId)) {
    res.status(400).json({ error: "Invalid locationId" });
    return;
  }

  const parent = await ensureProduct(tenantId, productId);
  if (!parent) { res.status(404).json({ error: "Product not found" }); return; }

  const components = await db
    .select({
      childProductId: compositeProductComponentsTable.childProductId,
      quantityRequired: compositeProductComponentsTable.quantityRequired,
      variantOptionId: compositeProductComponentsTable.variantOptionId,
      variantOptionName: variantOptionsTable.name,
      variantGroupId: variantGroupsTable.id,
      childName: productsTable.name,
      globalStock: productsTable.stockCount,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
    .leftJoin(variantOptionsTable, eq(variantOptionsTable.id, compositeProductComponentsTable.variantOptionId))
    .leftJoin(variantGroupsTable, eq(variantGroupsTable.id, variantOptionsTable.groupId))
    .where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

  if (components.length === 0) {
    res.json({ productId, available: 0, components: [] });
    return;
  }

  // Optionally swap in per-location stock.
  let stockMap = new Map<number, number>(
    components.map(c => [c.childProductId, c.globalStock ?? 0]),
  );
  if (locationId !== null) {
    const childIds = components.map(c => c.childProductId);
    const inv = await db
      .select({
        productId: locationInventoryTable.productId,
        stockCount: locationInventoryTable.stockCount,
      })
      .from(locationInventoryTable)
      .where(and(
        eq(locationInventoryTable.locationId, locationId),
        inArray(locationInventoryTable.productId, childIds),
      ));
    // Children without a row at this location are treated as 0 stock here.
    const locMap = new Map(inv.map(i => [i.productId, i.stockCount]));
    stockMap = new Map(components.map(c => [
      c.childProductId,
      locMap.get(c.childProductId) ?? 0,
    ]));
  }

  const breakdown = components.map((c) => {
    const stock = stockMap.get(c.childProductId) ?? 0;
    const possible = c.quantityRequired > 0 ? Math.floor(stock / c.quantityRequired) : 0;
    return {
      childProductId: c.childProductId,
      childName: c.childName ?? "(deleted product)",
      stock,
      quantityRequired: c.quantityRequired,
      possibleBundles: possible,
      variantOptionId: c.variantOptionId ?? null,
      variantOptionName: c.variantOptionId != null ? (c.variantOptionName ?? "(deleted option)") : null,
      _groupKey: c.variantOptionId != null ? (c.variantGroupId ?? `o${c.variantOptionId}`) : null,
    };
  });

  // Base availability comes from the always-included components. Variant-
  // scoped components are alternatives: within each variant group the BEST
  // option still caps the bundle count (best-case availability — the shopper
  // can always pick the option that's in stock).
  const baseAvail = breakdown
    .filter((b) => b.variantOptionId == null)
    .reduce((m, b) => Math.min(m, b.possibleBundles), Number.POSITIVE_INFINITY);

  // option → min across that option's rows, then group → max across options.
  const perOption = new Map<number, { groupKey: number | string; min: number }>();
  for (const b of breakdown) {
    if (b.variantOptionId == null) continue;
    const e = perOption.get(b.variantOptionId) ?? { groupKey: b._groupKey!, min: Number.POSITIVE_INFINITY };
    e.min = Math.min(e.min, b.possibleBundles);
    perOption.set(b.variantOptionId, e);
  }
  const bestPerGroup = new Map<number | string, number>();
  for (const { groupKey, min } of perOption.values()) {
    bestPerGroup.set(groupKey, Math.max(bestPerGroup.get(groupKey) ?? 0, min));
  }
  let available = baseAvail;
  for (const best of bestPerGroup.values()) available = Math.min(available, best);

  res.json({
    productId,
    available: Number.isFinite(available) ? available : 0,
    components: breakdown.map(({ _groupKey, ...rest }) => rest),
  });
});

export default router;
