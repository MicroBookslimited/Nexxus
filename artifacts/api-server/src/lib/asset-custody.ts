import { and, eq, ne, sql } from "drizzle-orm";
import { db, assetAssignmentsTable, fixedAssetsTable, workOrderAllocationsTable } from "@workspace/db";

/**
 * Shared fixed-asset helpers: straight-line depreciation (computed on read,
 * never stored) and the custody transitions that keep `fixed_assets.status` /
 * `current_assignment_id` in step with the `asset_assignments` ledger.
 *
 * Every custody change must go through here inside a transaction that has
 * locked the asset row, so two people can't take the same tool at once. The
 * partial unique index `asset_assignments_one_active` is the final backstop.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DepreciationInput {
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number | null;
  depreciationMethod: string;
  depreciationStartDate: Date | null;
  purchaseDate: Date | null;
}

export interface DepreciationResult {
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  monthsElapsed: number;
  monthsRemaining: number;
  fullyDepreciatedOn: string | null;
}

function wholeMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1; // only count completed months
  return months;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * Straight-line depreciation. Returns zeroed figures (book value = cost) when
 * depreciation is switched off or the inputs are incomplete, so the UI can
 * always render the same shape.
 */
export function computeDepreciation(a: DepreciationInput, asOf: Date = new Date()): DepreciationResult {
  const cost = a.purchaseCost ?? 0;
  const idle: DepreciationResult = {
    monthlyDepreciation: 0,
    accumulatedDepreciation: 0,
    bookValue: round2(cost),
    monthsElapsed: 0,
    monthsRemaining: 0,
    fullyDepreciatedOn: null,
  };

  const life = a.usefulLifeMonths ?? 0;
  const start = a.depreciationStartDate ?? a.purchaseDate;
  if (a.depreciationMethod !== "straight_line" || life <= 0 || !start) return idle;

  const depreciable = Math.max(0, cost - (a.salvageValue ?? 0));
  const monthly = depreciable / life;
  const elapsed = Math.max(0, wholeMonthsBetween(new Date(start), asOf));
  const used = Math.min(elapsed, life);
  const accumulated = round2(monthly * used);

  return {
    monthlyDepreciation: round2(monthly),
    accumulatedDepreciation: accumulated,
    bookValue: round2(cost - accumulated),
    monthsElapsed: elapsed,
    monthsRemaining: Math.max(0, life - elapsed),
    fullyDepreciatedOn: addMonths(new Date(start), life).toISOString(),
  };
}

/** Number of days out from "due" that still counts as "due soon". */
export const SERVICE_DUE_SOON_DAYS = 14;

/**
 * Traffic-light for a tool's service/calibration schedule. Shared by the asset
 * register (routes/assets.ts) and the FSM tools catalog so the field app and
 * the office agree on what "overdue" means.
 */
export function serviceState(
  nextServiceDue: Date | null,
  now: Date = new Date(),
): "none" | "ok" | "due_soon" | "overdue" {
  if (!nextServiceDue) return "none";
  const due = new Date(nextServiceDue).getTime();
  if (due <= now.getTime()) return "overdue";
  if (due <= now.getTime() + SERVICE_DUE_SOON_DAYS * 86_400_000) return "due_soon";
  return "ok";
}

/** Row-lock an asset inside a transaction. Returns null when it isn't this tenant's. */
export async function lockAsset(tx: Tx, tenantId: number, assetId: number) {
  const [asset] = await tx
    .select()
    .from(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.id, assetId), eq(fixedAssetsTable.tenantId, tenantId)))
    .for("update");
  return asset ?? null;
}

export interface ClaimCustodyInput {
  tenantId: number;
  assetId: number;
  assigneeType: "staff" | "team";
  staffId?: number | null;
  staffName?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  workOrderId?: number | null;
  workOrderNumber?: string | null;
  assignedByStaffId?: number | null;
  assignedByName?: string | null;
  expectedReturnDate?: Date | null;
  conditionOut?: string | null;
  notes?: string | null;
}

/**
 * Opens a custody spell. Caller must already hold the asset row lock.
 * Throws when the asset is already out — the caller maps that to a 409.
 */
