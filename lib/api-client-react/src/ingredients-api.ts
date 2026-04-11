import { useQuery, useMutation, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Ingredient = {
  id: number;
  tenantId: number;
  name: string;
  unit: "pcs" | "g" | "kg" | "ml" | "l";
  costPerUnit: number;
  stockQuantity: number;
  minStockLevel: number;
  category: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeIngredient = {
  id: number;
  recipeId: number;
  ingredientId: number;
  quantity: number;
  unit: string;
  notes: string | null;
  ingredientName: string;
  costPerUnit: number;
  stockQuantity: number;
};

export type Recipe = {
  id: number;
  tenantId: number;
  productId: number;
  name: string | null;
  notes: string | null;
  yieldQuantity: number;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
  costPerUnit: number;
};

export type ProductionBatchItem = {
  id: number;
  batchId: number;
  productId: number;
  productName: string;
  quantityPlanned: number;
  quantityProduced: number | null;
  unit: string;
  costCalculated: number | null;
};

export type ProductionBatch = {
  id: number;
  tenantId: number;
  batchNumber: string;
  status: "draft" | "completed" | "cancelled";
  notes: string | null;
  totalCost: number | null;
  completedAt: string | null;
  createdAt: string;
  items: ProductionBatchItem[];
};

export type IngredientUsageRow = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  totalUsed: number;
  costPerUnit: number;
  totalCost: number;
};

// ─── Ingredient hooks ────────────────────────────────────────────────────────

export const INGREDIENTS_KEY = "/api/ingredients";

export function useListIngredients(options?: UseQueryOptions<Ingredient[]>) {
  return useQuery<Ingredient[]>({
    queryKey: [INGREDIENTS_KEY],
    queryFn: () => customFetch<Ingredient[]>("/api/ingredients"),
    ...options,
  });
}

export function useGetIngredient(id: number, options?: UseQueryOptions<Ingredient & { usageLogs: any[] }>) {
  return useQuery<Ingredient & { usageLogs: any[] }>({
    queryKey: [INGREDIENTS_KEY, id],
    queryFn: () => customFetch<Ingredient & { usageLogs: any[] }>(`/api/ingredients/${id}`),
    enabled: id > 0,
    ...options,
  });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Ingredient>) =>
      customFetch<Ingredient>("/api/ingredients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] }),
  });
}

export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Ingredient> }) =>
      customFetch<Ingredient>(`/api/ingredients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] }),
  });
}

export function useAdjustIngredientStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, reason }: { id: number; quantity: number; reason?: string }) =>
      customFetch<Ingredient>(`/api/ingredients/${id}/adjust-stock`, { method: "POST", body: JSON.stringify({ quantity, reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] }),
  });
}

export function useDeleteIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/ingredients/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] }),
  });
}

// ─── Recipe hooks ────────────────────────────────────────────────────────────

export const RECIPES_KEY = "/api/recipes";

export function useListRecipes(options?: UseQueryOptions<Recipe[]>) {
  return useQuery<Recipe[]>({
    queryKey: [RECIPES_KEY],
    queryFn: () => customFetch<Recipe[]>("/api/recipes"),
    ...options,
  });
}

export function useGetRecipe(id: number, options?: UseQueryOptions<Recipe>) {
  return useQuery<Recipe>({
    queryKey: [RECIPES_KEY, id],
    queryFn: () => customFetch<Recipe>(`/api/recipes/${id}`),
    enabled: id > 0,
    ...options,
  });
}

export function useGetRecipeByProduct(productId: number, options?: UseQueryOptions<Recipe>) {
  return useQuery<Recipe>({
    queryKey: [RECIPES_KEY, "product", productId],
    queryFn: () => customFetch<Recipe>(`/api/recipes/by-product/${productId}`),
    enabled: productId > 0,
    retry: false,
    ...options,
  });
}

export type CreateRecipeInput = {
  productId: number;
  name?: string;
  notes?: string;
  yieldQuantity?: number;
  ingredients: Array<{ ingredientId: number; quantity: number; unit: string; notes?: string }>;
};

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecipeInput) =>
      customFetch<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateRecipeInput> }) =>
      customFetch<Recipe>(`/api/recipes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECIPES_KEY] }),
  });
}

// ─── Production hooks ────────────────────────────────────────────────────────

export const PRODUCTION_KEY = "/api/production/batches";

export function useListProductionBatches(options?: UseQueryOptions<ProductionBatch[]>) {
  return useQuery<ProductionBatch[]>({
    queryKey: [PRODUCTION_KEY],
    queryFn: () => customFetch<ProductionBatch[]>("/api/production/batches"),
    ...options,
  });
}

export type CreateBatchInput = {
  notes?: string;
  items: Array<{ productId: number; quantityPlanned: number; unit?: string }>;
};

export function useCreateProductionBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchInput) =>
      customFetch<ProductionBatch>("/api/production/batches", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRODUCTION_KEY] });
      qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] });
    },
  });
}

export function useCompleteProductionBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<ProductionBatch>(`/api/production/batches/${id}/complete`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRODUCTION_KEY] });
      qc.invalidateQueries({ queryKey: [INGREDIENTS_KEY] });
    },
  });
}

export function useUpdateBatchItemQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, itemId, quantityProduced }: { batchId: number; itemId: number; quantityProduced: number }) =>
      customFetch<ProductionBatch>(`/api/production/batches/${batchId}/item/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantityProduced }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PRODUCTION_KEY] }),
  });
}

export function useDeleteProductionBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/production/batches/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PRODUCTION_KEY] }),
  });
}

// ─── Reports hooks ───────────────────────────────────────────────────────────

export function useIngredientUsageReport(params: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const url = `/api/ingredients-usage-report${qs.toString() ? "?" + qs : ""}`;
  return useQuery<IngredientUsageRow[]>({
    queryKey: ["/api/ingredients-usage-report", params],
    queryFn: () => customFetch<IngredientUsageRow[]>(url),
  });
}
