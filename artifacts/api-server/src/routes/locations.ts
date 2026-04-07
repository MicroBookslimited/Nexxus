import { Router, type IRouter } from "express";
import { db, locationsTable, staffLocationsTable, locationInventoryTable, stockTransfersTable, productsTable, staffTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

/* ─── Locations CRUD ─── */
router.get("/locations", async (_req, res): Promise<void> => {
  const locations = await db.select().from(locationsTable).orderBy(locationsTable.name);
  res.json(locations);
});

const LocationBody = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.post("/locations", async (req, res): Promise<void> => {
  const parsed = LocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [loc] = await db.insert(locationsTable).values(parsed.data).returning();
  res.status(201).json(loc);
});

router.patch("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  const parsed = LocationBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [loc] = await db.update(locationsTable).set(parsed.data).where(eq(locationsTable.id, id)).returning();
  if (!loc) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(loc);
});

router.delete("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(locationsTable).set({ isActive: false }).where(eq(locationsTable.id, id));
  res.json({ success: true });
});

/* ─── Location Inventory ─── */
router.get("/locations/:id/inventory", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params["id"] ?? "0", 10);
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
    .leftJoin(productsTable, eq(productsTable.id, locationInventoryTable.productId))
    .where(eq(locationInventoryTable.locationId, locationId))
    .orderBy(productsTable.name);
  res.json(inventory);
});

router.put("/locations/:id/inventory/:productId", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const productId = parseInt(req.params["productId"] ?? "0", 10);
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

/* ─── Initialize location inventory from all products ─── */
router.post("/locations/:id/inventory/init", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params["id"] ?? "0", 10);
  const products = await db.select({ id: productsTable.id, stockCount: productsTable.stockCount }).from(productsTable);
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
  const locationId = req.query["locationId"] ? parseInt(req.query["locationId"] as string, 10) : undefined;

  const fromLoc = locationsTable;
  const toLoc = { ...locationsTable };

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
    .leftJoin(productsTable, eq(productsTable.id, stockTransfersTable.productId))
    .orderBy(sql`${stockTransfersTable.createdAt} DESC`)
    .limit(200);

  // Attach location names
  const locationIds = [...new Set([
    ...transfers.map(t => t.fromLocationId).filter(Boolean),
    ...transfers.map(t => t.toLocationId).filter(Boolean),
  ])] as number[];

  const locations = locationIds.length > 0
    ? await db.select({ id: locationsTable.id, name: locationsTable.name }).from(locationsTable).where(inArray(locationsTable.id, locationIds))
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
  const parsed = TransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { fromLocationId, toLocationId, productId, quantity, notes } = parsed.data;

  if (!fromLocationId && !toLocationId) {
    res.status(400).json({ error: "At least one of fromLocationId or toLocationId is required" }); return;
  }

  // Deduct from source location inventory
  if (fromLocationId) {
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

  // Add to destination location inventory
  if (toLocationId) {
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

/* ─── Staff-Location Assignments ─── */
router.get("/staff/:id/locations", async (req, res): Promise<void> => {
  const staffId = parseInt(req.params["id"] ?? "0", 10);
  const rows = await db
    .select({
      id: staffLocationsTable.id,
      locationId: staffLocationsTable.locationId,
      isPrimary: staffLocationsTable.isPrimary,
      locationName: locationsTable.name,
      locationAddress: locationsTable.address,
      locationPhone: locationsTable.phone,
      isActive: locationsTable.isActive,
    })
    .from(staffLocationsTable)
    .leftJoin(locationsTable, eq(locationsTable.id, staffLocationsTable.locationId))
    .where(eq(staffLocationsTable.staffId, staffId));
  res.json(rows);
});

router.put("/staff/:id/locations", async (req, res): Promise<void> => {
  const staffId = parseInt(req.params["id"] ?? "0", 10);
  const parsed = z.object({
    locationIds: z.array(z.number().int()),
    primaryLocationId: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { locationIds, primaryLocationId } = parsed.data;

  // Delete existing assignments
  await db.delete(staffLocationsTable).where(eq(staffLocationsTable.staffId, staffId));

  // Insert new ones
  if (locationIds.length > 0) {
    await db.insert(staffLocationsTable).values(
      locationIds.map(locationId => ({
        staffId,
        locationId,
        isPrimary: locationId === primaryLocationId,
      }))
    );
  }

  res.json({ success: true });
});

/* ─── Location Staff list (which staff are assigned to a branch) ─── */
router.get("/locations/:id/staff", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params["id"] ?? "0", 10);
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

export default router;
