import { Router, type IRouter, type Request, type Response } from "express";
import { eq, like, and, inArray, isNull, isNotNull, sql, type SQL, count, desc, asc, gte, lte } from "drizzle-orm";
import { db, productsTable, variantGroupsTable, modifierGroupsTable, locationsTable, productLocationsTable, locationInventoryTable, stockMovementsTable, compositeProductComponentsTable, orderItemsTable, purchaseBillItemsTable, purchasesTable, supplierReturnItemsTable, stockTransfersTable, weightLabelsTable, stockAdjustmentsTable, stockCountItemsTable, productBatchesTable, productionBatchItemsTable, productPricingTiersTable, productPurchaseUnitsTable, promotionsTable, recipesTable, recipeIngredientsTable, heldOrdersTable, staffTable, rolesTable } from "@workspace/db";
import { logAudit } from "./audit";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  GetProductResponse,
  UpdateProductParams,
  UpdateProductResponse,
  DeleteProductParams,
  ListProductsResponse,
  ListProductsQueryParams,
  BulkArchiveProductsBody,
  BulkRestoreProductsBody,
  MergeProductsBody,
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

/**
 * Authorise a caller for destructive inventory operations (merge, etc.).
 * Requires a valid tenant token, a non-technician session, and a staff member
 * whose role is Owner/Admin or grants the `inventory.manage` permission.
 * Mirrors the pattern in price-manager.ts.
 */
async function authoriseInventoryCaller(
  req: Request,
  res: Response,
  staffId: number,
): Promise<{ tenantId: number; staffId: number; staffName: string | null } | null> {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (payload.restrictedRole === "technician") {
    res.status(403).json({ error: "Technician sessions cannot manage inventory" });
    return null;
  }
  const tenantId = payload.tenantId;
  const [staff] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  if (!staff) { res.status(403).json({ error: "Staff not found for this tenant" }); return null; }
  const role = (staff as { role?: string }).role ?? "";
  let allowed = ["Owner", "Admin"].includes(role);
  if (!allowed) {
    const [roleRow] = await db.select().from(rolesTable)
      .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, role)));
    allowed = !!(roleRow && Array.isArray(roleRow.permissions) && roleRow.permissions.includes("inventory.manage"));
  }
  if (!allowed) { res.status(403).json({ error: "You do not have permission to manage inventory" }); return null; }
  return { tenantId, staffId: staff.id, staffName: (staff as { name?: string }).name ?? null };
}

