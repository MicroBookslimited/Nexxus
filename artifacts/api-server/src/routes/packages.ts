import { Router, type IRouter } from "express";
import { and, eq, desc, or, ilike, sql } from "drizzle-orm";
import { db, packagesTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

const router: IRouter = Router();

// Drizzle wraps pg errors, so the unique-violation code may be on `cause`.
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Validation ─── */

const ReceivePackageBody = z.object({
  trackingNumber: z.string().trim().min(1).max(200),
  awb: z.string().trim().max(200).optional(),
  purchaseTrackingNumber: z.string().trim().max(200).optional(),
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(50).optional(),
  courier: z.string().trim().max(200).optional(),
  weight: z.number().nonnegative().finite().optional(),
  weightUnit: z.enum(["lb", "kg"]).optional(),
  shelfLocation: z.string().trim().max(100).optional(),
  fee: z.number().nonnegative().finite(),
  notes: z.string().max(2000).optional(),
  staffId: z.number().int().positive().optional(),
  staffName: z.string().max(200).optional(),
});

const UpdatePackageBody = ReceivePackageBody.partial();

const CollectPackageBody = z.object({
  orderId: z.number().int().positive().optional(),
  staffId: z.number().int().positive().optional(),
  staffName: z.string().max(200).optional(),
});

/* ─── Barcode normalization ───
 * The same parcel can yield different scan strings depending on which barcode
 * is scanned (e.g. USPS IMpb barcodes prepend routing digits "420" + ZIP to the
 * tracking number, while the human-readable number omits them). We match on
 * normalized values: lowercase, alphanumerics only, and treat codes as equal
 * when one is a suffix of the other (min 10 chars to avoid false hits). */
function normalizeCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** SQL: normalized column value (lowercase, alphanumerics only). */
function normCol(col: unknown) {
  return sql`regexp_replace(lower(${col}), '[^a-z0-9]', '', 'g')`;
}

/** Match a scanned code against a tracking-ish column, tolerant of routing prefixes. */
function codeMatches(col: unknown, q: string) {
  const conds = [sql`${normCol(col)} = ${q}`];
  if (q.length >= 10) {
    // scanned code carries a routing prefix (e.g. 420+ZIP) before the stored number
    conds.push(sql`length(${normCol(col)}) >= 10 AND ${q} LIKE '%' || ${normCol(col)}`);
    // stored value carries the prefix and the bare number was scanned
    conds.push(sql`${normCol(col)} LIKE '%' || ${q}`);
  }
  return or(...conds)!;
}

/* ─── Routes ─── */

// List packages (newest first). Optional ?status= and ?search= filters.
router.get("/packages", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const conds = [eq(packagesTable.tenantId, tenantId)];
  if (status && status !== "all") conds.push(eq(packagesTable.status, status));
  if (search) {
    const pat = `%${search}%`;
    const q = normalizeCode(search);
    const searchConds = [
      ilike(packagesTable.trackingNumber, pat),
      ilike(packagesTable.awb, pat),
      ilike(packagesTable.purchaseTrackingNumber, pat),
      ilike(packagesTable.customerName, pat),
      ilike(packagesTable.customerPhone, pat),
      ilike(packagesTable.courier, pat),
    ];
    if (q) {
      searchConds.push(
        codeMatches(packagesTable.trackingNumber, q),
        codeMatches(packagesTable.awb, q),
        codeMatches(packagesTable.purchaseTrackingNumber, q),
      );
    }
    conds.push(or(...searchConds)!);
  }

  const rows = await db
    .select()
    .from(packagesTable)
    .where(and(...conds))
    .orderBy(desc(packagesTable.receivedAt))
    .limit(500);
  res.json(rows);
});

// Lookup by tracking number (POS scan-out path). Matches Tracking Number, AWB,
// or Purchase Tracking Number (case-insensitive) so any barcode on the parcel works.
router.get("/packages/lookup/:tracking", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const tracking = String(req.params.tracking ?? "").trim();
  if (!tracking) { res.status(400).json({ error: "Missing tracking number" }); return; }

  const [pkg] = await db
    .select()
    .from(packagesTable)
    .where(and(
      eq(packagesTable.tenantId, tenantId),
      or(
        codeMatches(packagesTable.trackingNumber, normalizeCode(tracking)),
        codeMatches(packagesTable.awb, normalizeCode(tracking)),
        codeMatches(packagesTable.purchaseTrackingNumber, normalizeCode(tracking)),
      )!,
    ))
    // Duplicates exist (re-received parcels, shared AWBs): prefer the row the
    // cashier can actually collect, then the newest, so a stray collected or
    // cancelled twin never shadows a received package at scan-out.
    .orderBy(
      sql`CASE WHEN ${packagesTable.status} = 'received' THEN 0 ELSE 1 END`,
      desc(packagesTable.receivedAt),
    )
    .limit(1);
  if (!pkg) { res.status(404).json({ error: "Package not found" }); return; }
  res.json(pkg);
});

