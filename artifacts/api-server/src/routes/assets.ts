import { Router, type IRouter } from "express";
import { and, eq, desc, or, ilike, inArray, sql, lte, ne } from "drizzle-orm";
import {
  db, fixedAssetsTable, assetAssignmentsTable, assetServiceRecordsTable,
  technicianTeamsTable, staffTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import {
  computeDepreciation, lockAsset, claimAssetCustody, releaseAssetCustody, nextAssetTag,
  outstandingToolLines,
} from "../lib/asset-custody";

/**
 * Fixed asset register.
 *
 * Assets marked `isTool` flow into the FSM tools catalog and can be given to a
 * technician or a whole team; custody lives in `asset_assignments` (see
 * lib/asset-custody.ts). Depreciation is straight-line and computed on read —
 * nothing is posted to the ledger.
 */

const router: IRouter = Router();

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

/** Actor for audit trails — the POS sends the signed-in staff member's id. */
async function getActor(req: { headers: Record<string, string | undefined> }, tenantId: number) {
  const raw = req.headers["x-staff-id"];
  const id = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(id)) return null;
  const [s] = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
    .from(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.tenantId, tenantId)));
  return s ?? null;
}

/* ─── Validation ─── */

const CONDITIONS = ["good", "fair", "needs_repair", "out_of_service"] as const;
const STATUSES = ["in_store", "assigned", "in_repair", "retired", "lost"] as const;

/** Accepts an ISO date string, "" or null (both meaning "clear it"). */
const dateField = z.union([z.string(), z.null()]).optional();
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const AssetBody = z.object({
  assetTag: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  isTool: z.boolean().optional(),
  serialNumber: z.string().trim().max(200).nullable().optional(),
  manufacturer: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  // Data URL of a client-side downscaled photo (the POS resizes before upload).
  photoUrl: z.string().max(400_000).nullable().optional(),
  purchaseDate: dateField,
  purchaseCost: z.number().nonnegative().finite().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  vendorName: z.string().trim().max(200).nullable().optional(),
  warrantyExpiry: dateField,
  depreciationMethod: z.enum(["straight_line", "none"]).optional(),
  usefulLifeMonths: z.number().int().positive().max(1200).nullable().optional(),
  salvageValue: z.number().nonnegative().finite().optional(),
  depreciationStartDate: dateField,
  condition: z.enum(CONDITIONS).optional(),
  status: z.enum(STATUSES).optional(),
  locationId: z.number().int().positive().nullable().optional(),
  locationName: z.string().trim().max(200).nullable().optional(),
  serviceIntervalDays: z.number().int().positive().max(3650).nullable().optional(),
  lastServiceDate: dateField,
  nextServiceDue: dateField,
  notes: z.string().max(4000).nullable().optional(),
});

const UpdateAssetBody = AssetBody.partial();

const AssignBody = z.object({
  assigneeType: z.enum(["staff", "team"]),
  staffId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  expectedReturnDate: dateField,
  conditionOut: z.enum(CONDITIONS).optional(),
  notes: z.string().max(2000).optional(),
});

const ReturnBody = z.object({
  conditionIn: z.enum(CONDITIONS).optional(),
  returnNotes: z.string().max(2000).optional(),
});

const ServiceBody = z.object({
  serviceType: z.enum(["service", "calibration", "repair", "inspection"]).optional(),
  performedAt: dateField,
  performedBy: z.string().trim().max(200).optional(),
  cost: z.number().nonnegative().finite().optional(),
  notes: z.string().max(2000).optional(),
  nextDueDate: dateField,
  /** Optional condition to restore the asset to once the work is logged. */
  condition: z.enum(CONDITIONS).optional(),
  returnToService: z.boolean().optional(),
});

/* ─── Shaping ─── */

type AssetRow = typeof fixedAssetsTable.$inferSelect;
type AssignmentRow = typeof assetAssignmentsTable.$inferSelect;

const DUE_SOON_DAYS = 14;

