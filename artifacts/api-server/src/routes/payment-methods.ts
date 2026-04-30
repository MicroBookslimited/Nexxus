import { Router, type IRouter } from "express";
import { and, eq, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, paymentMethodsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/**
 * Default payment methods seeded for every tenant on first call to GET.
 * Tenants can disable them or add custom methods via the settings UI.
 */
const SEED_METHODS = [
  { type: "cash",   name: "Cash",   isDefault: true,  sortOrder: 0 },
  { type: "card",   name: "Card",   isDefault: false, sortOrder: 10 },
  { type: "split",  name: "Split",  isDefault: false, sortOrder: 20 },
  { type: "credit", name: "Credit", isDefault: false, sortOrder: 30 },
] as const;

async function ensureSeeded(tenantId: number): Promise<void> {
  // Quick exit if already seeded.
  const existing = await db
    .select({ id: paymentMethodsTable.id })
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.tenantId, tenantId))
    .limit(1);
  if (existing.length > 0) return;

  // Concurrency-safe seed: take a Postgres advisory lock keyed on tenantId
  // so two concurrent first-callers cannot both insert the defaults.
  // Case-insensitive duplicate-name prevention is enforced at the application
  // layer (see POST/PATCH handlers below) — there is no DB-level unique index
  // because functional indexes (lower(name)) don't survive deploy-time schema
  // diffing cleanly.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${42}, ${tenantId})`);
    const recheck = await tx
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.tenantId, tenantId))
      .limit(1);
    if (recheck.length > 0) return;

    await tx.insert(paymentMethodsTable).values(
      SEED_METHODS.map(m => ({
        tenantId,
        type: m.type,
        name: m.name,
        isEnabled: true,
        isDefault: m.isDefault,
        sortOrder: m.sortOrder,
      })),
    );
    logger.info({ tenantId }, "[payment-methods] seeded defaults");
  });
}

router.get("/payment-methods", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await ensureSeeded(tenantId);
  const rows = await db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.tenantId, tenantId))
    .orderBy(asc(paymentMethodsTable.sortOrder), asc(paymentMethodsTable.id));
  res.json(rows);
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(["cash", "card", "split", "credit", "digital", "custom"]).default("custom"),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/payment-methods", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await ensureSeeded(tenantId);

  // Reject duplicate name (case-insensitive) for this tenant.
  const all = await db
    .select({ name: paymentMethodsTable.name })
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.tenantId, tenantId));
  if (all.some(m => m.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    res.status(409).json({ error: "PAYMENT_METHOD_EXISTS", message: `A payment method named "${parsed.data.name}" already exists` });
    return;
  }

  // If marked default, unset any other default first.
  if (parsed.data.isDefault) {
    await db
      .update(paymentMethodsTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(paymentMethodsTable.tenantId, tenantId));
  }

  const [created] = await db
    .insert(paymentMethodsTable)
    .values({
      tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      isEnabled: parsed.data.isEnabled ?? true,
      isDefault: parsed.data.isDefault ?? false,
      sortOrder: parsed.data.sortOrder ?? 100,
    })
    .returning();
  res.status(201).json(created);
});

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.put("/payment-methods/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db
    .select()
    .from(paymentMethodsTable)
    .where(and(eq(paymentMethodsTable.id, id), eq(paymentMethodsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Payment method not found" }); return; }

  // Reject disabling the only enabled method (would leave POS with no payments).
  if (parsed.data.isEnabled === false && existing.isEnabled) {
    const enabledCount = await db
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(and(
        eq(paymentMethodsTable.tenantId, tenantId),
        eq(paymentMethodsTable.isEnabled, true),
      ));
    if (enabledCount.length <= 1) {
      res.status(400).json({
        error: "LAST_PAYMENT_METHOD",
        message: "At least one payment method must remain enabled",
      });
      return;
    }
  }

  // If the rename collides with another row's name, reject.
  if (parsed.data.name && parsed.data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const collisions = await db
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.tenantId, tenantId));
    const all = await db
      .select({ id: paymentMethodsTable.id, name: paymentMethodsTable.name })
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.tenantId, tenantId));
    if (all.some(m => m.id !== id && m.name.toLowerCase() === parsed.data.name!.toLowerCase())) {
      res.status(409).json({
        error: "PAYMENT_METHOD_EXISTS",
        message: `A payment method named "${parsed.data.name}" already exists`,
      });
      return;
    }
    void collisions;
  }

  if (parsed.data.isDefault === true) {
    // Promote this to default → demote everyone else.
    await db
      .update(paymentMethodsTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(paymentMethodsTable.tenantId, tenantId));
  }

  const [updated] = await db
    .update(paymentMethodsTable)
    .set({
      name: parsed.data.name ?? existing.name,
      isEnabled: parsed.data.isEnabled ?? existing.isEnabled,
      isDefault: parsed.data.isDefault ?? existing.isDefault,
      sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(and(eq(paymentMethodsTable.id, id), eq(paymentMethodsTable.tenantId, tenantId)))
    .returning();
  res.json(updated);
});

router.delete("/payment-methods/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(paymentMethodsTable)
    .where(and(eq(paymentMethodsTable.id, id), eq(paymentMethodsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Payment method not found" }); return; }

  // Don't allow deleting built-in types — only custom/digital.
  if (existing.type === "cash" || existing.type === "card" || existing.type === "split" || existing.type === "credit") {
    res.status(400).json({
      error: "BUILTIN_PAYMENT_METHOD",
      message: `"${existing.name}" is a built-in method. You can disable it but not delete it.`,
    });
    return;
  }

  // Don't allow deleting the only enabled method.
  if (existing.isEnabled) {
    const enabledCount = await db
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(and(
        eq(paymentMethodsTable.tenantId, tenantId),
        eq(paymentMethodsTable.isEnabled, true),
      ));
    if (enabledCount.length <= 1) {
      res.status(400).json({
        error: "LAST_PAYMENT_METHOD",
        message: "At least one payment method must remain enabled",
      });
      return;
    }
  }

  await db.delete(paymentMethodsTable).where(and(
    eq(paymentMethodsTable.id, id),
    eq(paymentMethodsTable.tenantId, tenantId),
  ));
  res.status(204).end();
});

export default router;
