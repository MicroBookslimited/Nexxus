import { Router, type IRouter } from "express";
import { eq, and, desc, asc, isNull, or, ilike, sql, lt, lte } from "drizzle-orm";
import {
  db, storeProductsTable, storeOrdersTable,
  storeSuppliersTable, storeStockMovementsTable,
} from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

/* ─── Auth helpers ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function isSuperadmin(req: { headers: Record<string, string | undefined> }): boolean {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-secret";
    const p = jwt.verify(auth.slice(7), secret) as { type?: string };
    return p?.type === "superadmin";
  } catch { return false; }
}

function requireSA(req: { headers: Record<string, string | undefined> }, res: { status: (n: number) => { json: (o: unknown) => void } }): boolean {
  if (!isSuperadmin(req)) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `STO-${ts}-${rand}`;
}

/* ─── Seed store products if empty ─── */
async function ensureStoreSeeded() {
  const existing = await db.select({ id: storeProductsTable.id }).from(storeProductsTable).limit(1);
  if (existing.length > 0) return;

  const seed = [
    { category: "systems", name: "Starter POS Bundle", description: "Everything you need to get started: 15\" touch display, thermal receipt printer, cash drawer, and barcode scanner.", price: 185000, costPrice: 120000, imageEmoji: "🖥️", brand: "NEXXUS", sku: "SYS-001", sortOrder: 1, specs: { includes: ["15\" Touch Display", "Thermal Printer", "Cash Drawer", "Barcode Scanner"], warranty: "1 Year" } },
    { category: "systems", name: "Restaurant POS Bundle", description: "Full restaurant setup with kitchen display system, 2× receipt printers, cash drawer, and tablet stand.", price: 275000, costPrice: 180000, imageEmoji: "🍽️", brand: "NEXXUS", sku: "SYS-002", sortOrder: 2, specs: { includes: ["15\" Touch Display", "KDS Monitor", "2× Thermal Printers", "Cash Drawer", "Tablet Stand"], warranty: "1 Year" } },
    { category: "systems", name: "Retail POS Bundle", description: "Complete retail kit with barcode scanner, label printer, receipt printer, cash drawer and customer display.", price: 230000, costPrice: 150000, imageEmoji: "🛍️", brand: "NEXXUS", sku: "SYS-003", sortOrder: 3, specs: {} },
    { category: "hardware", name: "80mm Thermal Receipt Printer", description: "High-speed 80mm thermal printer with USB, Ethernet, and Bluetooth connectivity.", price: 28500, costPrice: 18000, imageEmoji: "🖨️", brand: "Epson", sku: "HW-001", sortOrder: 10, specs: {} },
    { category: "hardware", name: "USB Barcode Scanner", description: "1D/2D wired USB barcode scanner. Plug-and-play setup.", price: 8500, costPrice: 5000, imageEmoji: "📡", brand: "Honeywell", sku: "HW-002", sortOrder: 11, specs: {} },
    { category: "hardware", name: "Wireless Barcode Scanner", description: "Bluetooth 1D/2D barcode scanner with 30m range.", price: 14500, costPrice: 9000, imageEmoji: "📡", brand: "Honeywell", sku: "HW-003", sortOrder: 12, specs: {} },
    { category: "hardware", name: "16\" Cash Drawer", description: "Heavy-duty steel cash drawer with 5 bill and 8 coin compartments.", price: 9800, costPrice: 6000, imageEmoji: "💰", brand: "APG", sku: "HW-004", sortOrder: 13, specs: {} },
    { category: "hardware", name: "Customer Pole Display", description: "2×20 character LED pole display. USB/Serial.", price: 11500, costPrice: 7500, imageEmoji: "📺", brand: "Logic Controls", sku: "HW-005", sortOrder: 14, specs: {} },
    { category: "hardware", name: "Zebra ZD420 Label Printer", description: "Professional thermal label printer. 203 DPI, 4\" print width.", price: 42000, costPrice: 28000, imageEmoji: "🏷️", brand: "Zebra", sku: "HW-006", sortOrder: 15, specs: {} },
    { category: "hardware", name: "Tablet POS Stand (10\"–13\")", description: "Adjustable 360° rotating tablet stand with cable management.", price: 7200, costPrice: 4500, imageEmoji: "📱", brand: "Heckler", sku: "HW-007", sortOrder: 16, specs: {} },
    { category: "thermal_paper", name: "80mm × 80m Thermal Rolls (Box/50)", description: "High-quality 80mm×80m thermal receipt paper rolls. BPA-free coating.", price: 8500, costPrice: 4500, imageEmoji: "🧻", brand: "Generic", sku: "TP-001", sortOrder: 20, specs: {} },
    { category: "thermal_paper", name: "57mm × 40m Thermal Rolls (Box/100)", description: "57mm×40m thermal rolls for portable and small printers.", price: 6200, costPrice: 3200, imageEmoji: "🧻", brand: "Generic", sku: "TP-002", sortOrder: 21, specs: {} },
    { category: "thermal_paper", name: "4\" × 6\" Thermal Shipping Labels (500/roll)", description: "Direct thermal shipping and barcode labels.", price: 4800, costPrice: 2500, imageEmoji: "🏷️", brand: "Generic", sku: "TP-003", sortOrder: 22, specs: {} },
    { category: "consumables", name: "Cleaning Cards – Thermal Printers (10pk)", description: "IPA-saturated cleaning cards for thermal printers.", price: 1800, costPrice: 900, imageEmoji: "🧹", brand: "Generic", sku: "CON-001", sortOrder: 50, specs: {} },
    { category: "consumables", name: "USB-A to USB-B Printer Cable 6ft", description: "High-quality USB 2.0 printer cable.", price: 950, costPrice: 400, imageEmoji: "🔌", brand: "Generic", sku: "CON-002", sortOrder: 51, specs: {} },
    { category: "consumables", name: "Power Strip Surge Protector (6-outlet)", description: "6-outlet surge protector with 2 USB ports. 1800 joules protection.", price: 4200, costPrice: 2800, imageEmoji: "⚡", brand: "APC", sku: "CON-004", sortOrder: 53, specs: {} },
  ];

  await db.insert(storeProductsTable).values(seed.map(p => ({
    ...p,
    specs: p.specs as Record<string, unknown>,
    stockCount: 9999,
    lowStockThreshold: 5,
  })));
}