function serviceState(nextServiceDue: Date | null, now = new Date()): "none" | "ok" | "due_soon" | "overdue" {
  if (!nextServiceDue) return "none";
  const due = new Date(nextServiceDue).getTime();
  if (due <= now.getTime()) return "overdue";
  if (due <= now.getTime() + DUE_SOON_DAYS * 86_400_000) return "due_soon";
  return "ok";
}

function shapeAsset(a: AssetRow, currentAssignment: AssignmentRow | null) {
  return {
    ...a,
    depreciation: computeDepreciation(a),
    serviceState: serviceState(a.nextServiceDue),
    currentAssignment: currentAssignment
      ? {
          id: currentAssignment.id,
          assigneeType: currentAssignment.assigneeType,
          staffId: currentAssignment.staffId,
          staffName: currentAssignment.staffName,
          teamId: currentAssignment.teamId,
          teamName: currentAssignment.teamName,
          workOrderId: currentAssignment.workOrderId,
          workOrderNumber: currentAssignment.workOrderNumber,
          assignedAt: currentAssignment.assignedAt,
          expectedReturnDate: currentAssignment.expectedReturnDate,
          notes: currentAssignment.notes,
        }
      : null,
  };
}

/* ─── Routes ─── */

// Register summary for the page header: counts and money totals.
router.get("/assets/summary", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      purchaseCost: fixedAssetsTable.purchaseCost,
      salvageValue: fixedAssetsTable.salvageValue,
      usefulLifeMonths: fixedAssetsTable.usefulLifeMonths,
      depreciationMethod: fixedAssetsTable.depreciationMethod,
      depreciationStartDate: fixedAssetsTable.depreciationStartDate,
      purchaseDate: fixedAssetsTable.purchaseDate,
      status: fixedAssetsTable.status,
      condition: fixedAssetsTable.condition,
      isTool: fixedAssetsTable.isTool,
      nextServiceDue: fixedAssetsTable.nextServiceDue,
    })
    .from(fixedAssetsTable)
    .where(eq(fixedAssetsTable.tenantId, tenantId));

  const now = new Date();
  let totalCost = 0, totalBookValue = 0, assigned = 0, tools = 0, needsRepair = 0, dueForService = 0, retired = 0;
  for (const r of rows) {
    totalCost += r.purchaseCost ?? 0;
    totalBookValue += computeDepreciation(r, now).bookValue;
    if (r.status === "assigned") assigned++;
    if (r.status === "retired" || r.status === "lost") retired++;
    if (r.isTool) tools++;
    if (r.condition === "needs_repair" || r.condition === "out_of_service" || r.status === "in_repair") needsRepair++;
    const s = serviceState(r.nextServiceDue, now);
    if (s === "overdue" || s === "due_soon") dueForService++;
  }

  res.json({
    total: rows.length,
    tools,
    assigned,
    retired,
    needsRepair,
    dueForService,
    totalCost: Math.round(totalCost * 100) / 100,
    totalBookValue: Math.round(totalBookValue * 100) / 100,
    accumulatedDepreciation: Math.round((totalCost - totalBookValue) * 100) / 100,
  });
});

// Distinct categories in use, for the picker.
router.get("/assets/categories", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db
    .selectDistinct({ category: fixedAssetsTable.category })
    .from(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.tenantId, tenantId), sql`${fixedAssetsTable.category} IS NOT NULL AND ${fixedAssetsTable.category} <> ''`));
  res.json(rows.map((r) => r.category).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))));
});

// Scan lookup: asset tag, barcode or serial number.
router.get("/assets/lookup", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const code = String(req.query["code"] ?? "").trim();
  if (!code) { res.status(400).json({ error: "code is required" }); return; }

  const [asset] = await db
    .select()
    .from(fixedAssetsTable)
    .where(and(
      eq(fixedAssetsTable.tenantId, tenantId),
      or(
        sql`lower(${fixedAssetsTable.assetTag}) = lower(${code})`,
        sql`lower(${fixedAssetsTable.barcode}) = lower(${code})`,
        sql`lower(${fixedAssetsTable.serialNumber}) = lower(${code})`,
      ),
    ))
    .limit(1);

  if (!asset) { res.status(404).json({ error: "No asset matches that code" }); return; }
  const [current] = asset.currentAssignmentId
    ? await db.select().from(assetAssignmentsTable).where(eq(assetAssignmentsTable.id, asset.currentAssignmentId))
    : [];
  res.json(shapeAsset(asset, current ?? null));
});

