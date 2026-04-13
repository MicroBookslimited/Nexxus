import { Router, type IRouter } from "express";
import { eq, like, and, type SQL, count, desc, asc, gte, lte } from "drizzle-orm";
import { db, productsTable, variantGroupsTable, modifierGroupsTable, locationsTable, productLocationsTable, locationInventoryTable, stockMovementsTable } from "@workspace/db";
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

  return {
    ...p,
    imageUrl: p.imageUrl ?? undefined,
    description: p.description ?? undefined,
    barcode: p.barcode ?? undefined,
    hasVariants: Number(vCount.n) > 0,
    hasModifiers: Number(mCount.n) > 0,
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

  const enriched = await Promise.all(
    products.map(async (p) => {
      const override = overrides.find((o) => o.productId === p.id);
      const effectivePrice = override?.priceOverride != null ? override.priceOverride : p.price;
      const effectiveInStock = locationId ? (override ? override.isAvailable && p.inStock : p.inStock) : p.inStock;
      const effectiveStockCount = locationId && stockMap.has(p.id) ? stockMap.get(p.id)! : p.stockCount;
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
      stockCount: parsed.data.stockCount ?? 0,
    })
    .returning();

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

  const [product] = await db
    .update(productsTable)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      category: parsed.data.category,
      imageUrl: parsed.data.imageUrl,
      barcode: parsed.data.barcode,
      inStock: parsed.data.inStock,
      stockCount: parsed.data.stockCount,
    })
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

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

  const [product] = await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.sendStatus(204);
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