// Receive (scan in) a package.
router.post("/packages", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ReceivePackageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  try {
    const [created] = await db
      .insert(packagesTable)
      .values({
        tenantId,
        trackingNumber: b.trackingNumber,
        awb: b.awb || null,
        purchaseTrackingNumber: b.purchaseTrackingNumber || null,
        customerName: b.customerName || null,
        customerPhone: b.customerPhone || null,
        courier: b.courier || null,
        weight: b.weight ?? null,
        weightUnit: b.weightUnit ?? "lb",
        shelfLocation: b.shelfLocation || null,
        fee: b.fee,
        notes: b.notes || null,
        status: "received",
        receivedByStaffId: b.staffId ?? null,
        receivedByStaffName: b.staffName ?? null,
      })
      .returning();
    res.status(201).json(created);
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "A package with this tracking number already exists" });
      return;
    }
    throw e;
  }
});

// Edit a package's details (only while it is still in the store).
router.patch("/packages/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdatePackageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  const [existing] = await db
    .select()
    .from(packagesTable)
    .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Package not found" }); return; }
  if (existing.status !== "received") { res.status(400).json({ error: "Only packages still in the store can be edited" }); return; }

  try {
    const [updated] = await db
      .update(packagesTable)
      .set({
        ...(b.trackingNumber !== undefined ? { trackingNumber: b.trackingNumber } : {}),
        ...(b.awb !== undefined ? { awb: b.awb || null } : {}),
        ...(b.purchaseTrackingNumber !== undefined ? { purchaseTrackingNumber: b.purchaseTrackingNumber || null } : {}),
        ...(b.customerName !== undefined ? { customerName: b.customerName || null } : {}),
        ...(b.customerPhone !== undefined ? { customerPhone: b.customerPhone || null } : {}),
        ...(b.courier !== undefined ? { courier: b.courier || null } : {}),
        ...(b.weight !== undefined ? { weight: b.weight } : {}),
        ...(b.weightUnit !== undefined ? { weightUnit: b.weightUnit } : {}),
        ...(b.shelfLocation !== undefined ? { shelfLocation: b.shelfLocation || null } : {}),
        ...(b.fee !== undefined ? { fee: b.fee } : {}),
        ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "A package with this tracking number already exists" });
      return;
    }
    throw e;
  }
});

// Cancel a received package (e.g. returned to sender). Not allowed once collected.
router.post("/packages/:id/cancel", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const result = await db.transaction(async (tx) => {
    const [pkg] = await tx
      .select()
      .from(packagesTable)
      .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!pkg) return { error: 404 as const };
    if (pkg.status !== "received") return { error: 400 as const };
    const [updated] = await tx
      .update(packagesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(packagesTable.id, pkg.id))
      .returning();
    return { updated };
  });
  if ("error" in result) {
    const status: number = result.error ?? 500;
    res.status(status).json({ error: status === 404 ? "Package not found" : "Only received packages can be cancelled" });
    return;
  }
  res.json(result.updated);
});

// Collect (scan out) a package — one-time only, race-safe via row lock.
router.post("/packages/:id/collect", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CollectPackageBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [pkg] = await tx
      .select()
      .from(packagesTable)
      .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!pkg) return { error: 404 as const, message: "Package not found" };
    if (pkg.status === "collected") return { error: 409 as const, message: "This package has already been collected" };
    if (pkg.status !== "received") return { error: 400 as const, message: "Only received packages can be collected" };
    const [updated] = await tx
      .update(packagesTable)
      .set({
        status: "collected",
        collectedAt: new Date(),
        collectedByStaffId: b.staffId ?? null,
        collectedByStaffName: b.staffName ?? null,
        collectedOrderId: b.orderId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(packagesTable.id, pkg.id))
      .returning();
    return { updated };
  });
  if ("error" in result) {
    const status: number = result.error ?? 500;
    res.status(status).json({ error: result.message });
    return;
  }
  res.json(result.updated);
});

export default router;