// List / filter the register.
router.get("/assets", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = String(req.query["search"] ?? "").trim();
  const category = String(req.query["category"] ?? "").trim();
  const status = String(req.query["status"] ?? "").trim();
  const condition = String(req.query["condition"] ?? "").trim();
  const isTool = String(req.query["isTool"] ?? "").trim();
  const staffId = parseInt(String(req.query["staffId"] ?? ""), 10);
  const teamId = parseInt(String(req.query["teamId"] ?? ""), 10);
  const dueWithinDays = parseInt(String(req.query["dueWithinDays"] ?? ""), 10);
  const includeRetired = String(req.query["includeRetired"] ?? "") === "true";

  const conds = [eq(fixedAssetsTable.tenantId, tenantId)];
  if (q) {
    conds.push(or(
      ilike(fixedAssetsTable.name, `%${q}%`),
      ilike(fixedAssetsTable.assetTag, `%${q}%`),
      ilike(fixedAssetsTable.serialNumber, `%${q}%`),
      ilike(fixedAssetsTable.model, `%${q}%`),
      ilike(fixedAssetsTable.barcode, `%${q}%`),
    )!);
  }
  if (category) conds.push(eq(fixedAssetsTable.category, category));
  if (status) conds.push(eq(fixedAssetsTable.status, status));
  else if (!includeRetired) conds.push(and(ne(fixedAssetsTable.status, "retired"), ne(fixedAssetsTable.status, "lost"))!);
  if (condition) conds.push(eq(fixedAssetsTable.condition, condition));
  if (isTool === "true") conds.push(eq(fixedAssetsTable.isTool, true));
  if (isTool === "false") conds.push(eq(fixedAssetsTable.isTool, false));
  if (Number.isFinite(dueWithinDays)) {
    conds.push(lte(fixedAssetsTable.nextServiceDue, new Date(Date.now() + dueWithinDays * 86_400_000)));
  }
  if (Number.isFinite(staffId)) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${assetAssignmentsTable} aa WHERE aa.asset_id = ${fixedAssetsTable.id} AND aa.status = 'active' AND aa.staff_id = ${staffId})`);
  }
  if (Number.isFinite(teamId)) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${assetAssignmentsTable} aa WHERE aa.asset_id = ${fixedAssetsTable.id} AND aa.status = 'active' AND aa.team_id = ${teamId})`);
  }

  const assets = await db
    .select()
    .from(fixedAssetsTable)
    .where(and(...conds))
    .orderBy(desc(fixedAssetsTable.createdAt));

  // Batch the active-custody lookup — never one query per asset.
  const ids = assets.map((a) => a.id);
  const active = ids.length
    ? await db
        .select()
        .from(assetAssignmentsTable)
        .where(and(
          eq(assetAssignmentsTable.tenantId, tenantId),
          eq(assetAssignmentsTable.status, "active"),
          inArray(assetAssignmentsTable.assetId, ids),
        ))
    : [];
  const byAsset = new Map(active.map((a) => [a.assetId, a]));

  res.json(assets.map((a) => shapeAsset(a, byAsset.get(a.id) ?? null)));
});

// One asset with its full custody history and service log.
router.get("/assets/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [asset] = await db
    .select()
    .from(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.tenantId, tenantId)));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

  const [assignments, services] = await Promise.all([
    db.select().from(assetAssignmentsTable)
      .where(and(eq(assetAssignmentsTable.tenantId, tenantId), eq(assetAssignmentsTable.assetId, id)))
      .orderBy(desc(assetAssignmentsTable.assignedAt)),
    db.select().from(assetServiceRecordsTable)
      .where(and(eq(assetServiceRecordsTable.tenantId, tenantId), eq(assetServiceRecordsTable.assetId, id)))
      .orderBy(desc(assetServiceRecordsTable.performedAt)),
  ]);

  const current = assignments.find((a) => a.status === "active") ?? null;
  res.json({ ...shapeAsset(asset, current), assignments, serviceRecords: services });
});

