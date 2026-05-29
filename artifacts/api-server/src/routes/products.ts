import { Router, type IRouter } from "express";
import { eq, like, and, inArray, isNull, isNotNull, type SQL, count, desc, asc, gte, lte } from "drizzle-orm";
import { db, productsTable, variantGroupsTable, modifierGroupsTable, locationsTable, productLocationsTable, locationInventoryTable, stockMovementsTable, compositeProductComponentsTable } from "@workspace/db";
import { logAudit } from "./audit";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  GetProductResponse,
  UpdateProductParams,
  UpdateProductResponse,
  DeleteProductParams,
  ListProductsResponse,
  ListProductsQueryParams,
  BulkArchiveProductsBody,
  BulkRestoreProductsBody,
} from "@workspace/api-zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

async function withFlags(p: typeof productsTable.$inferSelect) {
  const [vCount] = await db
    .select({ n: count() })
    .from(variantGroupsTable)
    .where(eq(variantGroupsTable.productId, p.id));
  const [mCount] = await db
    .select({ n: count() })
    .from(modifierGroupsTable)
    .where(eq(modifierGroupsTable.productId, p.id));
  const [cCount] = await db
    .select({ n: count() })
    .from(compositeProductComponentsTable)
    .where(eq(compositeProductComponentsTable.parentProductId, p.id));

  return {
    ...p,
    imageUrl: p.imageUrl ?? undefined,
    description: p.description ?? undefined,
    barcode: p.barcode ?? undefined,
    hasVariants: Number(vCount.n) > 0,
    hasModifiers: Number(mCount.n) > 0,
    isComposite: Number(cCount.n) > 0,
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [eq(productsTable.tenantId, tenantId)];
  // Archived (soft-deleted) products are hidden by default. Pass
  // includeArchived=true to surface them (e.g. the "Show archived" toggle).
  if (!query.data.includeArchived) {
    conditions.push(isNull(productsTable.archivedAt));
  }
  if (query.data.category) {
    conditions.push(eq(productsTable.category, query.data.category));
  }
  if (query.data.search) {
    conditions.push(like(productsTable.name, `%${query.data.search}%`));
  }

  const products = await db.select().from(productsTable).where(and(...conditions));

  const locationId = query.data.locationId;
  let overrides: { productId: number; priceOverride: number | null; isAvailable: boolean }[] = [];
  let locationStock: { productId: number; stockCount: number }[] = [];
  if (locationId) {
    [overrides, locationStock] = await Promise.all([
      db
        .select({ productId: productLocationsTable.productId, priceOverride: productLocationsTable.priceOverride, isAvailable: productLocationsTable.isAvailable })
        .from(productLocationsTable)
        .where(eq(productLocationsTable.locationId, locationId)),
      db
        .select({ productId: locationInventoryTable.productId, stockCount: locationInventoryTable.stockCount })
        .from(locationInventoryTable)
        .where(eq(locationInventoryTable.locationId, locationId)),
    ]);
  }

  const stockMap = new Map(locationStock.map((s) => [s.productId, s.stockCount]));

  // ── Composite product stock derivation ─────────────────────────────────
  // For composite products, the persisted stock_count is always 0 (the row
  // is a "recipe", not a stockable item). The real availability is the
  // maximum number of bundles we can build from current component stock:
  //
  //   maxBuildable = min over each component of floor(componentStock / qty)
  //
  // We compute this in batch for ALL composite parents in the response so
  // the client list naturally shows the correct quantity (and isn't a
  // false "Out of stock"). Per-location stock is honored when a locationId
  // is supplied.
  const compositeIds = products
    .filter((p) => p.structureType === "composite")
    .map((p) => p.id);

  const compositeStockMap = new Map<number, number>();
  if (compositeIds.length > 0) {
    const components = await db
      .select({
        parentProductId: compositeProductComponentsTable.parentProductId,
        childProductId: compositeProductComponentsTable.childProductId,
        quantityRequired: compositeProductComponentsTable.quantityRequired,
        childGlobalStock: productsTable.stockCount,
      })
      .from(compositeProductComponentsTable)
      .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
      .where(and(
        eq(compositeProductComponentsTable.tenantId, tenantId),
        inArray(compositeProductComponentsTable.parentProductId, compositeIds),
      ));

    // Resolve child stock: per-location when locationId is set, else global.
    let childStockOf = (childId: number, fallbackGlobal: number) => fallbackGlobal;
    if (locationId) {
      const childIds = Array.from(new Set(components.map((c) => c.childProductId)));
      const childInv = childIds.length
        ? await db
            .select({
              productId: locationInventoryTable.productId,
              stockCount: locationInventoryTable.stockCount,
            })
            .from(locationInventoryTable)
            .where(and(
              eq(locationInventoryTable.locationId, locationId),
              inArray(locationInventoryTable.productId, childIds),
            ))
        : [];
      const childInvMap = new Map(childInv.map((i) => [i.productId, i.stockCount]));
      // When locationId is supplied, children without a row at this
      // location contribute 0 — this matches the existing
      // /products/:id/available-composite-quantity endpoint.
      childStockOf = (childId: number) => childInvMap.get(childId) ?? 0;
    }

    // Group components by parent and reduce.
    const byParent = new Map<number, { childProductId: number; quantityRequired: number; childGlobalStock: number | null }[]>();
    for (const c of components) {
      const list = byParent.get(c.parentProductId) ?? [];
      list.push(c);
      byParent.set(c.parentProductId, list);
    }
    for (const parentId of compositeIds) {
      const list = byParent.get(parentId) ?? [];
      if (list.length === 0) {
        // Composite with no components yet → genuinely 0 buildable.
        compositeStockMap.set(parentId, 0);
        continue;
      }
      let max = Number.POSITIVE_INFINITY;
      for (const c of list) {
        const stock = childStockOf(c.childProductId, c.childGlobalStock ?? 0);
        const possible = c.quantityRequired > 0
          ? Math.floor(stock / c.quantityRequired)
          : 0;
        if (possible < max) max = possible;
      }
      compositeStockMap.set(parentId, Number.isFinite(max) ? max : 0);
    }
  }
  // ──────────────────────────────────────────────────────────────────────

  const enriched = await Promise.all(
    products.map(async (p) => {
      const override = overrides.find((o) => o.productId === p.id);
      const effectivePrice = override?.priceOverride != null ? override.priceOverride : p.price;
      const isComposite = p.structureType === "composite";
      // Composite stock is derived; the persisted stock_count (and any
      // location_inventory row) for a composite is meaningless.
      const effectiveStockCount = isComposite
        ? compositeStockMap.get(p.id) ?? 0
        : (locationId && stockMap.has(p.id) ? stockMap.get(p.id)! : p.stockCount);
      // Composites are "in stock" iff at least 1 bundle can be built.
      // Simple products keep the existing per-location override semantics.
      const effectiveInStock = isComposite
        ? (locationId
            ? (override ? override.isAvailable && effectiveStockCount > 0 : effectiveStockCount > 0)
            : effectiveStockCount > 0)
        : (locationId ? (override ? override.isAvailable && p.inStock : p.inStock) : p.inStock);
      return withFlags({ ...p, price: effectivePrice, inStock: effectiveInStock, stockCount: effectiveStockCount });
    })
  );

  res.json(ListProductsResponse.parse(enriched));
});