export async function claimAssetCustody(tx: Tx, input: ClaimCustodyInput): Promise<number> {
  const [existing] = await tx
    .select({ id: assetAssignmentsTable.id })
    .from(assetAssignmentsTable)
    .where(and(
      eq(assetAssignmentsTable.assetId, input.assetId),
      eq(assetAssignmentsTable.status, "active"),
    ));
  if (existing) {
    const err = new Error("ASSET_ALREADY_ASSIGNED");
    err.name = "AssetAlreadyAssigned";
    throw err;
  }

  const [row] = await tx
    .insert(assetAssignmentsTable)
    .values({
      tenantId: input.tenantId,
      assetId: input.assetId,
      assigneeType: input.assigneeType,
      staffId: input.staffId ?? null,
      staffName: input.staffName ?? null,
      teamId: input.teamId ?? null,
      teamName: input.teamName ?? null,
      workOrderId: input.workOrderId ?? null,
      workOrderNumber: input.workOrderNumber ?? null,
      assignedByStaffId: input.assignedByStaffId ?? null,
      assignedByName: input.assignedByName ?? null,
      expectedReturnDate: input.expectedReturnDate ?? null,
      conditionOut: input.conditionOut ?? null,
      notes: input.notes ?? null,
      status: "active",
    })
    .returning({ id: assetAssignmentsTable.id });

  await tx
    .update(fixedAssetsTable)
    .set({ status: "assigned", currentAssignmentId: row!.id, updatedAt: new Date() })
    .where(eq(fixedAssetsTable.id, input.assetId));

  return row!.id;
}

export interface ReleaseCustodyInput {
  tenantId: number;
  assetId: number;
  returnedToStaffId?: number | null;
  returnedToName?: string | null;
  conditionIn?: string | null;
  returnNotes?: string | null;
}

/**
 * Closes the open custody spell and puts the asset back in the store.
 * No-op (returns false) when the asset is not currently out, so repeated
 * returns — office return plus a technician hand-back, say — stay safe.
 */
export async function releaseAssetCustody(tx: Tx, input: ReleaseCustodyInput): Promise<boolean> {
  const closed = await tx
    .update(assetAssignmentsTable)
    .set({
      status: "returned",
      returnedAt: new Date(),
      returnedToStaffId: input.returnedToStaffId ?? null,
      returnedToName: input.returnedToName ?? null,
      conditionIn: input.conditionIn ?? null,
      returnNotes: input.returnNotes ?? null,
    })
    .where(and(
      eq(assetAssignmentsTable.tenantId, input.tenantId),
      eq(assetAssignmentsTable.assetId, input.assetId),
      eq(assetAssignmentsTable.status, "active"),
    ))
    .returning({ id: assetAssignmentsTable.id });

  if (closed.length === 0) return false;

  // A tool handed back damaged goes to the repair bench, not straight back
  // into circulation.
  const needsRepair = input.conditionIn === "needs_repair" || input.conditionIn === "out_of_service";
  await tx
    .update(fixedAssetsTable)
    .set({
      status: needsRepair ? "in_repair" : "in_store",
      ...(input.conditionIn ? { condition: input.conditionIn } : {}),
      currentAssignmentId: null,
      updatedAt: new Date(),
    })
    .where(eq(fixedAssetsTable.id, input.assetId));

  return true;
}

/**
 * Custody hook for work-order material lines that are linked to a tracked tool
 * (`work_order_allocations.asset_id`). Dispatching the line takes the tool out
 * in the job's name; returning or deleting the line hands it back.
 */
