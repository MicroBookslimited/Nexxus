import { Router, type IRouter } from "express";
import { eq, and, isNotNull, sql, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  variantGroupsTable,
  variantOptionsTable,
  variantCombinationsTable,
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

async function getVariantCombinationsForProduct(productId: number) {
  return db
    .select()
    .from(variantCombinationsTable)
    .where(eq(variantCombinationsTable.productId, productId))
    .orderBy(variantCombinationsTable.position);
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

/* ─── Cross-product helper ─── */
function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
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
  const combinations = await getVariantCombinationsForProduct(product.id);

  res.json(
    GetProductCustomizationResponse.parse({
      productId: product.id,
      productName: product.name,
      basePrice: product.price,
      variantGroups,
      modifierGroups,
      combinations,
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
  const combinations = await getVariantCombinationsForProduct(params.data.id);
  res.json(GetProductVariantsResponse.parse({ groups, combinations }));
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

  const isMultiGroup = parsed.data.groups.filter((g) => g.name.trim()).length >= 2;

  // ── 1. Upsert groups and options ────────────────────────────────────────────
  const existingGroups = await db.select().from(variantGroupsTable).where(eq(variantGroupsTable.productId, productId));
  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const submittedGroupIds = new Set(
    parsed.data.groups.map((g) => g.groupId).filter((id): id is number => typeof id === "number"),
  );

  for (const g of existingGroups) {
    if (!submittedGroupIds.has(g.id)) {
      await db.delete(variantGroupsTable).where(eq(variantGroupsTable.id, g.id));
    }
  }

  // Map of (groupIndex → saved options) — used later for combination resolution
  const savedGroupOptions: Array<Array<{ id: number; name: string }>> = [];

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

    for (const o of existingOptions) {
      if (!submittedOptionIds.has(o.id)) {
        await db.delete(variantOptionsTable).where(eq(variantOptionsTable.id, o.id));
      }
    }

    const groupSavedOptions: Array<{ id: number; name: string }> = [];
    for (const [oi, opt] of (group.options ?? []).filter((o) => o.name.trim()).entries()) {
      if (opt.optionId && existingOptionIds.has(opt.optionId)) {
        const patch: Partial<typeof variantOptionsTable.$inferInsert> = {
          name: opt.name,
          priceAdjustment: opt.priceAdjustment ?? 0,
          position: oi,
          sku: opt.sku ?? null,
          // For multi-group products, stock is at combination level — clear option-level stock
          stockCount: isMultiGroup ? null : (opt.stockCount !== undefined ? (opt.stockCount ?? null) : undefined as never),
        };
        await db.update(variantOptionsTable).set(patch).where(eq(variantOptionsTable.id, opt.optionId));
        groupSavedOptions.push({ id: opt.optionId, name: opt.name });
      } else {
        const [ins] = await db.insert(variantOptionsTable).values({
          groupId,
          name: opt.name,
          priceAdjustment: opt.priceAdjustment ?? 0,
          position: oi,
          stockCount: isMultiGroup ? null : (opt.stockCount ?? null),
          sku: opt.sku ?? null,
        }).returning();
        groupSavedOptions.push({ id: ins.id, name: ins.name });
      }
    }
    savedGroupOptions.push(groupSavedOptions);
  }

  // ── 2. Handle combinations (only for multi-group products) ──────────────────
  if (isMultiGroup) {
    const incomingCombinations = parsed.data.combinations ?? [];
    const existingCombinations = await db.select().from(variantCombinationsTable)
      .where(eq(variantCombinationsTable.productId, productId));

    // Build optionId lookup: groupIdx → (optionName → optionId)
    const nameToId: Array<Map<string, number>> = savedGroupOptions.map(
      (opts) => new Map(opts.map((o) => [o.name.trim().toLowerCase(), o.id])),
    );

    // Generate the full cross-product of saved options (for auto-generating missing combinations)
    const allOptionArrays = savedGroupOptions.map((opts) => opts.map((o) => ({ id: o.id, name: o.name })));
    const crossProduct = cartesian(allOptionArrays);

    // Build map of "sorted optionIds key" → existing combination
    const existingByKey = new Map(
      existingCombinations.map((c) => {
        const key = [...c.optionIds].sort((a, b) => a - b).join(",");
        return [key, c];
      }),
    );

    // Build map of "sorted optionIds key" → incoming combination data
    const incomingByKey = new Map<string, { combinationId?: number; price: number | null; stockCount: number | null; sku: string | null }>();
    for (const combo of incomingCombinations) {
      // Resolve optionNames → optionIds using the group-index mapping
      const resolvedIds: number[] = [];
      let valid = true;
      for (let gi = 0; gi < combo.optionNames.length; gi++) {
        const id = nameToId[gi]?.get(combo.optionNames[gi].trim().toLowerCase());
        if (!id) { valid = false; break; }
        resolvedIds.push(id);
      }
      if (!valid || resolvedIds.length !== savedGroupOptions.length) continue;
      const key = [...resolvedIds].sort((a, b) => a - b).join(",");
      incomingByKey.set(key, {
        combinationId: combo.combinationId,
        price: (combo as { price?: number | null }).price ?? null,
        stockCount: combo.stockCount ?? null,
        sku: combo.sku ?? null,
      });
    }

    // Upsert all cross-product combinations
    const handledKeys = new Set<string>();
    for (const [pos, combo] of crossProduct.entries()) {
      const optionIds = combo.map((o) => o.id);
      const label = combo.map((o) => o.name).join("/");
      const key = [...optionIds].sort((a, b) => a - b).join(",");
      handledKeys.add(key);

      const incoming = incomingByKey.get(key);
      const existing = existingByKey.get(key);

      if (existing) {
        await db.update(variantCombinationsTable)
          .set({
            label,
            position: pos,
            price: incoming ? (incoming.price ?? null) : existing.price,
            stockCount: incoming ? (incoming.stockCount ?? null) : existing.stockCount,
            sku: incoming ? (incoming.sku ?? null) : existing.sku,
          })
          .where(eq(variantCombinationsTable.id, existing.id));
      } else {
        await db.insert(variantCombinationsTable).values({
          productId,
          optionIds,
          label,
          position: pos,
          price: incoming?.price ?? null,
          stockCount: incoming?.stockCount ?? null,
          sku: incoming?.sku ?? null,
        });
      }
    }

    // Delete combinations that no longer map to valid cross-product entries
    for (const existing of existingCombinations) {
      const key = [...existing.optionIds].sort((a, b) => a - b).join(",");
      if (!handledKeys.has(key)) {
        await db.delete(variantCombinationsTable).where(eq(variantCombinationsTable.id, existing.id));
      }
    }

    // Sync product.stockCount = SUM(combination.stockCount)
    const [cCheck] = await db
      .select({
        cnt:   sql<number>`COUNT(*)::int`,
        total: sql<number>`COALESCE(SUM(${variantCombinationsTable.stockCount}), 0)`,
      })
      .from(variantCombinationsTable)
      .where(and(
        eq(variantCombinationsTable.productId, productId),
        isNotNull(variantCombinationsTable.stockCount),
      ));

    if ((cCheck?.cnt ?? 0) > 0) {
      const total = cCheck?.total ?? 0;
      await db.update(productsTable)
        .set({ stockCount: total, inStock: total > 0 })
        .where(eq(productsTable.id, productId));
    }
  } else {
    // Single-group: clear combinations, use option-level stock
    await db.delete(variantCombinationsTable).where(eq(variantCombinationsTable.productId, productId));

    const [vCheck] = await db
      .select({
        cnt:   sql<number>`COUNT(*)::int`,
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
  }

  const groups = await getVariantGroupsForProduct(productId);
  const combinations = await getVariantCombinationsForProduct(productId);
  res.json(SaveProductVariantsResponse.parse({ groups, combinations }));
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