router.post("/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Composite parents have no inventory of their own — stock is derived
  // from child components. Force stockCount to 0 regardless of input so
  // POS / reports never see a misleading number on the parent row.
  const isComposite = parsed.data.structureType === "composite";

  // Batch tracking is only valid for simple products in MVP. Variant and
  // composite products are explicitly out of scope (their stock lives in
  // separate tables and the order-flow batch deduction wouldn't fire).
  if (parsed.data.trackBatches && isComposite) {
    res.status(400).json({ error: "Batch tracking is not supported for composite products." });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      category: parsed.data.category,
      imageUrl: parsed.data.imageUrl,
      barcode: parsed.data.barcode,
      inStock: parsed.data.inStock ?? true,
      stockCount: isComposite ? 0 : (parsed.data.stockCount ?? 0),
      soldByWeight: parsed.data.soldByWeight ?? false,
      // Default a sensible unit when sold-by-weight is enabled but the
      // caller didn't pick one. Leave NULL when the product is sold by
      // each so weight-only flows can detect "no scale unit configured".
      unitOfMeasure: parsed.data.soldByWeight
        ? (parsed.data.unitOfMeasure ?? "kg")
        : null,
      costPrice: parsed.data.costPrice ?? null,
      structureType: parsed.data.structureType ?? "simple",
      isTaxable: parsed.data.isTaxable ?? true,
      trackBatches: parsed.data.trackBatches ?? false,
      stockMethodOverride: parsed.data.stockMethodOverride ?? null,
    })
    .returning();

  await logAudit({ tenantId, action: "product.create", entityType: "product", entityId: product?.id, details: { name: parsed.data.name, price: parsed.data.price, structureType: product?.structureType } });
  res.status(201).json(GetProductResponse.parse(await withFlags(product)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(GetProductResponse.parse(await withFlags(product)));
});