export async function claimAssetForJob(tx: Tx, params: {
  tenantId: number;
  assetId: number;
  workOrderId: number;
  workOrderNumber: string | null;
  staffId: number | null;
  staffName: string | null;
  teamId: number | null;
  teamName: string | null;
  dispatchedByStaffId: number | null;
  dispatchedByName: string | null;
}): Promise<void> {
  const asset = await lockAsset(tx, params.tenantId, params.assetId);
  if (!asset) {
    const err = new Error("ASSET_NOT_FOUND");
    err.name = "AssetNotFound";
    throw err;
  }
  // Already out to the same job (e.g. a second line for the same tool): leave
  // the existing custody spell alone rather than failing the dispatch.
  const [active] = await tx
    .select({ id: assetAssignmentsTable.id, workOrderId: assetAssignmentsTable.workOrderId })
    .from(assetAssignmentsTable)
    .where(and(
      eq(assetAssignmentsTable.assetId, params.assetId),
      eq(assetAssignmentsTable.status, "active"),
    ));
  if (active) {
    if (active.workOrderId === params.workOrderId) return;
    const err = new Error("ASSET_ALREADY_ASSIGNED");
    err.name = "AssetAlreadyAssigned";
    throw err;
  }

  // Only a tool sitting in the store can go out on a job. Retired, lost and
  // on-the-bench (`in_repair`) tools stay put — dispatching one would tell the
  // technician a broken tool is on its way.
  if (asset.status !== "in_store") {
    const err = new Error("ASSET_NOT_AVAILABLE");
    err.name = "AssetNotAvailable";
    throw err;
  }

  await claimAssetCustody(tx, {
    tenantId: params.tenantId,
    assetId: params.assetId,
    assigneeType: params.teamId ? "team" : "staff",
    staffId: params.staffId,
    staffName: params.staffName,
    teamId: params.teamId,
    teamName: params.teamName,
    workOrderId: params.workOrderId,
    workOrderNumber: params.workOrderNumber,
    assignedByStaffId: params.dispatchedByStaffId,
    assignedByName: params.dispatchedByName,
    conditionOut: asset.condition,
  });
}

/**
 * Counts dispatch lines on a job that still have the physical tool outstanding.
 * `excludeAllocationId` is the line being returned or deleted right now.
 */
export async function outstandingToolLines(
  tx: Tx,
  params: { tenantId: number; assetId: number; workOrderId: number; excludeAllocationId?: number | null },
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(workOrderAllocationsTable)
    .where(and(
      eq(workOrderAllocationsTable.tenantId, params.tenantId),
      eq(workOrderAllocationsTable.workOrderId, params.workOrderId),
      eq(workOrderAllocationsTable.assetId, params.assetId),
      sql`${workOrderAllocationsTable.qtyReturned} < ${workOrderAllocationsTable.qtyAllocated}`,
      params.excludeAllocationId != null
        ? ne(workOrderAllocationsTable.id, params.excludeAllocationId)
        : sql`true`,
    ));
  return Number(row?.n ?? 0);
}

/** Hands a job-linked tool back. Safe to call when nothing is outstanding. */
export async function releaseAssetForJob(tx: Tx, params: {
  tenantId: number;
  assetId: number;
  workOrderId: number;
  /** The line being returned/deleted — excluded from the outstanding-lines check. */
  excludeAllocationId?: number | null;
  receivedByStaffId?: number | null;
  receivedByName?: string | null;
  conditionIn?: string | null;
  notes?: string | null;
}): Promise<void> {
  await lockAsset(tx, params.tenantId, params.assetId);
  const [active] = await tx
    .select({ id: assetAssignmentsTable.id, workOrderId: assetAssignmentsTable.workOrderId })
    .from(assetAssignmentsTable)
    .where(and(
      eq(assetAssignmentsTable.assetId, params.assetId),
      eq(assetAssignmentsTable.status, "active"),
    ));
  // Only release custody that this job created — a tool that has since been
  // signed out to someone else must not be quietly taken from them.
  if (!active || active.workOrderId !== params.workOrderId) return;

  // The tool is physically back only once EVERY line that dispatched it on this
  // job is settled; otherwise the ledger would say "in store" while a dispatch
  // slip still has it outstanding.
  const stillOut = await outstandingToolLines(tx, params);
  if (stillOut > 0) return;

  await releaseAssetCustody(tx, {
    tenantId: params.tenantId,
    assetId: params.assetId,
    returnedToStaffId: params.receivedByStaffId ?? null,
    returnedToName: params.receivedByName ?? null,
    conditionIn: params.conditionIn ?? null,
    returnNotes: params.notes ?? null,
  });
}

/** Next asset tag for a tenant: AST-0001, AST-0002 … */
export async function nextAssetTag(tenantId: number): Promise<string> {
  const [row] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(${fixedAssetsTable.assetTag}, '\\D', '', 'g'), '')::bigint), 0)` })
    .from(fixedAssetsTable)
    .where(and(eq(fixedAssetsTable.tenantId, tenantId), sql`${fixedAssetsTable.assetTag} ~ '^AST-[0-9]+$'`));
  const next = Number(row?.maxSeq ?? 0) + 1;
  return `AST-${String(next).padStart(4, "0")}`;
}
