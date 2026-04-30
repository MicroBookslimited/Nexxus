import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, productsTable, productPricingTiersTable, productPurchaseUnitsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

async function ensureProduct(tenantId: number, productId: number) {
  const [p] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  return p ?? null;
}

/* ─── Pricing tiers ─── */

const TierInput = z.object({
  minQty: z.number().positive(),
  maxQty: z.number().positive().nullable().optional(),
  unitPrice: z.number().min(0),
});
const ReplaceTiersBody = z.object({ tiers: z.array(TierInput) });

router.get("/products/:id/pricing-tiers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tiers = await db
    .select()
    .from(productPricingTiersTable)
    .where(and(
      eq(productPricingTiersTable.tenantId, tenantId),
      eq(productPricingTiersTable.productId, productId),
    ))
    .orderBy(asc(productPricingTiersTable.minQty));
  res.json(tiers);
});

router.put("/products/:id/pricing-tiers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReplaceTiersBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const product = await ensureProduct(tenantId, productId);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Per-row sanity: maxQty (if set) must be >= minQty.
  for (const t of parsed.data.tiers) {
    if (t.maxQty != null && t.maxQty < t.minQty) {
      res.status(400).json({
        error: "TIER_INVALID_RANGE",
        message: `Tier max (${t.maxQty}) must be >= min (${t.minQty})`,
      });
      return;
    }
  }

  // Pairwise overlap detection: sort by minQty and ensure each tier starts
  // strictly after the previous tier ends. Open-ended (maxQty=null) tier
  // must be the last one, otherwise everything beyond it overlaps.
  const sorted = [...parsed.data.tiers].sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.maxQty == null) {
      res.status(400).json({
        error: "TIER_OVERLAP",
        message: `Open-ended tier (min ${prev.minQty}, no max) must be the last tier`,
      });
      return;
    }
    if (cur.minQty <= prev.maxQty) {
      res.status(400).json({
        error: "TIER_OVERLAP",
        message: `Tiers overlap: tier starting at ${cur.minQty} conflicts with previous tier ending at ${prev.maxQty}`,
      });
      return;
    }
  }

  await db.delete(productPricingTiersTable).where(and(
    eq(productPricingTiersTable.tenantId, tenantId),
    eq(productPricingTiersTable.productId, productId),
  ));

  if (parsed.data.tiers.length > 0) {
    const now = new Date();
    await db.insert(productPricingTiersTable).values(
      parsed.data.tiers.map(t => ({
        tenantId, productId,
        minQty: t.minQty,
        maxQty: t.maxQty ?? null,
        unitPrice: t.unitPrice,
        createdAt: now,
      })),
    );
  }

  const tiers = await db
    .select()
    .from(productPricingTiersTable)
    .where(and(
      eq(productPricingTiersTable.tenantId, tenantId),
      eq(productPricingTiersTable.productId, productId),
    ))
    .orderBy(asc(productPricingTiersTable.minQty));
  res.json(tiers);
});

/* ─── Purchase / sale units ─── */

const UnitInput = z.object({
  unitName: z.string().trim().min(1).max(40),
  conversionFactor: z.number().positive(),
  isPurchase: z.boolean().optional(),
  isSale: z.boolean().optional(),
});
const ReplaceUnitsBody = z.object({ units: z.array(UnitInput) });

router.get("/products/:id/purchase-units", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const units = await db
    .select()
    .from(productPurchaseUnitsTable)
    .where(and(
      eq(productPurchaseUnitsTable.tenantId, tenantId),
      eq(productPurchaseUnitsTable.productId, productId),
    ))
    .orderBy(asc(productPurchaseUnitsTable.conversionFactor));
  res.json(units);
});

router.put("/products/:id/purchase-units", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReplaceUnitsBody.safeParse(req.body);
  if (!parsed.success) {
    logger.info({ tenantId, productId, err: parsed.error.message }, "[units] invalid payload");
    res.status(400).json({ error: "INVALID_UNIT", message: parsed.error.message });
    return;
  }

  const product = await ensureProduct(tenantId, productId);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Validate each unit.
  for (const u of parsed.data.units) {
    if (!Number.isFinite(u.conversionFactor) || u.conversionFactor <= 0) {
      res.status(400).json({
        error: "INVALID_UNIT",
        message: `Conversion factor for "${u.unitName}" must be a positive number`,
      });
      return;
    }
    const buy = u.isPurchase ?? true;
    const sell = u.isSale ?? false;
    if (!buy && !sell) {
      res.status(400).json({
        error: "INVALID_UNIT",
        message: `Unit "${u.unitName}" must allow either purchase or sale (or both)`,
      });
      return;
    }
    if (u.unitName.toLowerCase() === product.baseUnit.toLowerCase()) {
      res.status(400).json({
        error: "UNIT_EXISTS",
        message: `"${u.unitName}" is the product's base unit and cannot be added as an alternate unit`,
      });
      return;
    }
  }

  // Detect duplicate names (case-insensitive) within the submitted set.
  const seen = new Set<string>();
  for (const u of parsed.data.units) {
    const k = u.unitName.toLowerCase();
    if (seen.has(k)) {
      logger.info({ tenantId, productId, unitName: u.unitName }, "[units] duplicate save attempt");
      res.status(409).json({
        error: "UNIT_EXISTS",
        message: `Unit "${u.unitName}" is listed more than once`,
      });
      return;
    }
    seen.add(k);
  }

  await db.delete(productPurchaseUnitsTable).where(and(
    eq(productPurchaseUnitsTable.tenantId, tenantId),
    eq(productPurchaseUnitsTable.productId, productId),
  ));

  if (parsed.data.units.length > 0) {
    const now = new Date();
    await db.insert(productPurchaseUnitsTable).values(
      parsed.data.units.map(u => ({
        tenantId, productId,
        unitName: u.unitName,
        conversionFactor: u.conversionFactor,
        isPurchase: u.isPurchase ?? true,
        isSale: u.isSale ?? false,
        createdAt: now,
      })),
    );
  }

  const units = await db
    .select()
    .from(productPurchaseUnitsTable)
    .where(and(
      eq(productPurchaseUnitsTable.tenantId, tenantId),
      eq(productPurchaseUnitsTable.productId, productId),
    ))
    .orderBy(asc(productPurchaseUnitsTable.conversionFactor));
  res.json(units);
});

export default router;
