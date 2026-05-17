import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db, productsTable, priceChangeLogsTable, rolesTable, staffTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

const METHODS = ["percent", "cost_markup", "fixed"] as const;
const ROUNDINGS = ["none", "5", "10", "50", "100", "1000"] as const;
const SCOPES = ["all", "category", "products"] as const;

const PreviewBody = z.object({
  method: z.enum(METHODS),
  value: z.number(),
  direction: z.enum(["up", "down"]).default("up"),
  rounding: z.enum(ROUNDINGS).default("none"),
  scope: z.enum(SCOPES),
  categories: z.array(z.string()).optional(),
  productIds: z.array(z.number().int().positive()).optional(),
  staffId: z.number().int().positive(),
  staffName: z.string().optional(),
});

const ApplyBody = PreviewBody.extend({
  changes: z.array(z.object({
    productId: z.number().int().positive(),
    newPrice: z.number().min(0),
  })).min(1),
});

interface AuthorisedCaller {
  tenantId: number;
  staffId: number;
  staffName: string | null;
}

async function authoriseCaller(req: Request, res: Response, staffId: number): Promise<AuthorisedCaller | null> {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (payload.restrictedRole === "technician") {
    res.status(403).json({ error: "Technician sessions cannot manage pricing" });
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
  if (!allowed) { res.status(403).json({ error: "You do not have permission to manage pricing" }); return null; }

  return { tenantId, staffId: staff.id, staffName: (staff as { name?: string }).name ?? null };
}

function roundTo(n: number, rounding: typeof ROUNDINGS[number]): number {
  if (rounding === "none") return Math.round(n * 100) / 100;
  const step = parseInt(rounding, 10);
  return Math.round(n / step) * step;
}

function computeNewPrice(
  product: { price: number; costPrice: number | null },
  method: typeof METHODS[number],
  value: number,
  direction: "up" | "down",
): number | null {
  const signedValue = direction === "down" ? -Math.abs(value) : Math.abs(value);
  if (method === "percent") return product.price * (1 + signedValue / 100);
  if (method === "cost_markup") {
    if (product.costPrice == null || product.costPrice <= 0) return null;
    return product.costPrice * (1 + Math.abs(value) / 100);
  }
  if (method === "fixed") return product.price + signedValue;
  return null;
}

async function loadCandidates(
  tenantId: number,
  scope: typeof SCOPES[number],
  categories: string[] | undefined,
  productIds: number[] | undefined,
) {
  if (scope === "all") {
    return db.select().from(productsTable).where(eq(productsTable.tenantId, tenantId));
  }
  if (scope === "category" && categories && categories.length > 0) {
    return db.select().from(productsTable)
      .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.category, categories)));
  }
  if (scope === "products" && productIds && productIds.length > 0) {
    return db.select().from(productsTable)
      .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, productIds)));
  }
  return [];
}

router.post("/price-manager/preview", async (req, res): Promise<void> => {
  const parsed = PreviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const auth = await authoriseCaller(req, res, parsed.data.staffId);
  if (!auth) return;

  const { method, value, direction, rounding, scope, categories, productIds } = parsed.data;
  const candidates = await loadCandidates(auth.tenantId, scope, categories, productIds);

  const rows = candidates.map((p) => {
    const computed = computeNewPrice(p, method, value, direction);
    if (computed == null) {
      return { productId: p.id, productName: p.name, category: p.category, oldPrice: p.price, costPrice: p.costPrice, newPrice: null, skipped: "no_cost" };
    }
    const rounded = roundTo(Math.max(0, computed), rounding);
    return {
      productId: p.id,
      productName: p.name,
      category: p.category,
      oldPrice: p.price,
      costPrice: p.costPrice,
      newPrice: Math.round(rounded * 100) / 100,
      skipped: null,
    };
  });

  res.json({ rows, total: rows.length });
});

router.post("/price-manager/apply", async (req, res): Promise<void> => {
  const parsed = ApplyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const auth = await authoriseCaller(req, res, parsed.data.staffId);
  if (!auth) return;

  const { method, value, rounding, scope, categories, productIds, changes } = parsed.data;

  const candidates = await loadCandidates(auth.tenantId, scope, categories, productIds);
  const allowedIds = new Set(candidates.map((c) => c.id));
  const filteredChanges = changes.filter((c) => allowedIds.has(c.productId));
  if (filteredChanges.length !== changes.length) {
    res.status(400).json({ error: "One or more products are outside the selected scope" });
    return;
  }

  const applied: { productId: number; productName: string; oldPrice: number; newPrice: number }[] = [];

  await db.transaction(async (tx) => {
    const ids = filteredChanges.map((c) => c.productId);
    const current = await tx.select().from(productsTable)
      .where(and(eq(productsTable.tenantId, auth.tenantId), inArray(productsTable.id, ids)));
    const byId = new Map(current.map((p) => [p.id, p]));

    for (const change of filteredChanges) {
      const product = byId.get(change.productId);
      if (!product) continue;
      const newPrice = Math.round(Math.max(0, change.newPrice) * 100) / 100;
      if (newPrice === product.price) continue;
      await tx.update(productsTable)
        .set({ price: newPrice })
        .where(and(eq(productsTable.id, change.productId), eq(productsTable.tenantId, auth.tenantId)));
      applied.push({
        productId: product.id,
        productName: product.name,
        oldPrice: product.price,
        newPrice,
      });
    }

    if (applied.length > 0) {
      await tx.insert(priceChangeLogsTable).values({
        tenantId: auth.tenantId,
        staffId: auth.staffId,
        staffName: auth.staffName,
        method,
        value,
        rounding,
        scope,
        affectedCount: applied.length,
        details: applied,
      });
    }
  });

  res.json({ appliedCount: applied.length, changes: applied });
});

router.get("/price-manager/logs", async (req, res): Promise<void> => {
  const staffId = parseInt(String(req.query["staffId"] ?? ""), 10);
  if (!Number.isFinite(staffId) || staffId <= 0) { res.status(400).json({ error: "staffId query param required" }); return; }
  const auth = await authoriseCaller(req, res, staffId);
  if (!auth) return;

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 200);

  const logs = await db.select().from(priceChangeLogsTable)
    .where(eq(priceChangeLogsTable.tenantId, auth.tenantId))
    .orderBy(desc(priceChangeLogsTable.createdAt))
    .limit(limit);

  res.json({ logs });
});

export default router;