router.put("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Build the update set so undefined fields don't overwrite existing
  // columns with NULL. soldByWeight + unitOfMeasure are always paired:
  // if the caller explicitly toggles soldByWeight off, also clear the
  // unit so the DB reflects "this product is no longer weighed".
  const updates: Record<string, unknown> = {
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    category: parsed.data.category,
    imageUrl: parsed.data.imageUrl,
    barcode: parsed.data.barcode,
    inStock: parsed.data.inStock,
    stockCount: parsed.data.stockCount,
  };
  if (parsed.data.soldByWeight !== undefined) {
    updates["soldByWeight"] = parsed.data.soldByWeight;
    if (parsed.data.soldByWeight) {
      updates["unitOfMeasure"] = parsed.data.unitOfMeasure ?? "kg";
    } else {
      updates["unitOfMeasure"] = null;
    }
  } else if (parsed.data.unitOfMeasure !== undefined) {
    updates["unitOfMeasure"] = parsed.data.unitOfMeasure;
  }

  // Cost basis & structure type. costPrice null is meaningful ("not yet
  // costed"), so we only write when explicitly provided in the body.
  if (parsed.data.costPrice !== undefined) {
    updates["costPrice"] = parsed.data.costPrice;
  }
  if (parsed.data.isTaxable !== undefined) {
    updates["isTaxable"] = parsed.data.isTaxable;
  }
  if (parsed.data.trackBatches !== undefined) {
    if (parsed.data.trackBatches === true) {
      // Reject batch tracking on composite or variant-tracked products
      // (MVP scope). Look up current row + variant presence.
      const [cur] = await db.select({ structureType: productsTable.structureType })
        .from(productsTable)
        .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));
      const targetStruct = parsed.data.structureType ?? cur?.structureType;
      if (targetStruct === "composite") {
        res.status(400).json({ error: "Batch tracking is not supported for composite products." });
        return;
      }
      const [variantGroup] = await db.select({ id: variantGroupsTable.id })
        .from(variantGroupsTable)
        .where(eq(variantGroupsTable.productId, params.data.id))
        .limit(1);
      if (variantGroup) {
        res.status(400).json({ error: "Batch tracking is not supported for products with variants." });
        return;
      }
    }
    updates["trackBatches"] = parsed.data.trackBatches;
  }
  if (parsed.data.stockMethodOverride !== undefined) {
    updates["stockMethodOverride"] = parsed.data.stockMethodOverride;
  }
  if (parsed.data.structureType !== undefined) {
    updates["structureType"] = parsed.data.structureType;
    // Switching a product to composite means its parent stock is no
    // longer authoritative — wipe it so reports / POS show 0 instead of
    // a stale number that nothing increments. Available count comes
    // from /products/:id/available-composite-quantity at sale time.
    if (parsed.data.structureType === "composite") {
      updates["stockCount"] = 0;
    }
  }

  // Fetch the prior row so we can detect "trackBatches just toggled on"
  // and backfill a single legacy batch with the existing stockCount.
  const [prior] = await db
    .select({ trackBatches: productsTable.trackBatches, stockCount: productsTable.stockCount })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));

  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Backfill: toggling trackBatches on means existing stock has no batch
  // history. Create one "legacy" batch (no expiry, no batch number) for
  // the current stockCount so SUM(batches) == product.stockCount.
  if (
    parsed.data.trackBatches === true
    && prior?.trackBatches === false
    && (prior.stockCount ?? 0) > 0
  ) {
    const { productBatchesTable } = await import("@workspace/db");
    await db.insert(productBatchesTable).values({
      tenantId,
      productId: product.id,
      quantityRemaining: prior.stockCount,
      sourceType: "legacy",
      notes: "Auto-created on enabling batch tracking",
    });
  }

  await logAudit({ tenantId, action: "product.update", entityType: "product", entityId: product.id, details: { name: product.name, price: product.price } });
  res.json(UpdateProductResponse.parse(await withFlags(product)));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Soft delete (archive): we never hard-delete a product because its
  // historical records (order_items, purchase_bill_items, accounting links)
  // must be preserved for audit/reporting. Archiving hides it from the
  // catalog/POS/menu while keeping all history. Restorable via bulk-restore.
  const [product] = await db
    .update(productsTable)
    .set({ archivedAt: new Date() })
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  await logAudit({ tenantId, action: "product.archive", entityType: "product", entityId: product.id, details: { name: product.name } });
  res.sendStatus(204);
});

