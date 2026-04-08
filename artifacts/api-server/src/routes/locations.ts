import { Router, type IRouter } from "express";
import { db, locationsTable, staffLocationsTable, locationInventoryTable, stockTransfersTable, productsTable, staffTable, productLocationsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Locations CRUD ─── */
router.get("/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const locations = await db.select().from(locationsTable)
    .where(eq(locationsTable.tenantId, tenantId))
    .orderBy(locationsTable.name);
  res.json(locations);
});

const LocationBody = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.post("/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = LocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [loc] = await db.insert(locationsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(loc);
});

router.patch("/locations/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  const parsed = LocationBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [loc] = await db.update(locationsTable).set(parsed.data)
    .where(and(eq(locationsTable.id, id), eq(locationsTable.tenantId, tenantId))).returning();
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(loc);
});

router.delete("/locations/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(locationsTable).set({ isActive: false })
    .where(and(eq(locationsTable.id, id), eq(locationsTable.tenantId, tenantId)));
  res.json({ success: true });
});

/* ─── Location Inventory ─── */
router.get("/locations/:id/inventory", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)));
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }

  const inventory = await db
    .select({
      id: locationInventoryTable.id,
      locationId: locationInventoryTable.locationId,
      productId: locationInventoryTable.productId,
      stockCount: locationInventoryTable.stockCount,
      updatedAt: locationInventoryTable.updatedAt,
      productName: productsTable.name,
      productCategory: productsTable.category,
      productPrice: productsTable.price,
      productBarcode: productsTable.barcode,
    })
    .from(locationInventoryTable)
    .leftJoin(productsTable, and(eq(productsTable.id, locationInventoryTable.productId), eq(productsTable.tenantId, tenantId)))
    .where(eq(locationInventoryTable.locationId, locationId))
    .orderBy(productsTable.name);
  res.json(inventory);
});

router.put("/locations/:id/inventory/:productId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const productId = parseInt(req.params["productId"] ?? "0", 10);

  const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)));
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }

  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!prod) { res.status(404).json({ error: "Product not found" }); return; }

  const { stockCount } = req.body as { stockCount?: number };
  if (stockCount === undefined || isNaN(Number(stockCount))) {
    res.status(400).json({ error: "stockCount is required" }); return;
  }
  const existing = await db
    .select()
    .from(locationInventoryTable)
    .where(and(eq(locationInventoryTable.locationId, locationId), eq(locationInventoryTable.productId, productId)));

  if (existing.length > 0) {
    const [inv] = await db
      .update(locationInventoryTable)
      .set({ stockCount: Number(stockCount), updatedAt: new Date() })
      .where(and(eq(locationInventoryTable.locationId, locationId), eq(locationInventoryTable.productId, productId)))
      .returning();
    res.json(inv);
  } else {
    const [inv] = await db
      .insert(locationInventoryTable)
      .values({ locationId, productId, stockCount: Number(stockCount) })
      .returning();
    res.status(201).json(inv);
  }
});

/* ─── Initialize location inventory from all tenant products ─── */
router.post("/locations/:id/inventory/init", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)));
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }

  const products = await db.select({ id: productsTable.id, stockCount: productsTable.stockCount })
    .from(productsTable).where(eq(productsTable.tenantId, tenantId));
  const existing = await db
    .select({ productId: locationInventoryTable.productId })
    .from(locationInventoryTable)
    .where(eq(locationInventoryTable.locationId, locationId));
  const existingIds = new Set(existing.map(e => e.productId));
  const toInsert = products.filter(p => !existingIds.has(p.id));
  if (toInsert.length > 0) {
    await db.insert(locationInventoryTable).values(toInsert.map(p => ({ locationId, productId: p.id, stockCount: 0 })));
  }
  res.json({ initialized: toInsert.length, skipped: existingIds.size });
});

/* ─── Stock Transfers ─── */
router.get("/stock-transfers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const transfers = await db
    .select({
      id: stockTransfersTable.id,
      fromLocationId: stockTransfersTable.fromLocationId,
      toLocationId: stockTransfersTable.toLocationId,
      productId: stockTransfersTable.productId,
      quantity: stockTransfersTable.quantity,
      notes: stockTransfersTable.notes,
      createdAt: stockTransfersTable.createdAt,
      productName: productsTable.name,
    })
    .from(stockTransfersTable)
    .leftJoin(productsTable, and(eq(productsTable.id, stockTransfersTable.productId), eq(productsTable.tenantId, tenantId)))
    .orderBy(sql`${stockTransfersTable.createdAt} DESC`)
    .limit(200);

  const locationIds = [...new Set([
    ...transfers.map(t => t.fromLocationId).filter(Boolean),
    ...transfers.map(t => t.toLocationId).filter(Boolean),
  ])] as number[];

  const locations = locationIds.length > 0
    ? await db.select({ id: locationsTable.id, name: locationsTable.name }).from(locationsTable)
        .where(and(inArray(locationsTable.id, locationIds), eq(locationsTable.tenantId, tenantId)))
    : [];

  const locMap = new Map(locations.map(l => [l.id, l.name]));

  res.json(transfers.map(t => ({
    ...t,
    fromLocationName: t.fromLocationId ? locMap.get(t.fromLocationId) ?? null : null,
    toLocationName: t.toLocationId ? locMap.get(t.toLocationId) ?? null : null,
  })));
});

