import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, eq, asc, isNotNull, desc, inArray, sql } from "drizzle-orm";
import { db, productsTable, weightLabelsTable, staffTable, rolesTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { logAudit } from "./audit";

const router: IRouter = Router();

/* ─── Auth helpers ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/**
 * Verifies the request carries an active staff member (via x-staff-id header,
 * the same convention used by cash sessions and other PIN-gated endpoints) AND
 * that the staff member's role grants the `scale.use` permission.
 *
 * This enforces the PermissionGate → PinPad → server-check chain server-side,
 * so a tenant-token holder cannot bypass the UI to create/void/print labels.
 */
async function requireScaleStaff(
  req: { headers: Record<string, string | string[] | undefined> },
  tenantId: number,
): Promise<{ staffId: number; staffName: string } | null> {
  const raw = req.headers["x-staff-id"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const staffId = header ? parseInt(header, 10) : NaN;
  if (!staffId || isNaN(staffId)) return null;

  const [staff] = await db.select().from(staffTable).where(and(
    eq(staffTable.id, staffId),
    eq(staffTable.tenantId, tenantId),
    eq(staffTable.isActive, true),
  ));
  if (!staff) return null;

  const [role] = await db.select({ permissions: rolesTable.permissions }).from(rolesTable)
    .where(and(eq(rolesTable.tenantId, tenantId), sql`LOWER(${rolesTable.name}) = LOWER(${staff.role})`));
  const permissions: string[] = role ? (role.permissions as string[]) : [];
  if (!permissions.includes("scale.use")) return null;

  return { staffId: staff.id, staffName: staff.name };
}

/* ─── EAN-13 check digit ─── */
function ean13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(twelveDigits[i] ?? "0", 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Build a weight-embedded EAN-13 barcode.
 * Layout: '2' + plu(6 digits) + grams(5 digits, 0-99999) + check(1)
 */
function buildWeightBarcode(plu: string, grams: number): string {
  const safePlu = plu.replace(/\D/g, "").padStart(6, "0").slice(-6);
  const clamped = Math.max(0, Math.min(99999, Math.round(grams)));
  const gramsStr = String(clamped).padStart(5, "0");
  const body = `2${safePlu}${gramsStr}`;
  return body + ean13CheckDigit(body);
}

function parseWeightBarcode(barcode: string): { plu: string; grams: number } | null {
  if (!/^\d{13}$/.test(barcode)) return null;
  if (barcode[0] !== "2") return null;
  const expected = ean13CheckDigit(barcode.slice(0, 12));
  if (expected !== parseInt(barcode[12] ?? "0", 10)) return null;
  return {
    plu: barcode.slice(1, 7),
    grams: parseInt(barcode.slice(7, 12), 10),
  };
}

/* ── Convert any unit-of-measure quantity to grams (for the embedded barcode). ── */
function toGrams(weight: number, unit: string): number {
  switch (unit) {
    case "g":  return weight;
    case "kg": return weight * 1000;
    case "oz": return weight * 28.3495;
    case "lb": return weight * 453.592;
    default:   return weight * 1000; // assume kg
  }
}

/* ─── PLU allocation (per tenant, simple 6-digit derived from product id) ─── */
async function ensurePlu(tenantId: number, productId: number): Promise<string> {
  const [p] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!p) throw new Error("Product not found");
  if (p.plu && /^\d{6}$/.test(p.plu)) return p.plu;
  const plu = String(100000 + (productId % 900000)).padStart(6, "0");
  await db.update(productsTable).set({ plu }).where(eq(productsTable.id, productId));
  return plu;
}

/* ──────────────────────────────────────────────────────────────
   GET /api/scale/products
   List all products, with weight-related fields exposed.
   Optional ?weightOnly=1 to filter to sold-by-weight only.
   ────────────────────────────────────────────────────────────── */
router.get("/scale/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      category: productsTable.category,
      price: productsTable.price,
      barcode: productsTable.barcode,
      soldByWeight: productsTable.soldByWeight,
      unitOfMeasure: productsTable.unitOfMeasure,
      plu: productsTable.plu,
    })
    .from(productsTable)
    .where(eq(productsTable.tenantId, tenantId))
    .orderBy(asc(productsTable.name));

  const weightOnly = req.query["weightOnly"] === "1";
  res.json(weightOnly ? rows.filter((r) => r.soldByWeight) : rows);
});

/* ──────────────────────────────────────────────────────────────
   PATCH /api/scale/products/:id  — update weight settings
   Body: { soldByWeight: bool, unitOfMeasure?: 'lb'|'kg'|'oz'|'g' }
   ────────────────────────────────────────────────────────────── */
const WeightSettingsBody = z.object({
  soldByWeight: z.boolean(),
  unitOfMeasure: z.enum(["lb", "kg", "oz", "g"]).optional(),
});