async function withFlags(p: typeof productsTable.$inferSelect) {
  const [vCount] = await db
    .select({ n: count() })
    .from(variantGroupsTable)
    .where(eq(variantGroupsTable.productId, p.id));
  const [mCount] = await db
    .select({ n: count() })
    .from(modifierGroupsTable)
    .where(eq(modifierGroupsTable.productId, p.id));
  const [cCount] = await db
    .select({ n: count() })
    .from(compositeProductComponentsTable)
    .where(eq(compositeProductComponentsTable.parentProductId, p.id));

  return {
    ...p,
    imageUrl: p.imageUrl ?? undefined,
    description: p.description ?? undefined,
    barcode: p.barcode ?? undefined,
    sku: p.sku ?? undefined,
    hasVariants: Number(vCount.n) > 0,
    hasModifiers: Number(mCount.n) > 0,
    isComposite: Number(cCount.n) > 0,
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [eq(productsTable.tenantId, tenantId)];
  // Archived (soft-deleted) products are hidden by default. Pass
  // includeArchived=true to surface them (e.g. the "Show archived" toggle).
  if (!query.data.includeArchived) {
    conditions.push(isNull(productsTable.archivedAt));
  }
  if (query.data.category) {
    conditions.push(eq(productsTable.category, query.data.category));
  }
  if (query.data.search) {
    conditions.push(like(productsTable.name, `%${query.data.search}%`));
  }

  const products = await db.select().from(productsTable).where(and(...conditions));

  const locationId = query.data.locationId;
  let overrides: { productId: number; priceOverride: number | null; isAvailable: boolean }[] = [];
  let locationStock: { productId: number; stockCount: number }[] = [];
  if (locationId) {
    [overrides, locationStock] = await Promise.all([
      db
        .select({ productId: productLocationsTable.productId, priceOverride: productLocationsTable.priceOverride, isAvailable: productLocationsTable.isAvailable })
        .from(productLocationsTable)
        .where(eq(productLocationsTable.locationId, locationId)),
      db
        .select({ productId: locationInventoryTable.productId, stockCount: locationInventoryTable.stockCount })
        .from(locationInventoryTable)
        .where(eq(locationInventoryTable.locationId, locationId)),
    ]);
  }

  const stockMap = new Map(locationStock.map((s) => [s.productId, s.stockCount]));
  // Index overrides by productId for O(1) lookup in the per-product map below
  // (avoids an O(N²) overrides.find() per product on large catalogs).
  const overrideMap = new Map(overrides.map((o) => [o.productId, o]));

  // ── Combined cross-location stock (dashboard / no locationId) ───────────
  // When no specific location is requested, the displayed stock should be the
  // SUM of a product's inventory across ALL of the tenant's locations — not
  // the global stock_count, which manual per-location stock entry never
  // updates (it only writes location_inventory). Without this, a tenant that
  // distributes stock across branches sees "Out of stock" on the catalog.
  // We only override the global value when the location sum is > 0, so
  // single-location tenants (and undistributed stock) keep their existing
  // global stock_count / inStock behavior untouched.
  const locationSumMap = new Map<number, number>();
  if (!locationId) {
    const sums = await db
      .select({
        productId: locationInventoryTable.productId,
        total: sql<number>`COALESCE(SUM(${locationInventoryTable.stockCount}), 0)`,
      })
      .from(locationInventoryTable)
      .innerJoin(locationsTable, eq(locationsTable.id, locationInventoryTable.locationId))
      .where(eq(locationsTable.tenantId, tenantId))
      .groupBy(locationInventoryTable.productId);
    for (const s of sums) locationSumMap.set(s.productId, Number(s.total));
  }

  // ── Composite product stock derivation ─────────────────────────────────
  // For composite products, the persisted stock_count is always 0 (the row
  // is a "recipe", not a stockable item). The real availability is the
  // maximum number of bundles we can build from current component stock:
  //
  //   maxBuildable = min over each component of floor(componentStock / qty)
  //
  // We compute this in batch for ALL composite parents in the response so
  // the client list naturally shows the correct quantity (and isn't a
  // false "Out of stock"). Per-location stock is honored when a locationId
  // is supplied.
  const compositeIds = products
    .filter((p) => p.structureType === "composite")
    .map((p) => p.id);

  const compositeStockMap = new Map<number, number>();
  if (compositeIds.length > 0) {
    const components = await db
      .select({
        parentProductId: compositeProductComponentsTable.parentProductId,
        childProductId: compositeProductComponentsTable.childProductId,
        quantityRequired: compositeProductComponentsTable.quantityRequired,
        childGlobalStock: productsTable.stockCount,
      })
      .from(compositeProductComponentsTable)
      .leftJoin(productsTable, eq(productsTable.id, compositeProductComponentsTable.childProductId))
      .where(and(
        eq(compositeProductComponentsTable.tenantId, tenantId),
        inArray(compositeProductComponentsTable.parentProductId, compositeIds),
      ));

    // Resolve child stock: per-location when locationId is set, else global.
    let childStockOf = (childId: number, fallbackGlobal: number) => fallbackGlobal;
    if (locationId) {
      const childIds = Array.from(new Set(components.map((c) => c.childProductId)));
      const childInv = childIds.length
        ? await db
            .select({
              productId: locationInventoryTable.productId,
              stockCount: locationInventoryTable.stockCount,
            })
            .from(locationInventoryTable)
            .where(and(
              eq(locationInventoryTable.locationId, locationId),
              inArray(locationInventoryTable.productId, childIds),
            ))
        : [];
      const childInvMap = new Map(childInv.map((i) => [i.productId, i.stockCount]));
      // When locationId is supplied, children without a row at this
      // location contribute 0 — this matches the existing
      // /products/:id/available-composite-quantity endpoint.
      childStockOf = (childId: number) => childInvMap.get(childId) ?? 0;
    }

    // Group components by parent and reduce.
    const byParent = new Map<number, { childProductId: number; quantityRequired: number; childGlobalStock: number | null }[]>();
    for (const c of components) {
      const list = byParent.get(c.parentProductId) ?? [];
      list.push(c);
      byParent.set(c.parentProductId, list);
    }
    for (const parentId of compositeIds) {
      const list = byParent.get(parentId) ?? [];
      if (list.length === 0) {
        // Composite with no components yet → genuinely 0 buildable.
        compositeStockMap.set(parentId, 0);
        continue;
      }
      let max = Number.POSITIVE_INFINITY;
      for (const c of list) {
        const stock = childStockOf(c.childProductId, c.childGlobalStock ?? 0);
        const possible = c.quantityRequired > 0
          ? Math.floor(stock / c.quantityRequired)
          : 0;
        if (possible < max) max = possible;
      }
      compositeStockMap.set(parentId, Number.isFinite(max) ? max : 0);
    }
  }
  // ──────────────────────────────────────────────────────────────────────

  // ── Capability flags (variants / modifiers / composite) ───────────────
  // Previously each product ran THREE COUNT queries here (one per flag),
  // i.e. 3×N round-trips for a list of N products — the dominant cost for
  // large catalogs. Instead, resolve all three flags for the whole result
  // set in 3 grouped queries and look them up from in-memory Sets.
  const productIds = products.map((p) => p.id);
  const variantFlagSet = new Set<number>();
  const modifierFlagSet = new Set<number>();
  const compositeFlagSet = new Set<number>();
  if (productIds.length > 0) {
    const [variantRows, modifierRows, compositeRows] = await Promise.all([
      db
        .select({ productId: variantGroupsTable.productId })
        .from(variantGroupsTable)
        .where(inArray(variantGroupsTable.productId, productIds))
        .groupBy(variantGroupsTable.productId),
      db
        .select({ productId: modifierGroupsTable.productId })
        .from(modifierGroupsTable)
        .where(inArray(modifierGroupsTable.productId, productIds))
        .groupBy(modifierGroupsTable.productId),
      db
        .select({ parentProductId: compositeProductComponentsTable.parentProductId })
        .from(compositeProductComponentsTable)
        .where(inArray(compositeProductComponentsTable.parentProductId, productIds))
        .groupBy(compositeProductComponentsTable.parentProductId),
    ]);
    for (const r of variantRows) variantFlagSet.add(r.productId);
    for (const r of modifierRows) modifierFlagSet.add(r.productId);
    for (const r of compositeRows) compositeFlagSet.add(r.parentProductId);
  }

  const applyFlags = (p: typeof productsTable.$inferSelect) => ({
    ...p,
    imageUrl: p.imageUrl ?? undefined,
    description: p.description ?? undefined,
    barcode: p.barcode ?? undefined,
    sku: p.sku ?? undefined,
    hasVariants: variantFlagSet.has(p.id),
    hasModifiers: modifierFlagSet.has(p.id),
    isComposite: compositeFlagSet.has(p.id),
  });

  const enriched = products.map((p) => {
      const override = overrideMap.get(p.id);
      const effectivePrice = override?.priceOverride != null ? override.priceOverride : p.price;
      const isComposite = p.structureType === "composite";
      // Combined cross-location total (only meaningful for non-composite when
      // no specific location is requested and stock is actually distributed).
      const locSum = locationSumMap.get(p.id) ?? 0;
      const usingLocSum = !locationId && !isComposite && locSum > 0;
      // Composite stock is derived; the persisted stock_count (and any
      // location_inventory row) for a composite is meaningless.
      const effectiveStockCount = isComposite
        ? compositeStockMap.get(p.id) ?? 0
        : usingLocSum
          ? locSum
          : (locationId && stockMap.has(p.id) ? stockMap.get(p.id)! : p.stockCount);
      // Composites are "in stock" iff at least 1 bundle can be built.
      // Simple products keep the existing per-location override semantics.
      // When showing a combined cross-location total, a positive sum means the
      // product is in stock somewhere — surface it even if a prior sale flipped
      // the global inStock flag to false.
      const effectiveInStock = isComposite
        ? (locationId
            ? (override ? override.isAvailable && effectiveStockCount > 0 : effectiveStockCount > 0)
            : effectiveStockCount > 0)
        : usingLocSum
          ? true
          : (locationId ? (override ? override.isAvailable && p.inStock : p.inStock) : p.inStock);
      return applyFlags({ ...p, price: effectivePrice, inStock: effectiveInStock, stockCount: effectiveStockCount });
    });

  res.json(ListProductsResponse.parse(enriched));
});