/* ═══════════════════════════════════════════════════════
   PUBLIC ENDPOINTS (tenant-authenticated)
════════════════════════════════════════════════════════ */

/* ─── GET /api/store/products ─── */
router.get("/store/products", async (req, res): Promise<void> => {
  try {
    await ensureStoreSeeded();
    const { category } = req.query as { category?: string };
    const conditions = [eq(storeProductsTable.isActive, true)];
    if (category && category !== "all") {
      conditions.push(eq(storeProductsTable.category, category));
    }
    const products = await db
      .select()
      .from(storeProductsTable)
      .where(and(...conditions))
      .orderBy(asc(storeProductsTable.sortOrder), asc(storeProductsTable.name));
    res.json(products);
  } catch (err) {
    console.error("store/products error:", err);
    res.status(500).json({ error: "Failed to fetch store products" });
  }
});

/* ─── POST /api/store/orders (tenant) ─── */
router.post("/store/orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { items, contactName, contactPhone, deliveryAddress, notes } = req.body;
  if (!items?.length || !contactName || !contactPhone || !deliveryAddress) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const subtotal = items.reduce((sum: number, i: { price: number; qty: number }) => sum + i.price * i.qty, 0);
  const total = subtotal;

  try {
    const [order] = await db.insert(storeOrdersTable).values({
      tenantId,
      orderNumber: generateOrderNumber(),
      status: "pending",
      paymentStatus: "unpaid",
      items,
      subtotal,
      tax: 0,
      total,
      amountPaid: 0,
      contactName,
      contactPhone,
      deliveryAddress,
      notes: notes || null,
    }).returning();
    res.json(order);
  } catch (err) {
    console.error("store/orders POST error:", err);
    res.status(500).json({ error: "Failed to place order" });
  }
});

/* ─── GET /api/store/orders (tenant) ─── */
router.get("/store/orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const orders = await db
      .select()
      .from(storeOrdersTable)
      .where(eq(storeOrdersTable.tenantId, tenantId))
      .orderBy(desc(storeOrdersTable.createdAt));
    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ═══════════════════════════════════════════════════════
   SUPERADMIN: METRICS
════════════════════════════════════════════════════════ */

router.get("/store/admin/metrics", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;

  const products = await db.select().from(storeProductsTable);
  const orders = await db.select().from(storeOrdersTable).orderBy(desc(storeOrdersTable.createdAt)).limit(5);

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.isActive).length;
  const outOfStock = products.filter(p => !p.inStock || p.stockCount === 0).length;
  const lowStock = products.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= (p.lowStockThreshold ?? 5)).length;

  const allOrders = await db.select().from(storeOrdersTable);
  const totalRevenue = allOrders.filter(o => o.paymentStatus === "paid").reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = allOrders.filter(o => o.status === "pending").length;
  const totalOrders = allOrders.length;

  res.json({
    totalProducts, activeProducts, outOfStock, lowStock,
    totalRevenue, pendingOrders, totalOrders,
    recentOrders: orders,
  });
});

/* ═══════════════════════════════════════════════════════
   SUPERADMIN: PRODUCTS
════════════════════════════════════════════════════════ */

