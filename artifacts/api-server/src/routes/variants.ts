import { Router, type IRouter } from "express";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  variantGroupsTable,
  variantOptionsTable,
  modifierGroupsTable,
  modifierOptionsTable,
} from "@workspace/db";
import {
  GetProductCustomizationParams,
  GetProductCustomizationResponse,
  GetProductVariantsParams,
  GetProductVariantsResponse,
  SaveProductVariantsParams,
  SaveProductVariantsBody,
  SaveProductVariantsResponse,
  GetProductModifiersParams,
  GetProductModifiersResponse,
  SaveProductModifiersParams,
  SaveProductModifiersBody,
  SaveProductModifiersResponse,
} from "@workspace/api-zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Verify product belongs to tenant ─── */
async function ownedProduct(productId: number, tenantId: number) {
  const [p] = await db.select({ id: productsTable.id, name: productsTable.name, price: productsTable.price })
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  return p ?? null;
}

async function getVariantGroupsForProduct(productId: number) {
  const groups = await db
    .select()
    .from(variantGroupsTable)
    .where(eq(variantGroupsTable.productId, productId));

  return Promise.all(
    groups.map(async (g) => {
      const options = await db
        .select()
        .from(variantOptionsTable)
        .where(eq(variantOptionsTable.groupId, g.id))
        .orderBy(variantOptionsTable.position);
      return { ...g, options };
    }),
  );
}

async function getModifierGroupsForProduct(productId: number) {
  const groups = await db
    .select()
    .from(modifierGroupsTable)
    .where(eq(modifierGroupsTable.productId, productId));

  return Promise.all(
    groups.map(async (g) => {
      const options = await db
        .select()
        .from(modifierOptionsTable)
        .where(eq(modifierOptionsTable.groupId, g.id))
        .orderBy(modifierOptionsTable.position);
      return { ...g, options };
    }),
  );
}

router.get("/products/:id/customize", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductCustomizationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const product = await ownedProduct(params.data.id, tenantId);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const variantGroups = await getVariantGroupsForProduct(product.id);
  const modifierGroups = await getModifierGroupsForProduct(product.id);

  res.json(
    GetProductCustomizationResponse.parse({
      productId: product.id,
      productName: product.name,
      basePrice: product.price,
      variantGroups,
      modifierGroups,
    }),
  );
});

router.get("/products/:id/variants", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductVariantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!await ownedProduct(params.data.id, tenantId)) { res.status(404).json({ error: "Product not found" }); return; }

  const groups = await getVariantGroupsForProduct(params.data.id);
  res.json(GetProductVariantsResponse.parse(groups));
});

