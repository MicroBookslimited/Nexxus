import { Router, type IRouter } from "express";
import { db, tenantsTable, tenantFeaturesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Catalogue of feature flags ─────────────────────────────────────────
 * Add new flags here. Each flag has a category (which area of the app it
 * controls) and a default value PER business type. The client uses
 * `categoryDefaults` only as a fallback when no row exists in tenant_features.
 */
export const FEATURE_CATALOG = [
  // Restaurant-specific
  { key: "tables_management",   label: "Table Management",         category: "Restaurant" },
  { key: "kitchen_display",     label: "Kitchen Display System",   category: "Restaurant" },
  { key: "modifiers",           label: "Item Modifiers",           category: "Restaurant" },
  { key: "split_bills",         label: "Split Bills",              category: "Restaurant" },
  { key: "order_modes",         label: "Dine-in / Takeout / Delivery", category: "Restaurant" },
  // Retail-specific
  { key: "barcode_scanning",    label: "Barcode Scanning (focus-on-mount)", category: "Retail" },
  { key: "product_variants",    label: "Product Variants (size/color)",     category: "Retail" },
  { key: "quick_checkout",      label: "Quick Checkout (single-tap)",       category: "Retail" },
  // Universal
  { key: "discounts",           label: "Discounts",                category: "Universal" },
  { key: "customer_loyalty",    label: "Customer Loyalty",         category: "Universal" },
  { key: "weighing_scale",      label: "Weighing Scale",           category: "Universal" },
] as const;

export type FeatureKey = typeof FEATURE_CATALOG[number]["key"];

/** Per-business-type defaults. Used when the tenant has no explicit row. */
export const DEFAULT_FEATURES: Record<string, Record<FeatureKey, boolean>> = {
  restaurant: {
    tables_management: true,
    kitchen_display:   true,
    modifiers:         true,
    split_bills:       true,
    order_modes:       true,
    barcode_scanning:  false,
    product_variants:  false,
    quick_checkout:    false,
    discounts:         true,
    customer_loyalty:  true,
    weighing_scale:    true,
  },
  retail: {
    tables_management: false,
    kitchen_display:   false,
    modifiers:         false,
    split_bills:       false,
    order_modes:       false,
    barcode_scanning:  true,
    product_variants:  true,
    quick_checkout:    true,
    discounts:         true,
    customer_loyalty:  true,
    weighing_scale:    true,
  },
  wholesale: {
    tables_management: false,
    kitchen_display:   false,
    modifiers:         false,
    split_bills:       false,
    order_modes:       false,
    barcode_scanning:  true,
    product_variants:  true,
    quick_checkout:    false,
    discounts:         true,
    customer_loyalty:  false,
    weighing_scale:    true,
  },
  hybrid: {
    // All features enabled — tenant gets both surfaces, can selectively turn off.
    tables_management: true,
    kitchen_display:   true,
    modifiers:         true,
    split_bills:       true,
    order_modes:       true,
    barcode_scanning:  true,
    product_variants:  true,
    quick_checkout:    true,
    discounts:         true,
    customer_loyalty:  true,
    weighing_scale:    true,
  },
};

const VALID_BUSINESS_TYPES = ["restaurant", "retail", "wholesale", "hybrid"] as const;
type BusinessType = typeof VALID_BUSINESS_TYPES[number];

/** Resolve effective feature flags for a tenant: defaults + overrides. */
export async function getEffectiveFeatures(tenantId: number, businessType: string): Promise<Record<string, boolean>> {
  const defaults = DEFAULT_FEATURES[businessType] ?? DEFAULT_FEATURES["restaurant"]!;
  const overrides = await db.select().from(tenantFeaturesTable).where(eq(tenantFeaturesTable.tenantId, tenantId));
  const result: Record<string, boolean> = { ...defaults };
  for (const o of overrides) result[o.featureName] = o.isEnabled;
  return result;
}

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7))?.tenantId ?? null;
}

/* ─── GET /api/business-profile ──────────────────────────────────────────
 * Returns business_type + effective feature flags for the current tenant.
 * Used by the client on app boot to drive UI routing.
 */
router.get("/business-profile", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [tenant] = await db.select({
    id: tenantsTable.id,
    businessName: tenantsTable.businessName,
    businessType: tenantsTable.businessType,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const features = await getEffectiveFeatures(tenantId, tenant.businessType);
  res.json({
    tenantId: tenant.id,
    businessName: tenant.businessName,
    businessType: tenant.businessType,
    features,
    catalog: FEATURE_CATALOG,
  });
});

/* ─── PUT /api/business-profile/type ─────────────────────────────────────
 * Change the tenant's business type. Admin-only on the client; the server
 * enforces only that the caller is the tenant.
 */
const SetTypeBody = z.object({ businessType: z.enum(VALID_BUSINESS_TYPES) });
router.put("/business-profile/type", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SetTypeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid business type" }); return; }

  await db.update(tenantsTable)
    .set({ businessType: parsed.data.businessType, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId));

  // Wipe per-tenant overrides so the new defaults take effect cleanly. Admins
  // can re-enable individual flags afterwards.
  await db.delete(tenantFeaturesTable).where(eq(tenantFeaturesTable.tenantId, tenantId));

  const features = await getEffectiveFeatures(tenantId, parsed.data.businessType);
  res.json({ businessType: parsed.data.businessType, features });
});

/* ─── PUT /api/business-profile/features/:key ────────────────────────────
 * Toggle a single feature flag. Upserts into tenant_features.
 */
const SetFeatureBody = z.object({ enabled: z.boolean() });
router.put("/business-profile/features/:key", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const key = req.params["key"];
  if (!key || !FEATURE_CATALOG.some(f => f.key === key)) {
    res.status(400).json({ error: "Unknown feature" }); return;
  }
  const parsed = SetFeatureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "enabled must be boolean" }); return; }

  const [existing] = await db.select().from(tenantFeaturesTable)
    .where(and(eq(tenantFeaturesTable.tenantId, tenantId), eq(tenantFeaturesTable.featureName, key)));

  if (existing) {
    await db.update(tenantFeaturesTable)
      .set({ isEnabled: parsed.data.enabled, updatedAt: new Date() })
      .where(eq(tenantFeaturesTable.id, existing.id));
  } else {
    const now = new Date();
    await db.insert(tenantFeaturesTable).values({
      tenantId, featureName: key, isEnabled: parsed.data.enabled,
      createdAt: now, updatedAt: now,
    });
  }
  res.json({ feature: key, enabled: parsed.data.enabled });
});

export default router;
