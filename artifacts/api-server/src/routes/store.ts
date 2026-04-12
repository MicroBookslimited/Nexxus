import { Router, type IRouter } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import { db, storeProductsTable, storeOrdersTable } from "@workspace/db";
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
    /* ── Complete Systems ── */
    { category: "systems", name: "Starter POS Bundle", description: "Everything you need to get started: 15\" touch display, thermal receipt printer, cash drawer, and barcode scanner.", price: 185000, imageEmoji: "🖥️", brand: "NEXXUS", sku: "SYS-001", sortOrder: 1, specs: { includes: ["15\" Touch Display", "Thermal Printer", "Cash Drawer", "Barcode Scanner"], warranty: "1 Year" } },
    { category: "systems", name: "Restaurant POS Bundle", description: "Full restaurant setup with kitchen display system, 2× receipt printers, cash drawer, and tablet stand.", price: 275000, imageEmoji: "🍽️", brand: "NEXXUS", sku: "SYS-002", sortOrder: 2, specs: { includes: ["15\" Touch Display", "KDS Monitor", "2× Thermal Printers", "Cash Drawer", "Tablet Stand"], warranty: "1 Year" } },
    { category: "systems", name: "Retail POS Bundle", description: "Complete retail kit with barcode scanner, label printer, receipt printer, cash drawer and customer display.", price: 230000, imageEmoji: "🛍️", brand: "NEXXUS", sku: "SYS-003", sortOrder: 3, specs: { includes: ["15\" Touch Display", "Barcode Scanner", "Label Printer", "Receipt Printer", "Cash Drawer", "Customer Display"], warranty: "1 Year" } },

    /* ── Hardware ── */
    { category: "hardware", name: "80mm Thermal Receipt Printer", description: "High-speed 80mm thermal printer with USB, Ethernet, and Bluetooth connectivity. 250mm/s print speed.", price: 28500, imageEmoji: "🖨️", brand: "Epson", sku: "HW-001", sortOrder: 10, specs: { connectivity: "USB/Ethernet/Bluetooth", speed: "250mm/s", width: "80mm" } },
    { category: "hardware", name: "USB Barcode Scanner", description: "1D/2D wired USB barcode scanner. Compatible with all major POS software. Plug-and-play setup.", price: 8500, imageEmoji: "📡", brand: "Honeywell", sku: "HW-002", sortOrder: 11, specs: { type: "1D/2D", connectivity: "USB", scan_rate: "100 scans/sec" } },
    { category: "hardware", name: "Wireless Barcode Scanner", description: "Bluetooth 1D/2D barcode scanner with 30m range and 8-hour battery life.", price: 14500, imageEmoji: "📡", brand: "Honeywell", sku: "HW-003", sortOrder: 12, specs: { type: "1D/2D", connectivity: "Bluetooth", range: "30m", battery: "8 hours" } },
    { category: "hardware", name: "16\" Cash Drawer", description: "Heavy-duty steel cash drawer with 5 bill and 8 coin compartments. Connects via RJ11 to receipt printer.", price: 9800, imageEmoji: "💰", brand: "APG", sku: "HW-004", sortOrder: 13, specs: { size: "16\"", compartments: "5 bill / 8 coin", connection: "RJ11" } },
    { category: "hardware", name: "Customer Pole Display", description: "2×20 character LED pole display. Shows item and total to customer. USB/Serial.", price: 11500, imageEmoji: "📺", brand: "Logic Controls", sku: "HW-005", sortOrder: 14, specs: { display: "2×20 LCD", connectivity: "USB/Serial" } },
    { category: "hardware", name: "Zebra ZD420 Label Printer", description: "Professional thermal label printer. 203 DPI, 4\" print width. USB, Ethernet, Bluetooth.", price: 42000, imageEmoji: "🏷️", brand: "Zebra", sku: "HW-006", sortOrder: 15, specs: { dpi: "203", width: "4\"", connectivity: "USB/Ethernet/Bluetooth" } },
    { category: "hardware", name: "Tablet POS Stand (10\"–13\")", description: "Adjustable 360° rotating tablet stand with cable management. Fits 10\"–13\" tablets.", price: 7200, imageEmoji: "📱", brand: "Heckler", sku: "HW-007", sortOrder: 16, specs: { fits: "10\"–13\" tablets", rotation: "360°" } },

    /* ── Thermal Paper ── */
    { category: "thermal_paper", name: "80mm × 80m Thermal Rolls (Box/50)", description: "High-quality 80mm×80m thermal receipt paper rolls. BPA-free coating. Box of 50 rolls.", price: 8500, imageEmoji: "🧻", brand: "Generic", sku: "TP-001", sortOrder: 20, specs: { width: "80mm", length: "80m", qty: "50 rolls/box", bpa_free: true } },
    { category: "thermal_paper", name: "57mm × 40m Thermal Rolls (Box/100)", description: "57mm×40m thermal rolls for portable and small printers. Box of 100 rolls.", price: 6200, imageEmoji: "🧻", brand: "Generic", sku: "TP-002", sortOrder: 21, specs: { width: "57mm", length: "40m", qty: "100 rolls/box" } },
    { category: "thermal_paper", name: "4\" × 6\" Thermal Shipping Labels (500/roll)", description: "Direct thermal shipping and barcode labels. 4\"×6\" size. 500 labels per roll. For Zebra & compatible printers.", price: 4800, imageEmoji: "🏷️", brand: "Generic", sku: "TP-003", sortOrder: 22, specs: { size: "4\" × 6\"", qty: "500 labels/roll", printer_compat: "Zebra ZD-series, Rollo" } },
    { category: "thermal_paper", name: "2.25\" × 1.25\" Price Labels (1000/roll)", description: "Small shelf price labels for retail shelving. 1000 labels per roll.", price: 2800, imageEmoji: "🏷️", brand: "Generic", sku: "TP-004", sortOrder: 23, specs: { size: "2.25\" × 1.25\"", qty: "1000/roll" } },

    /* ── Inks ── */
    { category: "inks", name: "Epson TM Series Ink Cartridge (Black)", description: "Genuine Epson black ink cartridge compatible with TM-J series inkjet receipt printers.", price: 3200, imageEmoji: "🖋️", brand: "Epson", sku: "INK-001", sortOrder: 30, specs: { color: "Black", compatibility: "Epson TM-J series" } },
    { category: "inks", name: "Epson TM Series Ink Cartridge (Color)", description: "Genuine Epson color ink cartridge (Cyan/Magenta/Yellow) for TM-J series printers.", price: 4500, imageEmoji: "🖋️", brand: "Epson", sku: "INK-002", sortOrder: 31, specs: { color: "CMY", compatibility: "Epson TM-J series" } },
    { category: "inks", name: "Ink Roller for Casio/Sharp Registers", description: "Universal ink roller for Casio and Sharp cash register receipt mechanisms.", price: 850, imageEmoji: "🖊️", brand: "Compatible", sku: "INK-003", sortOrder: 32, specs: { compatibility: "Casio SE/Sharp XE series" } },

    /* ── Ribbons ── */
    { category: "ribbons", name: "Zebra 2300 Wax Ribbon 110mm×74m", description: "Zebra 2300 wax ribbon for general-purpose label printing on paper labels. 110mm×74m.", price: 3800, imageEmoji: "🎀", brand: "Zebra", sku: "RIB-001", sortOrder: 40, specs: { type: "Wax", width: "110mm", length: "74m", compatibility: "Zebra ZD/ZT series" } },
    { category: "ribbons", name: "Zebra 3200 Wax/Resin Ribbon 110mm×74m", description: "Wax/Resin ribbon for synthetic labels needing smear and scratch resistance.", price: 4600, imageEmoji: "🎀", brand: "Zebra", sku: "RIB-002", sortOrder: 41, specs: { type: "Wax/Resin", width: "110mm", length: "74m" } },
    { category: "ribbons", name: "Bixolon Ribbon for SRP-270/275", description: "Compatible ink ribbon for Bixolon SRP-270 and SRP-275 dot-matrix receipt printers.", price: 1200, imageEmoji: "🎀", brand: "Bixolon", sku: "RIB-003", sortOrder: 42, specs: { compatibility: "Bixolon SRP-270, SRP-275" } },

    /* ── Consumables ── */
    { category: "consumables", name: "Cleaning Cards – Thermal Printers (10pk)", description: "IPA-saturated cleaning cards for thermal printers. Extends print head life. Pack of 10.", price: 1800, imageEmoji: "🧹", brand: "Generic", sku: "CON-001", sortOrder: 50, specs: { qty: "10 cards", type: "IPA saturated" } },
    { category: "consumables", name: "USB-A to USB-B Printer Cable 6ft", description: "High-quality USB 2.0 printer cable. Compatible with most USB receipt and label printers.", price: 950, imageEmoji: "🔌", brand: "Generic", sku: "CON-002", sortOrder: 51, specs: { type: "USB-A to USB-B", length: "6ft / 1.8m" } },
    { category: "consumables", name: "RJ11 Cash Drawer Cable 8P8C", description: "Standard RJ11 6P4C printer-to-drawer cable for connecting cash drawer to receipt printer.", price: 650, imageEmoji: "🔌", brand: "Generic", sku: "CON-003", sortOrder: 52, specs: { type: "RJ11 8P8C", length: "1.2m" } },
    { category: "consumables", name: "Power Strip Surge Protector (6-outlet)", description: "6-outlet surge protector with 2 USB ports. 1800 joules protection. 6ft cord.", price: 4200, imageEmoji: "⚡", brand: "APC", sku: "CON-004", sortOrder: 53, specs: { outlets: 6, usb_ports: 2, joules: 1800, cord: "6ft" } },
  ];

  await db.insert(storeProductsTable).values(seed.map(p => ({
    ...p,
    specs: p.specs as Record<string, unknown>,
  })));
}

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

