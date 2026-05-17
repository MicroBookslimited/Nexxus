import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, lte, inArray, desc } from "drizzle-orm";
import { db, promotionsTable, productsTable, rolesTable, staffTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

function getTenantId(req: Request): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

interface AuthorisedCaller {
  tenantId: number;
  staffId: number;
}

// Mirrors price-manager's authoriseCaller: requires a valid tenant token,
// rejects technician-impersonated sessions, and confirms the supplied
// staffId is a staff member of that tenant whose role grants
// `pricing.manage` (Owner/Admin always allowed).
async function authoriseCaller(req: Request, res: Response, staffId: number): Promise<AuthorisedCaller | null> {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (payload.restrictedRole === "technician") {
    res.status(403).json({ error: "Technician sessions cannot manage promotions" });
    return null;
  }

  const tenantId = payload.tenantId;
  const [staff] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  if (!staff) { res.status(403).json({ error: "Staff not found for this tenant" }); return null; }

  const role = (staff as { role?: string }).role ?? "";
  let allowed = ["Owner", "Admin"].includes(role);
  if (!allowed) {
    const [roleRow] = await db.select().from(rolesTable)
      .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, role)));
    allowed = !!(roleRow && Array.isArray(roleRow.permissions) && roleRow.permissions.includes("pricing.manage"));
  }
  if (!allowed) { res.status(403).json({ error: "You do not have permission to manage promotions" }); return null; }

  return { tenantId, staffId: staff.id };
}

const CreateBody = z.object({
  productId: z.number().int().positive(),
  promoPrice: z.number().min(0),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  active: z.boolean().optional().default(true),
  staffId: z.number().int().positive(),
});

const UpdateBody = z.object({
  promoPrice: z.number().min(0).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
  staffId: z.number().int().positive(),
});

const DeleteQuery = z.object({
  staffId: z.coerce.number().int().positive(),
});

export async function findActivePromoPrices(tenantId: number, productIds: number[]): Promise<Map<number, number>> {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const rows = await db.select({
    productId: promotionsTable.productId,
    promoPrice: promotionsTable.promoPrice,
  })
    .from(promotionsTable)
    .where(and(
      eq(promotionsTable.tenantId, tenantId),
      eq(promotionsTable.active, true),
      inArray(promotionsTable.productId, productIds),
      lte(promotionsTable.startAt, now),
      gte(promotionsTable.endAt, now),
    ));
  const map = new Map<number, number>();
  for (const r of rows) {
    const prev = map.get(r.productId);
    if (prev === undefined || r.promoPrice < prev) map.set(r.productId, r.promoPrice);
  }
  return map;
}

router.get("/promotions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: promotionsTable.id,
    productId: promotionsTable.productId,
    productName: productsTable.name,
    regularPrice: productsTable.price,
    promoPrice: promotionsTable.promoPrice,
    startAt: promotionsTable.startAt,
    endAt: promotionsTable.endAt,
    active: promotionsTable.active,
    createdAt: promotionsTable.createdAt,
  })
    .from(promotionsTable)
    .leftJoin(productsTable, eq(productsTable.id, promotionsTable.productId))
    .where(eq(promotionsTable.tenantId, tenantId))
    .orderBy(desc(promotionsTable.startAt));

  res.json({ promotions: rows });
});

router.get("/promotions/active", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const rows = await db.select({
    productId: promotionsTable.productId,
    promoPrice: promotionsTable.promoPrice,
    endAt: promotionsTable.endAt,
  })
    .from(promotionsTable)
    .where(and(
      eq(promotionsTable.tenantId, tenantId),
      eq(promotionsTable.active, true),
      lte(promotionsTable.startAt, now),
      gte(promotionsTable.endAt, now),
    ));

  const map: Record<number, { promoPrice: number; endAt: string }> = {};
  for (const r of rows) {
    const cur = map[r.productId];
    const endIso = (r.endAt instanceof Date ? r.endAt : new Date(r.endAt)).toISOString();
    if (!cur || r.promoPrice < cur.promoPrice) map[r.productId] = { promoPrice: r.promoPrice, endAt: endIso };
  }

  res.json({ activePromos: map });
});

router.post("/promotions", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const auth = await authoriseCaller(req, res, parsed.data.staffId);
  if (!auth) return;

  const start = new Date(parsed.data.startAt);
  const end = new Date(parsed.data.endAt);
  if (end.getTime() <= start.getTime()) {
    res.status(400).json({ error: "End time must be after start time" }); return;
  }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, parsed.data.productId), eq(productsTable.tenantId, auth.tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [row] = await db.insert(promotionsTable).values({
    tenantId: auth.tenantId,
    productId: parsed.data.productId,
    promoPrice: parsed.data.promoPrice,
    startAt: start,
    endAt: end,
    active: parsed.data.active ?? true,
  }).returning();

  res.status(201).json(row);
});

router.patch("/promotions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const auth = await authoriseCaller(req, res, parsed.data.staffId);
  if (!auth) return;

  const [existing] = await db.select().from(promotionsTable)
    .where(and(eq(promotionsTable.id, id), eq(promotionsTable.tenantId, auth.tenantId)));
  if (!existing) { res.status(404).json({ error: "Promotion not found" }); return; }

  const update: Partial<typeof promotionsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.promoPrice !== undefined) update.promoPrice = parsed.data.promoPrice;
  if (parsed.data.startAt) update.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt) update.endAt = new Date(parsed.data.endAt);
  if (parsed.data.active !== undefined) update.active = parsed.data.active;

  const start = update.startAt ?? existing.startAt;
  const end = update.endAt ?? existing.endAt;
  if (end.getTime() <= start.getTime()) {
    res.status(400).json({ error: "End time must be after start time" }); return;
  }

  const [row] = await db.update(promotionsTable).set(update)
    .where(eq(promotionsTable.id, id)).returning();
  res.json(row);
});

router.delete("/promotions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsedQ = DeleteQuery.safeParse(req.query);
  if (!parsedQ.success) { res.status(400).json({ error: "staffId query param required" }); return; }

  const auth = await authoriseCaller(req, res, parsedQ.data.staffId);
  if (!auth) return;

  await db.delete(promotionsTable)
    .where(and(eq(promotionsTable.id, id), eq(promotionsTable.tenantId, auth.tenantId)));
  res.json({ success: true });
});

export default router;