// Create an asset. The tag is auto-generated (AST-0001…) when left blank.
router.post("/assets", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = AssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  const assetTag = b.assetTag?.trim() || (await nextAssetTag(tenantId));
  const lastServiceDate = toDate(b.lastServiceDate) ?? null;
  let nextServiceDue = toDate(b.nextServiceDue) ?? null;
  if (!nextServiceDue && b.serviceIntervalDays && lastServiceDate) {
    nextServiceDue = new Date(lastServiceDate.getTime() + b.serviceIntervalDays * 86_400_000);
  }

  try {
    const [created] = await db.insert(fixedAssetsTable).values({
      tenantId,
      assetTag,
      barcode: b.barcode || null,
      name: b.name,
      description: b.description || null,
      category: b.category || null,
      isTool: b.isTool ?? false,
      serialNumber: b.serialNumber || null,
      manufacturer: b.manufacturer || null,
      model: b.model || null,
      photoUrl: b.photoUrl || null,
      purchaseDate: toDate(b.purchaseDate) ?? null,
      purchaseCost: b.purchaseCost ?? 0,
      vendorId: b.vendorId ?? null,
      vendorName: b.vendorName || null,
      warrantyExpiry: toDate(b.warrantyExpiry) ?? null,
      depreciationMethod: b.depreciationMethod ?? "straight_line",
      usefulLifeMonths: b.usefulLifeMonths ?? null,
      salvageValue: b.salvageValue ?? 0,
      depreciationStartDate: toDate(b.depreciationStartDate) ?? toDate(b.purchaseDate) ?? null,
      condition: b.condition ?? "good",
      status: b.status ?? "in_store",
      locationId: b.locationId ?? null,
      locationName: b.locationName || null,
      serviceIntervalDays: b.serviceIntervalDays ?? null,
      lastServiceDate,
      nextServiceDue,
      notes: b.notes || null,
    }).returning();
    res.status(201).json(shapeAsset(created!, null));
  } catch (e) {
    if (isUniqueViolation(e)) { res.status(409).json({ error: `Asset tag "${assetTag}" is already in use` }); return; }
    throw e;
  }
});

// Update an asset.
router.patch("/assets/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  const [existing] = await db.select().from(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Asset not found" }); return; }

  // Custody is only ever changed through assign/return, so status can't be
  // hand-edited into (or out of) "assigned" behind the ledger's back.
  if (b.status && b.status !== existing.status) {
    if (b.status === "assigned" || existing.status === "assigned") {
      res.status(400).json({ error: "Use assign / return to change who holds this asset" });
      return;
    }
  }

  const patch: Partial<typeof fixedAssetsTable.$inferInsert> = { updatedAt: new Date() };
  const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K] | undefined) => {
    if (v !== undefined) patch[k] = v;
  };
  if (b.assetTag !== undefined) set("assetTag", b.assetTag.trim() || existing.assetTag);
  set("barcode", b.barcode === undefined ? undefined : (b.barcode || null));
  set("name", b.name);
  set("description", b.description === undefined ? undefined : (b.description || null));
  set("category", b.category === undefined ? undefined : (b.category || null));
  set("isTool", b.isTool);
  set("serialNumber", b.serialNumber === undefined ? undefined : (b.serialNumber || null));
  set("manufacturer", b.manufacturer === undefined ? undefined : (b.manufacturer || null));
  set("model", b.model === undefined ? undefined : (b.model || null));
  set("photoUrl", b.photoUrl === undefined ? undefined : (b.photoUrl || null));
  set("purchaseDate", toDate(b.purchaseDate));
  set("purchaseCost", b.purchaseCost);
  set("vendorId", b.vendorId === undefined ? undefined : (b.vendorId ?? null));
  set("vendorName", b.vendorName === undefined ? undefined : (b.vendorName || null));
  set("warrantyExpiry", toDate(b.warrantyExpiry));
  set("depreciationMethod", b.depreciationMethod);
  set("usefulLifeMonths", b.usefulLifeMonths === undefined ? undefined : (b.usefulLifeMonths ?? null));
  set("salvageValue", b.salvageValue);
  set("depreciationStartDate", toDate(b.depreciationStartDate));
  set("condition", b.condition);
  set("status", b.status);
  set("locationId", b.locationId === undefined ? undefined : (b.locationId ?? null));
  set("locationName", b.locationName === undefined ? undefined : (b.locationName || null));
  set("serviceIntervalDays", b.serviceIntervalDays === undefined ? undefined : (b.serviceIntervalDays ?? null));
  set("lastServiceDate", toDate(b.lastServiceDate));
  set("nextServiceDue", toDate(b.nextServiceDue));
  set("notes", b.notes === undefined ? undefined : (b.notes || null));

  try {
    const [updated] = await db.update(fixedAssetsTable).set(patch)
      .where(and(eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.tenantId, tenantId)))
      .returning();
    const [current] = updated?.currentAssignmentId
      ? await db.select().from(assetAssignmentsTable).where(eq(assetAssignmentsTable.id, updated.currentAssignmentId))
      : [];
    res.json(shapeAsset(updated!, current ?? null));
  } catch (e) {
    if (isUniqueViolation(e)) { res.status(409).json({ error: "That asset tag is already in use" }); return; }
    throw e;
  }
});