router.post("/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Composite parents have no inventory of their own — stock is derived
  // from child components. Force stockCount to 0 regardless of input so
  // POS / reports never see a misleading number on the parent row.
  const isComposite = parsed.data.structureType === "composite";

  // Batch tracking is only valid for simple products in MVP. Variant and
  // composite products are explicitly out of scope (their stock lives in
  // separate tables and the order-flow batch deduction wouldn't fire).
  if (parsed.data.trackBatches && isComposite) {
    res.status(400).json({ error: "Batch tracking is not supported for composite products." });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      category: parsed.data.category,
      imageUrl: parsed.data.imageUrl,
      barcode: parsed.data.barcode,
      sku: parsed.data.sku,
      inStock: parsed.data.inStock ?? true,
      stockCount: isComposite ? 0 : (parsed.data.stockCount ?? 0),
      soldByWeight: parsed.data.soldByWeight ?? false,
      // Default a sensible unit when sold-by-weight is enabled but the
      // caller didn't pick one. Leave NULL when the product is sold by
      // each so weight-only flows can detect "no scale unit configured".
      unitOfMeasure: parsed.data.soldByWeight
        ? (parsed.data.unitOfMeasure ?? "kg")
        : null,
      // Optional free-text selling unit / UOM label. Store trimmed non-empty
      // value or NULL so blank submissions stay "not set".
      sellingUnit: parsed.data.sellingUnit?.trim() ? parsed.data.sellingUnit.trim() : null,
      costPrice: parsed.data.costPrice ?? null,
      structureType: parsed.data.structureType ?? "simple",
      isTaxable: parsed.data.isTaxable ?? true,
      trackBatches: parsed.data.trackBatches ?? false,
      stockMethodOverride: parsed.data.stockMethodOverride ?? null,
    })
    .returning();

  await logAudit({ tenantId, action: "product.create", entityType: "product", entityId: product?.id, details: { name: parsed.data.name, price: parsed.data.price, structureType: product?.structureType } });
  res.status(201).json(GetProductResponse.parse(await withFlags(product)));
});

