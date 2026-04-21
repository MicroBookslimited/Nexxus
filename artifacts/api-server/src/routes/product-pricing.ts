import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, productsTable, productPricingTiersTable, productPurchaseUnitsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

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
  minQty: z.number().min(0),
  maxQty: z.number().min(0).nullable().optional(),
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

  // Sanity-check: maxQty (if set) must be >= minQty
  for (const t of parsed.data.tiers) {
    if (t.maxQty != null && t.maxQty < t.minQty) {
      res.status(400).json({ error: `Tier max (${t.maxQty}) must be >= min (${t.minQty})` });
      return;
    }
  }

  await db.delete(productPricingTiersTable).where(and(
    eq(productPricingTiersTable.tenantId, tenantId),
    eq(productPricingTiersTable.productId, productId),
  ));

  if (parsed.data.tiers.length > 0) {
    await db.insert(productPricingTiersTable).values(
      parsed.data.tiers.map(t => ({
        tenantId, productId,
        minQty: t.minQty,
        maxQty: t.maxQty ?? null,
        unitPrice: t.unitPrice,
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
  unitName: z.string().min(1).max(40),
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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const product = await ensureProduct(tenantId, productId);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  await db.delete(productPurchaseUnitsTable).where(and(
    eq(productPurchaseUnitsTable.tenantId, tenantId),
    eq(productPurchaseUnitsTable.productId, productId),
  ));

  if (parsed.data.units.length > 0) {
    await db.insert(productPurchaseUnitsTable).values(
      parsed.data.units.map(u => ({
        tenantId, productId,
        unitName: u.unitName,
        conversionFactor: u.conversionFactor,
        isPurchase: u.isPurchase ?? true,
        isSale: u.isSale ?? false,
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
