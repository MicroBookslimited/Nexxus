import { Router, type IRouter } from "express";
import { and, eq, or, isNull } from "drizzle-orm";
import { db, hardwareDevicesTable, driverLinksTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function isSuperadminOrManager(req: { headers: Record<string, string | undefined> }): boolean {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-secret";
    const p = jwt.verify(auth.slice(7), secret) as { type?: string; role?: string };
    return p?.type === "superadmin" || !!getTenantId(req as never);
  } catch { return false; }
}

const DEVICE_TYPES = ["printer","barcode_scanner","cash_drawer","card_reader","customer_display","label_printer","tablet","kds","other"] as const;
const PLATFORMS = ["windows","macos","linux","android","ios","all"] as const;

const CreateDeviceBody = z.object({
  deviceType: z.enum(DEVICE_TYPES),
  make: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  condition: z.enum(["new","good","fair","needs_repair"]).optional().default("good"),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const CreateDriverBody = z.object({
  deviceType: z.enum(DEVICE_TYPES),
  make: z.string().min(1),
  model: z.string().optional(),
  driverName: z.string().min(1),
  downloadUrl: z.string().min(1),
  version: z.string().optional(),
  platform: z.enum(PLATFORMS).default("all"),
  fileSize: z.string().optional(),
  releaseDate: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

// ─── Hardware Devices ─────────────────────────────────────────────────────────

router.get("/hardware/devices", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(hardwareDevicesTable)
    .where(eq(hardwareDevicesTable.tenantId, tenantId))
    .orderBy(hardwareDevicesTable.deviceType, hardwareDevicesTable.make);
  res.json(rows);
});

router.post("/hardware/devices", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(hardwareDevicesTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(row);
});

router.patch("/hardware/devices/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateDeviceBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.update(hardwareDevicesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(hardwareDevicesTable.id, id), eq(hardwareDevicesTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/hardware/devices/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.delete(hardwareDevicesTable)
    .where(and(eq(hardwareDevicesTable.id, id), eq(hardwareDevicesTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ─── Driver Links ─────────────────────────────────────────────────────────────

router.get("/hardware/drivers", async (req, res): Promise<void> => {
  const { make, model, deviceType, platform } = req.query as Record<string, string>;

  const conditions = [eq(driverLinksTable.isActive, true)];
  if (deviceType) conditions.push(eq(driverLinksTable.deviceType, deviceType));
  if (platform && platform !== "all") {
    conditions.push(
      or(
        eq(driverLinksTable.platform, platform),
        eq(driverLinksTable.platform, "all"),
      )!
    );
  }
  if (make) {
    conditions.push(eq(driverLinksTable.make, make));
    if (model) {
      conditions.push(
        or(
          eq(driverLinksTable.model, model),
          isNull(driverLinksTable.model),
        )!
      );
    }
  }

  const rows = await db.select().from(driverLinksTable)
    .where(and(...conditions))
    .orderBy(driverLinksTable.deviceType, driverLinksTable.make, driverLinksTable.driverName);
  res.json(rows);
});

router.get("/hardware/drivers/all", async (req, res): Promise<void> => {
  const rows = await db.select().from(driverLinksTable)
    .orderBy(driverLinksTable.deviceType, driverLinksTable.make, driverLinksTable.driverName);
  res.json(rows);
});

router.post("/hardware/drivers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(driverLinksTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/hardware/drivers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateDriverBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.update(driverLinksTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(driverLinksTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/hardware/drivers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.delete(driverLinksTable).where(eq(driverLinksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