router.put("/products/:id/variants", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveProductVariantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = SaveProductVariantsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const productId = params.data.id;
  if (!await ownedProduct(productId, tenantId)) { res.status(404).json({ error: "Product not found" }); return; }

  // Upsert strategy: diff by id so existing options keep their stockCounts.
  const existingGroups = await db.select().from(variantGroupsTable).where(eq(variantGroupsTable.productId, productId));
  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const submittedGroupIds = new Set(
    parsed.data.groups.map((g) => g.groupId).filter((id): id is number => typeof id === "number"),
  );

  // Delete groups removed from the payload (cascade removes their options)
  for (const g of existingGroups) {
    if (!submittedGroupIds.has(g.id)) {
      await db.delete(variantGroupsTable).where(eq(variantGroupsTable.id, g.id));
    }
  }

  for (const group of parsed.data.groups.filter((g) => g.name.trim())) {
    let groupId: number;
    if (group.groupId && existingGroupIds.has(group.groupId)) {
      await db.update(variantGroupsTable)
        .set({ name: group.name, required: group.required ?? true })
        .where(eq(variantGroupsTable.id, group.groupId));
      groupId = group.groupId;
    } else {
      const [ins] = await db.insert(variantGroupsTable)
        .values({ productId, name: group.name, required: group.required ?? true })
        .returning();
      groupId = ins.id;
    }

    const existingOptions = await db.select().from(variantOptionsTable).where(eq(variantOptionsTable.groupId, groupId));
    const existingOptionIds = new Set(existingOptions.map((o) => o.id));
    const submittedOptionIds = new Set(
      (group.options ?? []).map((o) => o.optionId).filter((id): id is number => typeof id === "number"),
    );

    // Delete options removed from the payload
    for (const o of existingOptions) {
      if (!submittedOptionIds.has(o.id)) {
        await db.delete(variantOptionsTable).where(eq(variantOptionsTable.id, o.id));
      }
    }

    // Upsert each option
    for (const [oi, opt] of (group.options ?? []).filter((o) => o.name.trim()).entries()) {
      if (opt.optionId && existingOptionIds.has(opt.optionId)) {
        const patch: Partial<typeof variantOptionsTable.$inferInsert> = {
          name: opt.name,
          priceAdjustment: opt.priceAdjustment ?? 0,
          position: oi,
          sku: opt.sku ?? null,
        };
        // Only overwrite stockCount when the caller explicitly sends a value (including null)
        if (opt.stockCount !== undefined) patch.stockCount = opt.stockCount ?? null;
        await db.update(variantOptionsTable).set(patch).where(eq(variantOptionsTable.id, opt.optionId));
      } else {
        await db.insert(variantOptionsTable).values({
          groupId,
          name: opt.name,
          priceAdjustment: opt.priceAdjustment ?? 0,
          position: oi,
          stockCount: opt.stockCount ?? null,
          sku: opt.sku ?? null,
        });
      }
    }
  }

  // When at least one option has per-variant stock, sync product.stockCount = SUM
  const [vCheck] = await db
    .select({
      cnt: sql<number>`COUNT(*)::int`,
      total: sql<number>`COALESCE(SUM(${variantOptionsTable.stockCount}), 0)`,
    })
    .from(variantOptionsTable)
    .innerJoin(variantGroupsTable, eq(variantGroupsTable.id, variantOptionsTable.groupId))
    .where(and(eq(variantGroupsTable.productId, productId), isNotNull(variantOptionsTable.stockCount)));

  if ((vCheck?.cnt ?? 0) > 0) {
    const total = vCheck?.total ?? 0;
    await db.update(productsTable)
      .set({ stockCount: total, inStock: total > 0 })
      .where(eq(productsTable.id, productId));
  }

  const groups = await getVariantGroupsForProduct(productId);
  res.json(SaveProductVariantsResponse.parse(groups));
});

router.get("/products/:id/modifiers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductModifiersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!await ownedProduct(params.data.id, tenantId)) { res.status(404).json({ error: "Product not found" }); return; }

  const groups = await getModifierGroupsForProduct(params.data.id);
  res.json(GetProductModifiersResponse.parse(groups));
});

router.put("/products/:id/modifiers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveProductModifiersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = SaveProductModifiersBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const productId = params.data.id;
  if (!await ownedProduct(productId, tenantId)) { res.status(404).json({ error: "Product not found" }); return; }

  await db.delete(modifierGroupsTable).where(eq(modifierGroupsTable.productId, productId));

  for (const group of parsed.data.groups) {
    const [insertedGroup] = await db
      .insert(modifierGroupsTable)
      .values({
        productId,
        name: group.name,
        required: group.required ?? false,
        minSelections: group.minSelections ?? 0,
        maxSelections: group.maxSelections ?? 0,
      })
      .returning();

    for (const [oi, option] of (group.options ?? []).entries()) {
      await db.insert(modifierOptionsTable).values({
        groupId: insertedGroup.id,
        name: option.name,
        priceAdjustment: option.priceAdjustment ?? 0,
        position: oi,
      });
    }
  }

  const groups = await getModifierGroupsForProduct(productId);
  res.json(SaveProductModifiersResponse.parse(groups));
});

export default router;