/* ── Duplicate finder & merge ──────────────────────────────────────────────
 * Helps tenants clean up products entered more than once. Detection groups
 * ACTIVE products by normalized name: identical normalized names form an
 * "exact" group; remaining products that are ≥85% similar (Levenshtein ratio)
 * form "similar" groups flagged for manual review. Merge re-points ALL history
 * (sales, bills, movements, batches, etc.) onto one survivor, sums stock
 * (global + per-location), drops the duplicates' config rows, and archives the
 * duplicates (never hard-deleted). Only simple SKUs may be merged — variant /
 * composite / composite-child products are rejected on both ends.
 * NOTE: these routes are registered BEFORE GET /products/:id so the literal
 * paths are not captured by the :id param. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .replace(/[^\p{L}\p{N}]+/gu, " ") // punctuation / symbols -> space (Unicode-safe, keeps CJK/Cyrillic)
    .replace(/\s+/g, " ")
    .trim();
}

// Order-insensitive key: tokens sorted alphabetically so "coca cola" and
// "cola coca" collapse to the same key.
function tokenKey(normalized: string): string {
  return normalized.split(" ").filter(Boolean).sort().join(" ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.85;

router.get("/products/find-duplicates", async (req, res): Promise<void> => {
  const staffId = parseInt(String(req.query["staffId"] ?? ""), 10);
  if (!Number.isFinite(staffId) || staffId <= 0) { res.status(400).json({ error: "staffId query param required" }); return; }
  const authed = await authoriseInventoryCaller(req, res, staffId);
  if (!authed) return;
  const tenantId = authed.tenantId;

  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), isNull(productsTable.archivedAt)));

  if (products.length === 0) { res.json([]); return; }

  const ids = products.map((p) => p.id);
  const [variantRows, modifierRows, compParentRows, compChildRows] = await Promise.all([
    db.select({ pid: variantGroupsTable.productId }).from(variantGroupsTable).where(inArray(variantGroupsTable.productId, ids)),
    db.select({ pid: modifierGroupsTable.productId }).from(modifierGroupsTable).where(inArray(modifierGroupsTable.productId, ids)),
    db.select({ pid: compositeProductComponentsTable.parentProductId }).from(compositeProductComponentsTable).where(inArray(compositeProductComponentsTable.parentProductId, ids)),
    db.select({ pid: compositeProductComponentsTable.childProductId }).from(compositeProductComponentsTable).where(inArray(compositeProductComponentsTable.childProductId, ids)),
  ]);
  const variantSet = new Set(variantRows.map((r) => r.pid));
  const modifierSet = new Set(modifierRows.map((r) => r.pid));
  const compParentSet = new Set(compParentRows.map((r) => r.pid));
  const compChildSet = new Set(compChildRows.map((r) => r.pid));

  type Row = typeof productsTable.$inferSelect;
  const toDup = (p: Row) => {
    const hasVariants = variantSet.has(p.id);
    const isComposite = compParentSet.has(p.id);
    const isCompositeChild = compChildSet.has(p.id);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      stockCount: p.stockCount,
      barcode: p.barcode ?? null,
      createdAt: p.createdAt,
      hasVariants,
      hasModifiers: modifierSet.has(p.id),
      isComposite,
      isCompositeChild,
      mergeable: !hasVariants && !isComposite && !isCompositeChild,
    };
  };

  // Precompute the order-insensitive token key once per product.
  const keyById = new Map<number, string>();
  for (const p of products) {
    keyById.set(p.id, tokenKey(normalizeName(p.name)));
  }

  // Single union-find across ALL products. The previous implementation excluded
  // members of an exact group from the fuzzy pass, which silently dropped any
  // near-duplicate of an exact pair (e.g. a third "Sprite!" next to two "Sprite").
  const parent = new Map<number, number>();
  for (const p of products) parent.set(p.id, p.id);
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) { const next = parent.get(c)!; parent.set(c, r); c = next; }
    return r;
  };
  const union = (a: number, b: number) => { parent.set(find(a), find(b)); };

  // 1. Exact: identical order-insensitive key (case / punctuation / word order
  //    differences already collapsed by normalizeName + tokenKey).
  const keyBuckets = new Map<string, number[]>();
  for (const p of products) {
    const k = keyById.get(p.id)!;
    if (k === "") continue; // names with no alphanumerics never auto-group
    const arr = keyBuckets.get(k) ?? [];
    arr.push(p.id);
    keyBuckets.set(k, arr);
  }
  for (const bucket of keyBuckets.values()) {
    for (let i = 1; i < bucket.length; i++) union(bucket[0], bucket[i]);
  }

  // 2. Similar: fuzzy match on the order-insensitive key. A cheap length-delta
  //    guard skips pairs that cannot possibly clear the threshold before paying
  //    for Levenshtein (keeps this O(n^2) loop fast on large catalogs).
  const maxLenDelta = 1 - SIMILARITY_THRESHOLD;
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i].id, b = products[j].id;
      if (find(a) === find(b)) continue; // already grouped
      const ka = keyById.get(a)!, kb = keyById.get(b)!;
      const maxLen = Math.max(ka.length, kb.length);
      if (maxLen === 0) continue;
      if (Math.abs(ka.length - kb.length) / maxLen > maxLenDelta) continue;
      if (similarityRatio(ka, kb) >= SIMILARITY_THRESHOLD) union(a, b);
    }
  }

  // Assemble clusters of size >= 2. A group is "exact" only when every member
  // shares the same key; otherwise it is surfaced as "similar" for review.
  const byId = new Map(products.map((p) => [p.id, p]));
  const clusters = new Map<number, number[]>();
  for (const p of products) {
    const root = find(p.id);
    const arr = clusters.get(root) ?? [];
    arr.push(p.id);
    clusters.set(root, arr);
  }
  const groups: Array<{ key: string; matchType: "exact" | "similar"; products: ReturnType<typeof toDup>[] }> = [];
  for (const memberIds of clusters.values()) {
    if (memberIds.length < 2) continue;
    const members = memberIds.map((id) => byId.get(id)!);
    const distinctKeys = new Set(members.map((p) => keyById.get(p.id)!));
    groups.push({
      key: keyById.get(members[0].id)!,
      matchType: distinctKeys.size === 1 ? "exact" : "similar",
      products: members.map(toDup),
    });
  }

  res.json(groups);
});

router.post("/products/merge", async (req, res): Promise<void> => {
  const parsed = MergeProductsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const authed = await authoriseInventoryCaller(req, res, parsed.data.staffId);
  if (!authed) return;
  const tenantId = authed.tenantId;

  const { survivorId } = parsed.data;
  const dupeIds = [...new Set(parsed.data.mergeIds)].filter((id) => id !== survivorId);
  if (dupeIds.length === 0) {
    res.status(400).json({ error: "No products to merge (mergeIds must contain at least one id other than the survivor)" });
    return;
  }

  const allIds = [survivorId, ...dupeIds];

  // Validate every product is tenant-scoped and active.
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, allIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const survivor = byId.get(survivorId);
  if (!survivor) { res.status(404).json({ error: "Survivor product not found" }); return; }
  if (survivor.archivedAt) { res.status(400).json({ error: "Survivor product is archived" }); return; }
  for (const id of dupeIds) {
    const p = byId.get(id);
    if (!p) { res.status(400).json({ error: `Product ${id} not found` }); return; }
    if (p.archivedAt) { res.status(400).json({ error: `Product ${id} is already archived` }); return; }
  }

  // Structural eligibility: only simple SKUs (no variants / not composite parent or child).
  const [variantRows, compParentRows, compChildRows] = await Promise.all([
    db.select({ pid: variantGroupsTable.productId }).from(variantGroupsTable).where(inArray(variantGroupsTable.productId, allIds)),
    db.select({ pid: compositeProductComponentsTable.parentProductId }).from(compositeProductComponentsTable).where(inArray(compositeProductComponentsTable.parentProductId, allIds)),
    db.select({ pid: compositeProductComponentsTable.childProductId }).from(compositeProductComponentsTable).where(inArray(compositeProductComponentsTable.childProductId, allIds)),
  ]);
  const ineligible = new Set<number>([
    ...variantRows.map((r) => r.pid),
    ...compParentRows.map((r) => r.pid),
    ...compChildRows.map((r) => r.pid),
  ]);
  const blocked = allIds.filter((id) => ineligible.has(id));
  if (blocked.length > 0) {
    res.status(400).json({
      error: "MERGE_NOT_SIMPLE",
      message: "Only simple products can be merged. Variant, composite, and composite-component products are not eligible.",
      productIds: blocked,
    });
    return;
  }

  const combinedStock = await db.transaction(async (tx) => {
    // 0. Lock survivor + duplicate rows for the duration of the merge so a
    //    concurrent checkout / stock edit cannot be lost (last-write-wins) and
    //    two merges cannot interleave. We re-read stock from these locked rows.
    const lockedRows = await tx
      .select({ id: productsTable.id, stockCount: productsTable.stockCount })
      .from(productsTable)
      .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, allIds)))
      .for("update");
    const lockedStock = new Map(lockedRows.map((r) => [r.id, r.stockCount]));

    // 1. Re-point all historical references onto the survivor.
    await tx.update(orderItemsTable).set({ productId: survivorId }).where(inArray(orderItemsTable.productId, dupeIds));
    await tx.update(purchaseBillItemsTable).set({ productId: survivorId }).where(inArray(purchaseBillItemsTable.productId, dupeIds));
    await tx.update(purchasesTable).set({ productId: survivorId }).where(inArray(purchasesTable.productId, dupeIds));
    await tx.update(stockMovementsTable).set({ productId: survivorId }).where(inArray(stockMovementsTable.productId, dupeIds));
    await tx.update(supplierReturnItemsTable).set({ productId: survivorId }).where(inArray(supplierReturnItemsTable.productId, dupeIds));
    await tx.update(stockTransfersTable).set({ productId: survivorId }).where(inArray(stockTransfersTable.productId, dupeIds));
    await tx.update(weightLabelsTable).set({ productId: survivorId }).where(inArray(weightLabelsTable.productId, dupeIds));
    await tx.update(stockAdjustmentsTable).set({ productId: survivorId }).where(inArray(stockAdjustmentsTable.productId, dupeIds));
    await tx.update(stockCountItemsTable).set({ productId: survivorId }).where(inArray(stockCountItemsTable.productId, dupeIds));
    await tx.update(productBatchesTable).set({ productId: survivorId }).where(inArray(productBatchesTable.productId, dupeIds));
    await tx.update(productionBatchItemsTable).set({ productId: survivorId }).where(inArray(productionBatchItemsTable.productId, dupeIds));

    // 2. Re-point the duplicates' config rows onto the survivor. Tables with no
    //    uniqueness constraint on product_id are repointed wholesale; recipes
    //    and per-location overrides are unique per product, so we move only what
    //    the survivor lacks and drop the rest to avoid constraint clashes.
    await tx.update(productPricingTiersTable).set({ productId: survivorId }).where(inArray(productPricingTiersTable.productId, dupeIds));
    await tx.update(productPurchaseUnitsTable).set({ productId: survivorId }).where(inArray(productPurchaseUnitsTable.productId, dupeIds));
    await tx.update(promotionsTable).set({ productId: survivorId }).where(inArray(promotionsTable.productId, dupeIds));

    // recipes: unique(product_id, tenant_id). Keep the survivor's recipe if it
    // has one; otherwise promote a single duplicate's recipe. Remaining duplicate
    // recipes are deleted (their ingredients deleted first — no FK cascade assumed).
    const survivorRecipe = await tx.select({ id: recipesTable.id }).from(recipesTable).where(eq(recipesTable.productId, survivorId));
    const dupeRecipes = await tx.select({ id: recipesTable.id }).from(recipesTable).where(inArray(recipesTable.productId, dupeIds));
    let recipeKept: number | null = survivorRecipe[0]?.id ?? null;
    const recipesToDrop: number[] = [];
    for (const r of dupeRecipes) {
      if (recipeKept === null) {
        await tx.update(recipesTable).set({ productId: survivorId }).where(eq(recipesTable.id, r.id));
        recipeKept = r.id;
      } else {
        recipesToDrop.push(r.id);
      }
    }
    if (recipesToDrop.length > 0) {
      await tx.delete(recipeIngredientsTable).where(inArray(recipeIngredientsTable.recipeId, recipesToDrop));
      await tx.delete(recipesTable).where(inArray(recipesTable.id, recipesToDrop));
    }

    // product_locations: unique(product_id, location_id). Move a duplicate's
    // override only where the survivor has none for that location; drop the rest.
    const survivorLocs = await tx.select({ locationId: productLocationsTable.locationId }).from(productLocationsTable).where(eq(productLocationsTable.productId, survivorId));
    const takenLocations = new Set(survivorLocs.map((l) => l.locationId));
    const dupeLocs = await tx.select({ id: productLocationsTable.id, locationId: productLocationsTable.locationId }).from(productLocationsTable).where(inArray(productLocationsTable.productId, dupeIds));
    const locsToDrop: number[] = [];
    for (const l of dupeLocs) {
      if (takenLocations.has(l.locationId)) {
        locsToDrop.push(l.id);
      } else {
        await tx.update(productLocationsTable).set({ productId: survivorId }).where(eq(productLocationsTable.id, l.id));
        takenLocations.add(l.locationId);
      }
    }
    if (locsToDrop.length > 0) {
      await tx.delete(productLocationsTable).where(inArray(productLocationsTable.id, locsToDrop));
    }

    // 2b. Best-effort: re-point product ids embedded in parked/held order payloads
    //     (held_orders.items is a JSONB array of { productId, ... }).
    const dupeSet = new Set(dupeIds);
    const heldOrders = await tx.select({ id: heldOrdersTable.id, items: heldOrdersTable.items }).from(heldOrdersTable).where(eq(heldOrdersTable.tenantId, tenantId));
    for (const ho of heldOrders) {
      const items = ho.items;
      if (!Array.isArray(items)) continue;
      let changed = false;
      const next = items.map((it) => {
        if (dupeSet.has(it.productId)) {
          changed = true;
          return { ...it, productId: survivorId };
        }
        return it;
      });
      if (changed) {
        await tx.update(heldOrdersTable).set({ items: next }).where(eq(heldOrdersTable.id, ho.id));
      }
    }

    // 3. Combine per-location inventory into the survivor (insert-or-add),
    //    then remove the duplicates' rows.
    await tx.execute(sql`
      INSERT INTO location_inventory (location_id, product_id, stock_count, updated_at)
      SELECT location_id, ${survivorId}, SUM(stock_count), now()
      FROM location_inventory
      WHERE product_id IN (${sql.join(dupeIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY location_id
      ON CONFLICT (location_id, product_id)
      DO UPDATE SET stock_count = location_inventory.stock_count + EXCLUDED.stock_count, updated_at = now()
    `);
    await tx.delete(locationInventoryTable).where(inArray(locationInventoryTable.productId, dupeIds));

    // 4. Sum global stock into the survivor, using the locked stock values
    //    re-read inside this transaction (not the pre-transaction snapshot).
    const newStock = allIds.reduce((s, id) => s + (lockedStock.get(id) ?? 0), 0);
    await tx.update(productsTable).set({ stockCount: newStock }).where(eq(productsTable.id, survivorId));

    // 5. Archive the duplicates (soft delete — history is preserved).
    await tx.update(productsTable)
      .set({ archivedAt: new Date() })
      .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, dupeIds)));

    return newStock;
  });

  await logAudit({
    tenantId,
    action: "product.merge",
    entityType: "product",
    entityId: survivorId,
    details: { survivorId, mergedIds: dupeIds, combinedStock },
  });

  res.json({ survivorId, mergedCount: dupeIds.length, combinedStock });
});

// Distinct categories actually used by this tenant's products (including
// archived, so nothing the catalog references is ever hidden). Callers union
// this with the curated `product_categories` setting so imported categories
// surface everywhere without a manual sync. Must stay registered before the
// `/products/:id` route so "categories" is not parsed as an :id.
router.get("/products/categories", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), isNotNull(productsTable.category)));

  const categories = rows
    .map((r) => (r.category ?? "").trim())
    .filter((c) => c.length > 0)
    .sort((a, b) => a.localeCompare(b));

  res.json(categories);
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(GetProductResponse.parse(await withFlags(product)));
});

router.put("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Build the update set so undefined fields don't overwrite existing
  // columns with NULL. soldByWeight + unitOfMeasure are always paired:
  // if the caller explicitly toggles soldByWeight off, also clear the
  // unit so the DB reflects "this product is no longer weighed".
  const updates: Record<string, unknown> = {
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    category: parsed.data.category,
    imageUrl: parsed.data.imageUrl,
    barcode: parsed.data.barcode,
    sku: parsed.data.sku,
    inStock: parsed.data.inStock,
    stockCount: parsed.data.stockCount,
  };
  if (parsed.data.soldByWeight !== undefined) {
    updates["soldByWeight"] = parsed.data.soldByWeight;
    if (parsed.data.soldByWeight) {
      updates["unitOfMeasure"] = parsed.data.unitOfMeasure ?? "kg";
    } else {
      updates["unitOfMeasure"] = null;
    }
  } else if (parsed.data.unitOfMeasure !== undefined) {
    updates["unitOfMeasure"] = parsed.data.unitOfMeasure;
  }
  // Optional selling unit / UOM label. Only write when present in the body;
  // a trimmed empty string (or explicit null) clears it back to NULL.
  if (parsed.data.sellingUnit !== undefined) {
    const su = parsed.data.sellingUnit?.trim();
    updates["sellingUnit"] = su ? su : null;
  }

  // Cost basis & structure type. costPrice null is meaningful ("not yet
  // costed"), so we only write when explicitly provided in the body.
  if (parsed.data.costPrice !== undefined) {
    updates["costPrice"] = parsed.data.costPrice;
  }
  if (parsed.data.isTaxable !== undefined) {
    updates["isTaxable"] = parsed.data.isTaxable;
  }
  if (parsed.data.trackBatches !== undefined) {
    if (parsed.data.trackBatches === true) {
      // Reject batch tracking on composite or variant-tracked products
      // (MVP scope). Look up current row + variant presence.
      const [cur] = await db.select({ structureType: productsTable.structureType })
        .from(productsTable)
        .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));
      const targetStruct = parsed.data.structureType ?? cur?.structureType;
      if (targetStruct === "composite") {
        res.status(400).json({ error: "Batch tracking is not supported for composite products." });
        return;
      }
      const [variantGroup] = await db.select({ id: variantGroupsTable.id })
        .from(variantGroupsTable)
        .where(eq(variantGroupsTable.productId, params.data.id))
        .limit(1);
      if (variantGroup) {
        res.status(400).json({ error: "Batch tracking is not supported for products with variants." });
        return;
      }
    }
    updates["trackBatches"] = parsed.data.trackBatches;
  }
  if (parsed.data.stockMethodOverride !== undefined) {
    updates["stockMethodOverride"] = parsed.data.stockMethodOverride;
  }
  if (parsed.data.structureType !== undefined) {
    updates["structureType"] = parsed.data.structureType;
    // Switching a product to composite means its parent stock is no
    // longer authoritative — wipe it so reports / POS show 0 instead of
    // a stale number that nothing increments. Available count comes
    // from /products/:id/available-composite-quantity at sale time.
    if (parsed.data.structureType === "composite") {
      updates["stockCount"] = 0;
    }
  }

  // Fetch the prior row so we can detect "trackBatches just toggled on"
  // and backfill a single legacy batch with the existing stockCount.
  const [prior] = await db
    .select({ trackBatches: productsTable.trackBatches, stockCount: productsTable.stockCount })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)));

  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Backfill: toggling trackBatches on means existing stock has no batch
  // history. Create one "legacy" batch (no expiry, no batch number) for
  // the current stockCount so SUM(batches) == product.stockCount.
  if (
    parsed.data.trackBatches === true
    && prior?.trackBatches === false
    && (prior.stockCount ?? 0) > 0
  ) {
    const { productBatchesTable } = await import("@workspace/db");
    await db.insert(productBatchesTable).values({
      tenantId,
      productId: product.id,
      quantityRemaining: prior.stockCount,
      sourceType: "legacy",
      notes: "Auto-created on enabling batch tracking",
    });
  }

  await logAudit({ tenantId, action: "product.update", entityType: "product", entityId: product.id, details: { name: product.name, price: product.price } });
  res.json(UpdateProductResponse.parse(await withFlags(product)));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteProductParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Soft delete (archive): we never hard-delete a product because its
  // historical records (order_items, purchase_bill_items, accounting links)
  // must be preserved for audit/reporting. Archiving hides it from the
  // catalog/POS/menu while keeping all history. Restorable via bulk-restore.
  const [product] = await db
    .update(productsTable)
    .set({ archivedAt: new Date() })
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  await logAudit({ tenantId, action: "product.archive", entityType: "product", entityId: product.id, details: { name: product.name } });
  res.sendStatus(204);
});

/* ── Bulk archive / restore (soft delete) ──────────────────────────────────
 * Bulk delete preserves history by archiving rather than hard-deleting.
 * Both endpoints are tenant-scoped and idempotent. */
