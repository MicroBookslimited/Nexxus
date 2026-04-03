import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

const router: IRouter = Router();

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
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductCustomizationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

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
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductVariantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const groups = await getVariantGroupsForProduct(params.data.id);
  res.json(GetProductVariantsResponse.parse(groups));
});

router.put("/products/:id/variants", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveProductVariantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SaveProductVariantsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const productId = params.data.id;

  // Delete all existing variant groups (cascade deletes options)
  await db.delete(variantGroupsTable).where(eq(variantGroupsTable.productId, productId));

  // Insert new groups and options
  for (const [gi, group] of parsed.data.groups.entries()) {
    const [insertedGroup] = await db
      .insert(variantGroupsTable)
      .values({ productId, name: group.name, required: group.required ?? true })
      .returning();

    for (const [oi, option] of (group.options ?? []).entries()) {
      await db.insert(variantOptionsTable).values({
        groupId: insertedGroup.id,
        name: option.name,
        priceAdjustment: option.priceAdjustment ?? 0,
        position: oi,
      });
    }
  }

  const groups = await getVariantGroupsForProduct(productId);
  res.json(SaveProductVariantsResponse.parse(groups));
});

router.get("/products/:id/modifiers", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductModifiersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const groups = await getModifierGroupsForProduct(params.data.id);
  res.json(GetProductModifiersResponse.parse(groups));
});

router.put("/products/:id/modifiers", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveProductModifiersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SaveProductModifiersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const productId = params.data.id;

  // Delete all existing modifier groups (cascade deletes options)
  await db.delete(modifierGroupsTable).where(eq(modifierGroupsTable.productId, productId));

  // Insert new groups and options
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
