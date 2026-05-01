import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, heldOrdersTable } from "@workspace/db";
import {
  CreateHeldOrderBody,
  GetHeldOrderParams,
  GetHeldOrderResponse,
  DeleteHeldOrderParams,
  ListHeldOrdersResponse,
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function normalizeHeldOrder(h: typeof heldOrdersTable.$inferSelect) {
  return {
    ...h,
    label: h.label ?? undefined,
    notes: h.notes ?? undefined,
    discountType: h.discountType ?? undefined,
    discountAmount: h.discountAmount ?? undefined,
  };
}

router.get("/held-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const held = await db.select().from(heldOrdersTable).where(eq(heldOrdersTable.tenantId, tenantId));
  res.json(ListHeldOrdersResponse.parse(held.map(normalizeHeldOrder)));
});

router.post("/held-orders", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateHeldOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [held] = await db
    .insert(heldOrdersTable)
    .values({
      tenantId,
      label: parsed.data.label,
      items: parsed.data.items,
      notes: parsed.data.notes,
      discountType: parsed.data.discountType,
      discountAmount: parsed.data.discountAmount,
    })
    .returning();

  res.status(201).json(GetHeldOrderResponse.parse(normalizeHeldOrder(held)));
});

router.get("/held-orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetHeldOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [held] = await db
    .select()
    .from(heldOrdersTable)
    .where(and(eq(heldOrdersTable.id, params.data.id), eq(heldOrdersTable.tenantId, tenantId)));

  if (!held) {
    res.status(404).json({ error: "Held order not found" });
    return;
  }

  res.json(GetHeldOrderResponse.parse(normalizeHeldOrder(held)));
});

router.delete("/held-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteHeldOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [held] = await db
    .delete(heldOrdersTable)
    .where(and(eq(heldOrdersTable.id, params.data.id), eq(heldOrdersTable.tenantId, tenantId)))
    .returning();

  if (!held) {
    res.status(404).json({ error: "Held order not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