router.post("/products/bulk-archive", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = BulkArchiveProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .update(productsTable)
    .set({ archivedAt: new Date() })
    .where(and(
      eq(productsTable.tenantId, tenantId),
      inArray(productsTable.id, parsed.data.ids),
      isNull(productsTable.archivedAt),
    ))
    .returning({ id: productsTable.id });

  if (rows.length > 0) {
    await logAudit({ tenantId, action: "product.bulk_archive", entityType: "product", entityId: 0, details: { ids: rows.map((r) => r.id) } });
  }
  res.json({ count: rows.length });
});

router.post("/products/bulk-restore", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = BulkRestoreProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .update(productsTable)
    .set({ archivedAt: null })
    .where(and(
      eq(productsTable.tenantId, tenantId),
      inArray(productsTable.id, parsed.data.ids),
      isNotNull(productsTable.archivedAt),
    ))
    .returning({ id: productsTable.id });

  if (rows.length > 0) {
    await logAudit({ tenantId, action: "product.bulk_restore", entityType: "product", entityId: 0, details: { ids: rows.map((r) => r.id) } });
  }
  res.json({ count: rows.length });
});

/* ── Product location availability & pricing ── */

router.get("/products/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [locations, overrides, inventoryRows] = await Promise.all([
    db.select().from(locationsTable)
      .where(and(eq(locationsTable.tenantId, tenantId), eq(locationsTable.isActive, true)))
      .orderBy(locationsTable.name),
    db.select().from(productLocationsTable).where(eq(productLocationsTable.productId, productId)),
    db.select({ locationId: locationInventoryTable.locationId, stockCount: locationInventoryTable.stockCount })
      .from(locationInventoryTable)
      .where(eq(locationInventoryTable.productId, productId)),
  ]);

  const invMap = new Map(inventoryRows.map((r) => [r.locationId, r.stockCount]));

  const result = locations.map((loc) => {
    const override = overrides.find((o) => o.locationId === loc.id);
    return {
      locationId: loc.id,
      locationName: loc.name,
      isAvailable: override ? override.isAvailable : true,
      priceOverride: override?.priceOverride ?? null,
      stockCount: invMap.get(loc.id) ?? null,
    };
  });

  res.json(result);
});