router.get("/store/admin/products", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  await ensureStoreSeeded();

  const { q, category, stockStatus } = req.query as { q?: string; category?: string; stockStatus?: string };

  let query = db.select().from(storeProductsTable).$dynamic();

  const conditions = [];
  if (q) conditions.push(or(ilike(storeProductsTable.name, `%${q}%`), ilike(storeProductsTable.sku ?? storeProductsTable.name, `%${q}%`)));
  if (category && category !== "all") conditions.push(eq(storeProductsTable.category, category));
  if (stockStatus === "low") conditions.push(and(eq(storeProductsTable.inStock, true), sql`${storeProductsTable.stockCount} > 0`, sql`${storeProductsTable.stockCount} <= ${storeProductsTable.lowStockThreshold}`));
  if (stockStatus === "out") conditions.push(or(eq(storeProductsTable.inStock, false), eq(storeProductsTable.stockCount, 0)));
  if (stockStatus === "in") conditions.push(and(eq(storeProductsTable.inStock, true), sql`${storeProductsTable.stockCount} > 0`));

  if (conditions.length) query = query.where(and(...conditions));

  const products = await query.orderBy(asc(storeProductsTable.sortOrder), asc(storeProductsTable.name));
  res.json(products);
});

router.post("/store/admin/products", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;

  const {
    name, description, category, sku, brand, price, costPrice,
    imageEmoji, stockCount, lowStockThreshold, productType, supplierId,
    isActive, sortOrder, tags,
  } = req.body;

  if (!name || !category || price === undefined) {
    res.status(400).json({ error: "name, category, and price are required" }); return;
  }

  const [product] = await db.insert(storeProductsTable).values({
    name: name.trim(),
    description: description ?? "",
    category,
    sku: sku || null,
    brand: brand || null,
    price: parseFloat(price),
    costPrice: costPrice ? parseFloat(costPrice) : null,
    imageEmoji: imageEmoji ?? "📦",
    stockCount: stockCount !== undefined ? parseInt(stockCount) : 9999,
    lowStockThreshold: lowStockThreshold !== undefined ? parseInt(lowStockThreshold) : 5,
    productType: productType ?? "simple",
    supplierId: supplierId ? parseInt(supplierId) : null,
    inStock: (stockCount !== undefined ? parseInt(stockCount) : 9999) > 0,
    isActive: isActive !== false,
    sortOrder: sortOrder ? parseInt(sortOrder) : 999,
    tags: tags ?? null,
  }).returning();

  res.json(product);
});

router.patch("/store/admin/products/:id", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    name, description, category, sku, brand, price, costPrice,
    imageEmoji, inStock, stockCount, lowStockThreshold, productType,
    supplierId, preferredSupplierPrice, leadTimeDays, isActive, sortOrder, tags,
  } = req.body;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (category !== undefined) patch.category = category;
  if (sku !== undefined) patch.sku = sku || null;
  if (brand !== undefined) patch.brand = brand || null;
  if (price !== undefined) patch.price = parseFloat(price);
  if (costPrice !== undefined) patch.costPrice = costPrice === "" || costPrice === null ? null : parseFloat(costPrice);
  if (imageEmoji !== undefined) patch.imageEmoji = imageEmoji;
  if (inStock !== undefined) patch.inStock = inStock;
  if (stockCount !== undefined) patch.stockCount = parseInt(stockCount);
  if (lowStockThreshold !== undefined) patch.lowStockThreshold = parseInt(lowStockThreshold);
  if (productType !== undefined) patch.productType = productType;
  if (supplierId !== undefined) patch.supplierId = supplierId ? parseInt(supplierId) : null;
  if (preferredSupplierPrice !== undefined) patch.preferredSupplierPrice = preferredSupplierPrice ? parseFloat(preferredSupplierPrice) : null;
  if (leadTimeDays !== undefined) patch.leadTimeDays = leadTimeDays ? parseInt(leadTimeDays) : null;
  if (isActive !== undefined) patch.isActive = isActive;
  if (sortOrder !== undefined) patch.sortOrder = parseInt(sortOrder);
  if (tags !== undefined) patch.tags = tags;

  const [updated] = await db.update(storeProductsTable)
    .set(patch)
    .where(eq(storeProductsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/store/admin/products/:id", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(storeProductsTable).where(eq(storeProductsTable.id, id));
  res.json({ success: true });
});

/* ─── Bulk actions ─── */
router.post("/store/admin/products/bulk", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;

  const { action, ids, value } = req.body as { action: string; ids: number[]; value?: unknown };
  if (!ids?.length) { res.status(400).json({ error: "No ids provided" }); return; }

  if (action === "activate") {
    await db.update(storeProductsTable).set({ isActive: true, updatedAt: new Date() }).where(sql`${storeProductsTable.id} = ANY(${ids}::int[])`);
  } else if (action === "deactivate") {
    await db.update(storeProductsTable).set({ isActive: false, updatedAt: new Date() }).where(sql`${storeProductsTable.id} = ANY(${ids}::int[])`);
  } else if (action === "price" && value !== undefined) {
    await db.update(storeProductsTable).set({ price: parseFloat(String(value)), updatedAt: new Date() }).where(sql`${storeProductsTable.id} = ANY(${ids}::int[])`);
  } else {
    res.status(400).json({ error: "Unknown action" }); return;
  }

  res.json({ success: true, affected: ids.length });
});