router.patch("/scale/products/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const actor = await requireScaleStaff(req as never, tenantId);
  if (!actor) { res.status(403).json({ error: "Scale permission required" }); return; }

  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = WeightSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

  const [existing] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const updates: Record<string, unknown> = { soldByWeight: parsed.data.soldByWeight };
  if (parsed.data.soldByWeight) {
    updates["unitOfMeasure"] = parsed.data.unitOfMeasure ?? existing.unitOfMeasure ?? "lb";
    if (!existing.plu || !/^\d{6}$/.test(existing.plu)) {
      updates["plu"] = String(100000 + (id % 900000)).padStart(6, "0");
    }
  }

  const [updated] = await db.update(productsTable).set(updates)
    .where(eq(productsTable.id, id)).returning();

  await logAudit({ tenantId, action: "scale.product.update", entityType: "product", entityId: id,
    details: { soldByWeight: parsed.data.soldByWeight, unitOfMeasure: updates["unitOfMeasure"] } });

  res.json(updated);
});

/* ──────────────────────────────────────────────────────────────
   POST /api/scale/labels  — create a printable weight label
   Body: { productId, weightValue, packDate?, expirationDate?, staffId? }
   ────────────────────────────────────────────────────────────── */
const CreateLabelBody = z.object({
  productId: z.number().int().positive(),
  weightValue: z.number().positive().max(9999),
  packDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  staffId: z.number().int().positive().optional(),
});

router.post("/scale/labels", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const actor = await requireScaleStaff(req as never, tenantId);
  if (!actor) { res.status(403).json({ error: "Scale permission required" }); return; }

  const parsed = CreateLabelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, parsed.data.productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (!product.soldByWeight) { res.status(400).json({ error: "Product is not configured to be sold by weight" }); return; }

  const unit = product.unitOfMeasure ?? "lb";
  const plu = await ensurePlu(tenantId, product.id);

  const totalPrice = Math.round(product.price * parsed.data.weightValue * 100) / 100;
  const grams = toGrams(parsed.data.weightValue, unit);
  const barcode = buildWeightBarcode(plu, grams);

  // The acting staff member (verified via requireScaleStaff) is always recorded
  // as the label creator, ignoring any client-supplied staffId.
  const labelStaffId: number = actor.staffId;
  const staffName: string = actor.staffName;

  const [label] = await db.insert(weightLabelsTable).values({
    tenantId,
    productId: product.id,
    productName: product.name,
    productPlu: plu,
    unitOfMeasure: unit,
    weightValue: parsed.data.weightValue,
    pricePerUnit: product.price,
    totalPrice,
    packDate: parsed.data.packDate ?? null,
    expirationDate: parsed.data.expirationDate ?? null,
    barcode,
    status: "available",
    createdByStaffId: labelStaffId,
    createdByStaffName: staffName,
  }).returning();

  await logAudit({ tenantId, action: "scale.label.create", entityType: "weight_label", entityId: label.id,
    details: { product: product.name, weight: parsed.data.weightValue, unit, total: totalPrice, barcode } });

  res.status(201).json(label);
});

/* ──────────────────────────────────────────────────────────────
   GET /api/scale/labels  — list available labels (live inventory)
   ────────────────────────────────────────────────────────────── */
router.get("/scale/labels", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = (req.query["status"] as string) ?? "available";
  const rows = await db.select().from(weightLabelsTable)
    .where(and(eq(weightLabelsTable.tenantId, tenantId), eq(weightLabelsTable.status, status)))
    .orderBy(desc(weightLabelsTable.createdAt))
    .limit(500);

  res.json(rows);
});

/* ──────────────────────────────────────────────────────────────
   GET /api/scale/labels/lookup/:barcode
   POS calls this when it scans a 13-digit barcode starting with '2'.
   Returns the OLDEST AVAILABLE label matching the barcode.
   ────────────────────────────────────────────────────────────── */