/* ─── POST /api/store/orders ─── */
router.post("/store/orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { items, contactName, contactPhone, deliveryAddress, notes } = req.body;
  if (!items?.length || !contactName || !contactPhone || !deliveryAddress) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const subtotal = items.reduce((sum: number, i: { price: number; qty: number }) => sum + i.price * i.qty, 0);
  const tax = 0;
  const total = subtotal + tax;

  try {
    const [order] = await db.insert(storeOrdersTable).values({
      tenantId,
      orderNumber: generateOrderNumber(),
      status: "pending",
      items,
      subtotal,
      tax,
      total,
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

/* ─── GET /api/store/orders ─── */
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
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ─── SUPERADMIN: manage products ─── */
router.get("/store/admin/products", async (req, res): Promise<void> => {
  if (!isSuperadmin(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const products = await db.select().from(storeProductsTable).orderBy(asc(storeProductsTable.sortOrder));
  res.json(products);
});

router.patch("/store/admin/products/:id", async (req, res): Promise<void> => {
  if (!isSuperadmin(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const { inStock, stockCount, price, isActive, name, description } = req.body;
  const [updated] = await db.update(storeProductsTable)
    .set({ inStock, stockCount, price, isActive, name, description, updatedAt: new Date() })
    .where(eq(storeProductsTable.id, id))
    .returning();
  res.json(updated);
});

router.get("/store/admin/orders", async (req, res): Promise<void> => {
  if (!isSuperadmin(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orders = await db.select().from(storeOrdersTable).orderBy(desc(storeOrdersTable.createdAt));
  res.json(orders);
});

router.patch("/store/admin/orders/:id", async (req, res): Promise<void> => {
  if (!isSuperadmin(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const [updated] = await db.update(storeOrdersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(storeOrdersTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
