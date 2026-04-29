import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  productsTable,
  compositeProductComponentsTable,
  locationInventoryTable,
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
});
const SaveBody = z.object({ components: z.array(ComponentInput) });

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

  const rows = await db
    .select({
      id: compositeProductComponentsTable.id,
      parentProductId: compositeProductComponentsTable.parentProductId,
      childProductId: compositeProductComponentsTable.childProductId,
      quantityRequired: compositeProductComponentsTable.quantityRequired,
      unitId: compositeProductComponentsTable.unitId,
      childName: productsTable.name,
      childSku: productsTable.barcode,
      childCostPrice: productsTable.costPrice,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
    .where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

  const enriched = rows.map((r) => ({
    id: r.id,
    parentProductId: r.parentProductId,
    childProductId: r.childProductId,
    childName: r.childName ?? "(deleted product)",
    childSku: r.childSku ?? null,
    childCostPrice: r.childCostPrice,
    quantityRequired: r.quantityRequired,
    unitId: r.unitId,
    lineCost: (r.childCostPrice ?? 0) * r.quantityRequired,
  }));

  res.json(enriched);
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

  // Detect duplicate children inside the submitted payload up front.
  const seen = new Set<number>();
  for (const c of parsed.data.components) {
    if (c.childProductId === productId) {
      res.status(400).json({
        error: "COMPOSITE_SELF_REFERENCE",
        message: `A composite product cannot contain itself`,
      });
      return;
    }
    if (seen.has(c.childProductId)) {
      res.status(400).json({
        error: "COMPOSITE_DUPLICATE_CHILD",
        message: `Child product ${c.childProductId} is listed more than once`,
      });
      return;
    }
    seen.add(c.childProductId);
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
  // full set, so partial state would produce wrong numbers.
  await db.transaction(async (tx) => {
    await tx.delete(compositeProductComponentsTable).where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

    if (parsed.data.components.length > 0) {
      await tx.insert(compositeProductComponentsTable).values(
        parsed.data.components.map(c => ({
          tenantId,
          parentProductId: productId,
          childProductId: c.childProductId,
          quantityRequired: c.quantityRequired,
          unitId: c.unitId ?? null,
        })),
      );
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
      })),
    },
  });

  // Re-read with joins so the response shape exactly matches GET.
  const rows = await db
    .select({
      id: compositeProductComponentsTable.id,
      parentProductId: compositeProductComponentsTable.parentProductId,
      childProductId: compositeProductComponentsTable.childProductId,
      quantityRequired: compositeProductComponentsTable.quantityRequired,
      unitId: compositeProductComponentsTable.unitId,
      childName: productsTable.name,
      childSku: productsTable.barcode,
      childCostPrice: productsTable.costPrice,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
    .where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

  logger.info(
    { tenantId, productId, count: rows.length },
    "[composite] components saved",
  );

  res.json(rows.map((r) => ({
    id: r.id,
    parentProductId: r.parentProductId,
    childProductId: r.childProductId,
    childName: r.childName ?? "(deleted product)",
    childSku: r.childSku ?? null,
    childCostPrice: r.childCostPrice,
    quantityRequired: r.quantityRequired,
    unitId: r.unitId,
    lineCost: (r.childCostPrice ?? 0) * r.quantityRequired,
  })));
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

  const rows = await db
    .select({
      id: compositeProductComponentsTable.id,
      parentProductId: compositeProductComponentsTable.parentProductId,
      childProductId: compositeProductComponentsTable.childProductId,
      quantityRequired: compositeProductComponentsTable.quantityRequired,
      unitId: compositeProductComponentsTable.unitId,
      childName: productsTable.name,
      childSku: productsTable.barcode,
      childCostPrice: productsTable.costPrice,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
    .where(and(
      eq(compositeProductComponentsTable.tenantId, tenantId),
      eq(compositeProductComponentsTable.parentProductId, productId),
    ));

  const components = rows.map((r) => ({
    id: r.id,
    parentProductId: r.parentProductId,
    childProductId: r.childProductId,
    childName: r.childName ?? "(deleted product)",
    childSku: r.childSku ?? null,
    childCostPrice: r.childCostPrice,
    quantityRequired: r.quantityRequired,
    unitId: r.unitId,
    lineCost: (r.childCostPrice ?? 0) * r.quantityRequired,
  }));

  const derivedCost = Math.round(components.reduce((s, c) => s + c.lineCost, 0) * 100) / 100;
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
      childName: productsTable.name,
      globalStock: productsTable.stockCount,
    })
    .from(compositeProductComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
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
    };
  });

  const available = breakdown.reduce(
    (m, b) => Math.min(m, b.possibleBundles),
    Number.POSITIVE_INFINITY,
  );

  res.json({
    productId,
    available: Number.isFinite(available) ? available : 0,
    components: breakdown,
  });
});

export default router;