router.get("/scale/labels/lookup/:barcode", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const barcode = String(req.params["barcode"] ?? "");
  const decoded = parseWeightBarcode(barcode);
  if (!decoded) { res.status(400).json({ error: "Not a valid weight-embedded barcode" }); return; }

  /*
   * Atomic reservation: flip the OLDEST available row with this barcode to
   * 'reserved' in a single conditional update. This prevents two terminals
   * from selling the same physical label — the second scan finds nothing
   * available and either falls through to the derived path or 404s.
   *
   * Postgres doesn't support `ORDER BY` directly inside `UPDATE`, so we use a
   * scalar sub-select to pick the oldest available id, then update by id with
   * a status guard so a concurrent update still loses the race cleanly.
   */
  const oldestId = sql<number | null>`(
    SELECT id FROM ${weightLabelsTable}
    WHERE ${weightLabelsTable.tenantId} = ${tenantId}
      AND ${weightLabelsTable.barcode} = ${barcode}
      AND ${weightLabelsTable.status} = 'available'
    ORDER BY ${weightLabelsTable.createdAt} ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )`;

  const [label] = await db.update(weightLabelsTable)
    .set({ status: "reserved" })
    .where(and(
      eq(weightLabelsTable.tenantId, tenantId),
      eq(weightLabelsTable.status, "available"),
      sql`${weightLabelsTable.id} = ${oldestId}`,
    ))
    .returning();

  if (label) { res.json({ label, source: "label" }); return; }

  /*
   * If ANY row exists for this barcode (reserved/sold/voided), suppress the
   * derived fallback — otherwise a second concurrent scan that lost the
   * reservation race could still ring the same physical label up via the
   * derived path. Derived is only valid when the barcode has no history at
   * all (e.g. legacy in-store stickers from before tracking was enabled).
   */
  const [existing] = await db.select({ id: weightLabelsTable.id }).from(weightLabelsTable)
    .where(and(
      eq(weightLabelsTable.tenantId, tenantId),
      eq(weightLabelsTable.barcode, barcode),
    ))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "This label has already been used or is currently reserved" });
    return;
  }

  /*
   * Fallback: derive from PLU + embedded grams (in case the label row was
   * lost or never created — e.g. legacy in-store stickers). Returned with
   * `id: null` so the POS scanner knows it cannot mark/release this label,
   * but can still ring up the sale at the price embedded in the barcode.
   */
  const [product] = await db.select().from(productsTable)
    .where(and(
      eq(productsTable.tenantId, tenantId),
      eq(productsTable.plu, decoded.plu),
      isNotNull(productsTable.plu),
    ));
  if (!product) { res.status(404).json({ error: "No matching product found for this barcode" }); return; }

  const unit = product.unitOfMeasure ?? "lb";
  const weightValue = decoded.grams / (unit === "g" ? 1 : unit === "kg" ? 1000 : unit === "oz" ? 28.3495 : 453.592);
  const totalPrice = Math.round(product.price * weightValue * 100) / 100;

  res.json({
    source: "derived",
    label: {
      id: null,
      productId: product.id,
      productName: product.name,
      productPlu: product.plu,
      unitOfMeasure: unit,
      weightValue,
      pricePerUnit: product.price,
      totalPrice,
      barcode,
      status: "available",
    },
  });
});

/* ──────────────────────────────────────────────────────────────
   POST /api/scale/labels/release
   Returns one or more reserved labels back to 'available'. Called by the
   POS when a cart item is removed or the order ultimately fails after
   the label has already been atomically reserved by /lookup.
   ────────────────────────────────────────────────────────────── */
const ReleaseBody = z.object({
  labelIds: z.array(z.number().int().positive()).min(1),
});

router.post("/scale/labels/release", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ReleaseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const released = await db.update(weightLabelsTable)
    .set({ status: "available" })
    .where(and(
      eq(weightLabelsTable.tenantId, tenantId),
      eq(weightLabelsTable.status, "reserved"),
      inArray(weightLabelsTable.id, parsed.data.labelIds),
    ))
    .returning({ id: weightLabelsTable.id });

  res.json({ released: released.length });
});

/* ──────────────────────────────────────────────────────────────
   POST /api/scale/labels/mark-sold
   Called by POS after an order is created.
   Body: { labelIds: number[], orderId?: number }
   ────────────────────────────────────────────────────────────── */
const MarkSoldBody = z.object({
  labelIds: z.array(z.number().int().positive()).min(1),
  orderId: z.number().int().positive().optional(),
});

router.post("/scale/labels/mark-sold", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = MarkSoldBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  /*
   * Accept either 'reserved' (the normal path: lookup atomically reserved
   * the label, now we finalise it) or 'available' (legacy/safety path for
   * labels that were added without going through the new lookup flow).
   * Anything already 'sold' / 'voided' is ignored, preserving idempotency.
   */
  const rows = await db.update(weightLabelsTable)
    .set({ status: "sold", soldAt: new Date(), soldOrderId: parsed.data.orderId ?? null })
    .where(and(
      eq(weightLabelsTable.tenantId, tenantId),
      inArray(weightLabelsTable.id, parsed.data.labelIds),
      inArray(weightLabelsTable.status, ["reserved", "available"]),
    ))
    .returning({ id: weightLabelsTable.id });
  res.json({ updated: rows.length });
});

/* ──────────────────────────────────────────────────────────────
   DELETE /api/scale/labels/:id  — voids an unsold label
   ────────────────────────────────────────────────────────────── */
router.delete("/scale/labels/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const actor = await requireScaleStaff(req as never, tenantId);
  if (!actor) { res.status(403).json({ error: "Scale permission required" }); return; }

  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.update(weightLabelsTable)
    .set({ status: "voided" })
    .where(and(
      eq(weightLabelsTable.id, id),
      eq(weightLabelsTable.tenantId, tenantId),
      eq(weightLabelsTable.status, "available"),
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Label not found or not voidable" }); return; }
  await logAudit({ tenantId, action: "scale.label.void", entityType: "weight_label", entityId: id, details: { barcode: row.barcode } });
  res.json({ success: true });
});

export default router;