/* ── Bulk archive / restore (soft delete) ──────────────────────────────────
 * Bulk delete preserves history by archiving rather than hard-deleting.
 * Both endpoints are tenant-scoped and idempotent. */
router.post("/products/bulk-archive", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = BulkArchiveProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .update(productsTable)
    .set({ archivedAt: new Date() })
    .where(and(
      eq(productsTable.tenantId, tenantId),
      inArray(productsTable.id, parsed.data.ids),
      isNull(productsTable.archivedAt),
    ))
    .returning({ id: productsTable.id });

  if (rows.length > 0) {
    await logAudit({ tenantId, action: "product.bulk_archive", entityType: "product", entityId: 0, details: { ids: rows.map((r) => r.id) } });
  }
  res.json({ count: rows.length });
});

router.post("/products/bulk-restore", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = BulkRestoreProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .update(productsTable)
    .set({ archivedAt: null })
    .where(and(
      eq(productsTable.tenantId, tenantId),
      inArray(productsTable.id, parsed.data.ids),
      isNotNull(productsTable.archivedAt),
    ))
    .returning({ id: productsTable.id });

  if (rows.length > 0) {
    await logAudit({ tenantId, action: "product.bulk_restore", entityType: "product", entityId: 0, details: { ids: rows.map((r) => r.id) } });
  }
  res.json({ count: rows.length });
});

/* ── Product location availability & pricing ── */

router.get("/products/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [locations, overrides, inventoryRows] = await Promise.all([
    db.select().from(locationsTable)
      .where(and(eq(locationsTable.tenantId, tenantId), eq(locationsTable.isActive, true)))
      .orderBy(locationsTable.name),
    db.select().from(productLocationsTable).where(eq(productLocationsTable.productId, productId)),
    db.select({ locationId: locationInventoryTable.locationId, stockCount: locationInventoryTable.stockCount })
      .from(locationInventoryTable)
      .where(eq(locationInventoryTable.productId, productId)),
  ]);

  const invMap = new Map(inventoryRows.map((r) => [r.locationId, r.stockCount]));

  const result = locations.map((loc) => {
    const override = overrides.find((o) => o.locationId === loc.id);
    return {
      locationId: loc.id,
      locationName: loc.name,
      isAvailable: override ? override.isAvailable : true,
      priceOverride: override?.priceOverride ?? null,
      stockCount: invMap.get(loc.id) ?? null,
    };
  });

  res.json(result);
});

router.put("/products/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const { locations } = req.body as {
    locations: Array<{ locationId: number; isAvailable: boolean; priceOverride: number | null }>;
  };

  if (!Array.isArray(locations)) { res.status(400).json({ error: "locations must be an array" }); return; }

  for (const loc of locations) {
    await db
      .insert(productLocationsTable)
      .values({
        productId,
        locationId: loc.locationId,
        isAvailable: loc.isAvailable,
        priceOverride: loc.priceOverride ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [productLocationsTable.productId, productLocationsTable.locationId],
        set: {
          isAvailable: loc.isAvailable,
          priceOverride: loc.priceOverride ?? null,
          updatedAt: new Date(),
        },
      });
  }

  res.json({ success: true, updated: locations.length });
});

/* ── Stock History ── */

router.get("/products/:id/stock-history", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id, name: productsTable.name, barcode: productsTable.barcode, stockCount: productsTable.stockCount })
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const limit = Math.min(parseInt((req.query.limit as string) ?? "500", 10) || 500, 2000);

  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;

  const conditions: SQL[] = [
    eq(stockMovementsTable.productId, productId),
    eq(stockMovementsTable.tenantId, tenantId),
  ];
  if (fromStr) {
    const fromDate = new Date(fromStr);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(stockMovementsTable.createdAt, fromDate));
  }
  if (toStr) {
    const toDate = new Date(toStr);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovementsTable.createdAt, toDate));
    }
  }

  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(and(...conditions))
    .orderBy(asc(stockMovementsTable.createdAt))
    .limit(limit);

  res.json({
    product: { id: product.id, name: product.name, sku: product.barcode, currentStock: product.stockCount },
    movements,
  });
});

export default router;