router.put("/products/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const { locations } = req.body as {
    locations: Array<{ locationId: number; isAvailable: boolean; priceOverride: number | null }>;
  };

  if (!Array.isArray(locations)) { res.status(400).json({ error: "locations must be an array" }); return; }

  for (const loc of locations) {
    await db
      .insert(productLocationsTable)
      .values({
        productId,
        locationId: loc.locationId,
        isAvailable: loc.isAvailable,
        priceOverride: loc.priceOverride ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [productLocationsTable.productId, productLocationsTable.locationId],
        set: {
          isAvailable: loc.isAvailable,
          priceOverride: loc.priceOverride ?? null,
          updatedAt: new Date(),
        },
      });
  }

  res.json({ success: true, updated: locations.length });
});

/* ── Stock History ── */

router.get("/products/:id/stock-history", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ id: productsTable.id, name: productsTable.name, barcode: productsTable.barcode, stockCount: productsTable.stockCount })
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const limit = Math.min(parseInt((req.query.limit as string) ?? "500", 10) || 500, 2000);

  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;

  const conditions: SQL[] = [
    eq(stockMovementsTable.productId, productId),
    eq(stockMovementsTable.tenantId, tenantId),
  ];
  if (fromStr) {
    const fromDate = new Date(fromStr);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(stockMovementsTable.createdAt, fromDate));
  }
  if (toStr) {
    const toDate = new Date(toStr);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovementsTable.createdAt, toDate));
    }
  }

  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(and(...conditions))
    .orderBy(asc(stockMovementsTable.createdAt))
    .limit(limit);

  res.json({
    product: { id: product.id, name: product.name, sku: product.barcode, currentStock: product.stockCount },
    movements,
  });
});

export default router;
