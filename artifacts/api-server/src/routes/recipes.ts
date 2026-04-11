import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, recipesTable, recipeIngredientsTable, ingredientsTable, productsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const RecipeIngredientBody = z.object({
  ingredientId: z.number().int(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().optional(),
});

const CreateRecipeBody = z.object({
  productId: z.number().int(),
  name: z.string().optional(),
  notes: z.string().optional(),
  yieldQuantity: z.number().positive().default(1),
  ingredients: z.array(RecipeIngredientBody).default([]),
});

const UpdateRecipeBody = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  yieldQuantity: z.number().positive().optional(),
  ingredients: z.array(RecipeIngredientBody).optional(),
});

async function enrichRecipe(recipe: typeof recipesTable.$inferSelect) {
  const items = await db
    .select({
      id: recipeIngredientsTable.id,
      recipeId: recipeIngredientsTable.recipeId,
      ingredientId: recipeIngredientsTable.ingredientId,
      quantity: recipeIngredientsTable.quantity,
      unit: recipeIngredientsTable.unit,
      notes: recipeIngredientsTable.notes,
      ingredientName: ingredientsTable.name,
      costPerUnit: ingredientsTable.costPerUnit,
      stockQuantity: ingredientsTable.stockQuantity,
    })
    .from(recipeIngredientsTable)
    .innerJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id))
    .where(eq(recipeIngredientsTable.recipeId, recipe.id));

  const totalCost = items.reduce((sum, i) => sum + (i.quantity / recipe.yieldQuantity) * i.costPerUnit, 0);
  return { ...recipe, ingredients: items, costPerUnit: Math.round(totalCost * 100) / 100 };
}

router.get("/recipes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const recipes = await db.select().from(recipesTable)
    .where(eq(recipesTable.tenantId, tenantId));

  const enriched = await Promise.all(recipes.map(enrichRecipe));
  res.json(enriched);
});

router.get("/recipes/by-product/:productId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }

  const [recipe] = await db.select().from(recipesTable)
    .where(and(eq(recipesTable.productId, productId), eq(recipesTable.tenantId, tenantId)));

  if (!recipe) { res.status(404).json({ error: "No recipe found for this product" }); return; }
  res.json(await enrichRecipe(recipe));
});

router.get("/recipes/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [recipe] = await db.select().from(recipesTable)
    .where(and(eq(recipesTable.id, id), eq(recipesTable.tenantId, tenantId)));
  if (!recipe) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await enrichRecipe(recipe));
});

router.post("/recipes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateRecipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, parsed.data.productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [existing] = await db.select().from(recipesTable)
    .where(and(eq(recipesTable.productId, parsed.data.productId), eq(recipesTable.tenantId, tenantId)));
  if (existing) { res.status(409).json({ error: "Recipe already exists for this product" }); return; }

  const [recipe] = await db.insert(recipesTable).values({
    tenantId,
    productId: parsed.data.productId,
    name: parsed.data.name,
    notes: parsed.data.notes,
    yieldQuantity: parsed.data.yieldQuantity,
  }).returning();

  if (parsed.data.ingredients.length > 0) {
    await db.insert(recipeIngredientsTable).values(
      parsed.data.ingredients.map(i => ({ recipeId: recipe.id, ...i }))
    );
  }

  res.status(201).json(await enrichRecipe(recipe));
});

router.patch("/recipes/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateRecipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { ingredients, ...recipeFields } = parsed.data;

  const [recipe] = await db.update(recipesTable)
    .set({ ...recipeFields, updatedAt: new Date() })
    .where(and(eq(recipesTable.id, id), eq(recipesTable.tenantId, tenantId)))
    .returning();
  if (!recipe) { res.status(404).json({ error: "Not found" }); return; }

  if (ingredients !== undefined) {
    await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, id));
    if (ingredients.length > 0) {
      await db.insert(recipeIngredientsTable).values(
        ingredients.map(i => ({ recipeId: id, ...i }))
      );
    }
  }

  res.json(await enrichRecipe(recipe));
});

router.delete("/recipes/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.delete(recipesTable)
    .where(and(eq(recipesTable.id, id), eq(recipesTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