/* ═══════════════════════════════════════════════════════
   SUPERADMIN: STOCK MOVEMENTS
════════════════════════════════════════════════════════ */

router.get("/store/admin/stock-movements", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;

  const { productId, limit = "100" } = req.query as { productId?: string; limit?: string };

  let query = db.select({
    movement: storeStockMovementsTable,
    productName: storeProductsTable.name,
    productSku: storeProductsTable.sku,
  })
    .from(storeStockMovementsTable)
    .leftJoin(storeProductsTable, eq(storeStockMovementsTable.productId, storeProductsTable.id))
    .$dynamic();

  if (productId) {
    query = query.where(eq(storeStockMovementsTable.productId, parseInt(productId)));
  }

  const rows = await query
    .orderBy(desc(storeStockMovementsTable.createdAt))
    .limit(parseInt(limit));

  res.json(rows);
});

router.post("/store/admin/products/:id/stock-adjust", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, quantity, notes, reference } = req.body;
  if (!type || quantity === undefined) {
    res.status(400).json({ error: "type and quantity are required" }); return;
  }

  const [product] = await db.select().from(storeProductsTable).where(eq(storeProductsTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const delta = parseInt(quantity);
  const previousStock = product.stockCount;
  const newStock = Math.max(0, previousStock + delta);

  await db.update(storeProductsTable).set({
    stockCount: newStock,
    inStock: newStock > 0,
    updatedAt: new Date(),
  }).where(eq(storeProductsTable.id, id));

  await db.insert(storeStockMovementsTable).values({
    productId: id,
    type,
    quantity: delta,
    previousStock,
    newStock,
    reference: reference || null,
    notes: notes || null,
    performedBy: "superadmin",
  });

  res.json({ success: true, previousStock, newStock });
});

/* ═══════════════════════════════════════════════════════
   SUPERADMIN: SUPPLIERS
════════════════════════════════════════════════════════ */

router.get("/store/admin/suppliers", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const suppliers = await db.select().from(storeSuppliersTable).orderBy(asc(storeSuppliersTable.name));
  res.json(suppliers);
});

router.post("/store/admin/suppliers", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const { name, contactName, contactPhone, email, website, address, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [supplier] = await db.insert(storeSuppliersTable).values({
    name, contactName, contactPhone, email, website, address, notes,
  }).returning();
  res.json(supplier);
});

router.patch("/store/admin/suppliers/:id", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  const { name, contactName, contactPhone, email, website, address, notes, isActive } = req.body;

  const [updated] = await db.update(storeSuppliersTable).set({
    name, contactName, contactPhone, email, website, address, notes, isActive,
    updatedAt: new Date(),
  }).where(eq(storeSuppliersTable.id, id)).returning();
  res.json(updated);
});

router.delete("/store/admin/suppliers/:id", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  await db.delete(storeSuppliersTable).where(eq(storeSuppliersTable.id, id));
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════════════
   SUPERADMIN: ORDERS
════════════════════════════════════════════════════════ */

router.get("/store/admin/orders", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const { status, paymentStatus } = req.query as { status?: string; paymentStatus?: string };

  const conditions = [];
  if (status && status !== "all") conditions.push(eq(storeOrdersTable.status, status));
  if (paymentStatus && paymentStatus !== "all") conditions.push(eq(storeOrdersTable.paymentStatus, paymentStatus));

  let query = db.select().from(storeOrdersTable).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));

  const orders = await query.orderBy(desc(storeOrdersTable.createdAt));
  res.json(orders);
});

router.patch("/store/admin/orders/:id", async (req, res): Promise<void> => {
  if (!requireSA(req as never, res as never)) return;
  const id = parseInt(req.params.id ?? "");
  const { status, paymentMethod, paymentStatus, amountPaid, fulfillmentAssignee, notes } = req.body;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) patch.status = status;
  if (paymentMethod !== undefined) patch.paymentMethod = paymentMethod;
  if (paymentStatus !== undefined) patch.paymentStatus = paymentStatus;
  if (amountPaid !== undefined) patch.amountPaid = parseFloat(amountPaid);
  if (fulfillmentAssignee !== undefined) patch.fulfillmentAssignee = fulfillmentAssignee;
  if (notes !== undefined) patch.notes = notes;

  const [updated] = await db.update(storeOrdersTable)
    .set(patch)
    .where(eq(storeOrdersTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
