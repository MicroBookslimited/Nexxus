import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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

  await db.delete(variantGroupsTable).where(eq(variantGroupsTable.productId, productId));

  for (const group of parsed.data.groups) {
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