const TransferBody = z.object({
  fromLocationId: z.number().int().optional(),
  toLocationId: z.number().int().optional(),
  productId: z.number().int(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});

router.post("/stock-transfers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = TransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { fromLocationId, toLocationId, productId, quantity, notes } = parsed.data;

  if (!fromLocationId && !toLocationId) {
    res.status(400).json({ error: "At least one of fromLocationId or toLocationId is required" }); return;
  }

  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!prod) { res.status(404).json({ error: "Product not found" }); return; }

  if (fromLocationId) {
    const [fromLoc] = await db.select({ id: locationsTable.id }).from(locationsTable)
      .where(and(eq(locationsTable.id, fromLocationId), eq(locationsTable.tenantId, tenantId)));
    if (!fromLoc) { res.status(404).json({ error: "Source location not found" }); return; }

    const [src] = await db
      .select()
      .from(locationInventoryTable)
      .where(and(eq(locationInventoryTable.locationId, fromLocationId), eq(locationInventoryTable.productId, productId)));

    if (!src || src.stockCount < quantity) {
      res.status(400).json({ error: `Insufficient stock at source location (available: ${src?.stockCount ?? 0})` }); return;
    }
    await db
      .update(locationInventoryTable)
      .set({ stockCount: sql`${locationInventoryTable.stockCount} - ${quantity}`, updatedAt: new Date() })
      .where(and(eq(locationInventoryTable.locationId, fromLocationId), eq(locationInventoryTable.productId, productId)));
  }

  if (toLocationId) {
    const [toLoc] = await db.select({ id: locationsTable.id }).from(locationsTable)
      .where(and(eq(locationsTable.id, toLocationId), eq(locationsTable.tenantId, tenantId)));
    if (!toLoc) { res.status(404).json({ error: "Destination location not found" }); return; }

    const [dst] = await db
      .select()
      .from(locationInventoryTable)
      .where(and(eq(locationInventoryTable.locationId, toLocationId), eq(locationInventoryTable.productId, productId)));

    if (dst) {
      await db
        .update(locationInventoryTable)
        .set({ stockCount: sql`${locationInventoryTable.stockCount} + ${quantity}`, updatedAt: new Date() })
        .where(and(eq(locationInventoryTable.locationId, toLocationId), eq(locationInventoryTable.productId, productId)));
    } else {
      await db.insert(locationInventoryTable).values({ locationId: toLocationId, productId, stockCount: quantity });
    }
  }

  const [transfer] = await db.insert(stockTransfersTable).values({ fromLocationId, toLocationId, productId, quantity, notes }).returning();
  res.status(201).json(transfer);
});

/* ─── Location Staff list ─── */
router.get("/locations/:id/staff", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)));
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }

  const rows = await db
    .select({
      id: staffTable.id,
      name: staffTable.name,
      role: staffTable.role,
      isActive: staffTable.isActive,
      isPrimary: staffLocationsTable.isPrimary,
    })
    .from(staffLocationsTable)
    .leftJoin(staffTable, eq(staffTable.id, staffLocationsTable.staffId))
    .where(eq(staffLocationsTable.locationId, locationId))
    .orderBy(staffTable.name);
  res.json(rows);
});

/* ─── Product ↔ Location availability ─── */

router.get("/products/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params["id"] ?? "0", 10);
  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!prod) { res.status(404).json({ error: "Product not found" }); return; }

  const locations = await db.select().from(locationsTable)
    .where(and(eq(locationsTable.tenantId, tenantId), eq(locationsTable.isActive, true)))
    .orderBy(locationsTable.name);

  const plRows = await db.select().from(productLocationsTable)
    .where(eq(productLocationsTable.productId, productId));

  const plMap = new Map(plRows.map((r) => [r.locationId, r]));

  res.json(locations.map((loc) => {
    const pl = plMap.get(loc.id);
    return {
      locationId: loc.id,
      locationName: loc.name,
      isAvailable: pl ? pl.isAvailable : true,
      priceOverride: pl ? pl.priceOverride : null,
    };
  }));
});

const ProductLocationBody = z.object({
  isAvailable: z.boolean(),
  priceOverride: z.number().nullable().optional(),
});

router.put("/products/:id/locations/:locationId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params["id"] ?? "0", 10);
  const locationId = parseInt(req.params["locationId"] ?? "0", 10);

  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!prod) { res.status(404).json({ error: "Product not found" }); return; }

  const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)));
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }

  const parsed = ProductLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(productLocationsTable)
    .values({
      productId,
      locationId,
      isAvailable: parsed.data.isAvailable,
      priceOverride: parsed.data.priceOverride ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [productLocationsTable.productId, productLocationsTable.locationId],
      set: {
        isAvailable: parsed.data.isAvailable,
        priceOverride: parsed.data.priceOverride ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(row);
});

export default router;