// Delete — only while the asset has no history. Otherwise retire it.
router.delete("/assets/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [{ count: historyCount } = { count: 0 }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(assetAssignmentsTable)
    .where(and(eq(assetAssignmentsTable.tenantId, tenantId), eq(assetAssignmentsTable.assetId, id)));
  if (Number(historyCount) > 0) {
    res.status(409).json({ error: "This asset has assignment history. Retire it instead of deleting." });
    return;
  }

  const deleted = await db.delete(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.tenantId, tenantId)))
    .returning({ id: fixedAssetsTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Asset not found" }); return; }
  res.status(204).end();
});

// Hand an asset to a technician or a team.
router.post("/assets/:id/assign", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AssignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  let staffName: string | null = null;
  let teamName: string | null = null;
  if (b.assigneeType === "staff") {
    if (!b.staffId) { res.status(400).json({ error: "staffId is required" }); return; }
    const [s] = await db.select({ name: staffTable.name }).from(staffTable)
      .where(and(eq(staffTable.id, b.staffId), eq(staffTable.tenantId, tenantId)));
    if (!s) { res.status(400).json({ error: "Staff member not found" }); return; }
    staffName = s.name;
  } else {
    if (!b.teamId) { res.status(400).json({ error: "teamId is required" }); return; }
    const [t] = await db.select({ name: technicianTeamsTable.name }).from(technicianTeamsTable)
      .where(and(eq(technicianTeamsTable.id, b.teamId), eq(technicianTeamsTable.tenantId, tenantId)));
    if (!t) { res.status(400).json({ error: "Team not found" }); return; }
    teamName = t.name;
  }

  const actor = await getActor(req as never, tenantId);

  try {
    const result = await db.transaction(async (tx) => {
      const asset = await lockAsset(tx, tenantId, id);
      if (!asset) return { error: 404 as const };
      if (asset.status === "retired" || asset.status === "lost") {
        return { error: 400 as const, message: "A retired or lost asset can't be assigned" };
      }
      await claimAssetCustody(tx, {
        tenantId,
        assetId: id,
        assigneeType: b.assigneeType,
        staffId: b.assigneeType === "staff" ? b.staffId! : null,
        staffName,
        teamId: b.assigneeType === "team" ? b.teamId! : null,
        teamName,
        assignedByStaffId: actor?.id ?? null,
        assignedByName: actor?.name ?? null,
        expectedReturnDate: toDate(b.expectedReturnDate) ?? null,
        conditionOut: b.conditionOut ?? asset.condition,
        notes: b.notes ?? null,
      });
      return { error: null };
    });

    if (result.error === 404) { res.status(404).json({ error: "Asset not found" }); return; }
    if (result.error === 400) { res.status(400).json({ error: result.message }); return; }
  } catch (e) {
    if ((e as Error).name === "AssetAlreadyAssigned" || isUniqueViolation(e)) {
      res.status(409).json({ error: "That asset is already signed out. Return it first." });
      return;
    }
    throw e;
  }

  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  const [current] = await db.select().from(assetAssignmentsTable)
    .where(and(eq(assetAssignmentsTable.assetId, id), eq(assetAssignmentsTable.status, "active")));
  res.json(shapeAsset(asset!, current ?? null));
});

// Take an asset back into the store.
router.post("/assets/:id/return", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReturnBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const actor = await getActor(req as never, tenantId);

  const outcome = await db.transaction(async (tx) => {
    const asset = await lockAsset(tx, tenantId, id);
    if (!asset) return "missing" as const;

    // A tool that went out on a job comes back through that job's materials
    // list — returning it here would leave the dispatch line saying the tool is
    // still outstanding while the ledger says it is back in the store.
    const [active] = await tx
      .select({ workOrderId: assetAssignmentsTable.workOrderId, workOrderNumber: assetAssignmentsTable.workOrderNumber })
      .from(assetAssignmentsTable)
      .where(and(eq(assetAssignmentsTable.assetId, id), eq(assetAssignmentsTable.status, "active")));
    if (active?.workOrderId != null) {
      const stillOut = await outstandingToolLines(tx, { tenantId, assetId: id, workOrderId: active.workOrderId });
      if (stillOut > 0) return { onJob: active.workOrderNumber ?? `#${active.workOrderId}` } as const;
    }

    const released = await releaseAssetCustody(tx, {
      tenantId,
      assetId: id,
      returnedToStaffId: actor?.id ?? null,
      returnedToName: actor?.name ?? null,
      conditionIn: parsed.data.conditionIn ?? null,
      returnNotes: parsed.data.returnNotes ?? null,
    });
    return released ? ("ok" as const) : ("not_out" as const);
  });

  if (outcome === "missing") { res.status(404).json({ error: "Asset not found" }); return; }
  if (typeof outcome === "object" && "onJob" in outcome) {
    res.status(409).json({ error: `That tool is out on job ${outcome.onJob}. Return it on that job's materials list.` });
    return;
  }
  if (outcome === "not_out") { res.status(409).json({ error: "That asset is not currently signed out" }); return; }

  const [asset] = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.id, id));
  res.json(shapeAsset(asset!, null));
});

// Log service / calibration and roll the schedule forward.
router.post("/assets/:id/service", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ServiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;
  const actor = await getActor(req as never, tenantId);

  const result = await db.transaction(async (tx) => {
    const asset = await lockAsset(tx, tenantId, id);
    if (!asset) return null;

    const performedAt = toDate(b.performedAt) ?? new Date();
    let nextDue = toDate(b.nextDueDate) ?? null;
    if (!nextDue && asset.serviceIntervalDays) {
      nextDue = new Date(performedAt.getTime() + asset.serviceIntervalDays * 86_400_000);
    }

    const [record] = await tx.insert(assetServiceRecordsTable).values({
      tenantId,
      assetId: id,
      serviceType: b.serviceType ?? "service",
      performedAt,
      performedBy: b.performedBy ?? actor?.name ?? null,
      cost: b.cost ?? 0,
      notes: b.notes ?? null,
      nextDueDate: nextDue,
      createdByStaffId: actor?.id ?? null,
    }).returning();

    // Servicing an out-of-action tool normally puts it back in the store —
    // unless it is currently in someone's hands, which custody owns.
    const backInService = b.returnToService !== false && asset.status === "in_repair";
    await tx.update(fixedAssetsTable).set({
      lastServiceDate: performedAt,
      nextServiceDue: nextDue,
      ...(b.condition ? { condition: b.condition } : backInService ? { condition: "good" } : {}),
      ...(backInService ? { status: "in_store" } : {}),
      updatedAt: new Date(),
    }).where(eq(fixedAssetsTable.id, id));

    return record!;
  });

  if (!result) { res.status(404).json({ error: "Asset not found" }); return; }
  res.status(201).json(result);
});

export default router;
