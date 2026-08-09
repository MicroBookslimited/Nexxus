import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderNotesTable,
  workOrderStatusHistoryTable,
  customersTable,
  staffTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

/**
 * NEXXUS FSM (Field Service Management) — technician-facing endpoints.
 *
 * Auth model: tenant JWT (Authorization: Bearer) + REQUIRED x-staff-id header
 * identifying the technician. Every endpoint scopes to jobs where that staff
 * member is assigned (primary assigned_staff_id OR present in the
 * assigned_staff_ids JSONB list), so a technician only ever sees their own
 * queue.
 */

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

async function getVerifiedStaff(
  req: { headers: Record<string, string | undefined> },
  tenantId: number,
): Promise<{ id: number; name: string } | null> {
  const raw = req.headers["x-staff-id"];
  const staffId = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(staffId)) return null;
  const [s] = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  return s ?? null;
}

/** SQL condition: staff is the primary assignee OR appears in the JSONB id list. */
function assignedToStaff(staffId: number) {
  return sql`(${workOrdersTable.assignedStaffId} = ${staffId} OR ${workOrdersTable.assignedStaffIds} @> ${JSON.stringify([staffId])}::jsonb)`;
}

const ACTIVE_STATUSES = ["received", "in_progress", "awaiting_parts", "on_hold", "ready"] as const;

function toJob(w: typeof workOrdersTable.$inferSelect, customerName?: string | null, customerPhone?: string | null) {
  return {
    id: w.id,
    workOrderNumber: w.workOrderNumber,
    status: w.status,
    assignmentStatus: w.assignmentStatus,
    assignmentRespondedAt: w.assignmentRespondedAt,
    declineReason: w.declineReason,
    priority: w.priority,
    serviceType: w.serviceType,
    serviceChannel: w.serviceChannel,
    itemDescription: w.itemDescription,
    brand: w.brand,
    model: w.model,
    serialNumber: w.serialNumber,
    problemDescription: w.problemDescription,
    diagnosis: w.diagnosis,
    customerName: customerName ?? w.contactName ?? null,
    contactName: w.contactName,
    contactPhone: customerPhone ?? w.contactPhone ?? null,
    contactEmail: w.contactEmail,
    storageLocation: w.storageLocation,
    appointmentDate: w.appointmentDate,
    promisedDate: w.promisedDate,
    notes: w.notes,
    total: w.total,
    depositPaid: w.depositPaid,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

// LIST my jobs
router.get("/fsm/jobs", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staff = await getVerifiedStaff(req as never, tenantId);
  if (!staff) { res.status(401).json({ error: "Technician identity required" }); return; }

  const rows = await db
    .select({
      workOrder: workOrdersTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)))
    .where(and(
      eq(workOrdersTable.tenantId, tenantId),
      inArray(workOrdersTable.status, [...ACTIVE_STATUSES]),
      assignedToStaff(staff.id),
    ))
    .orderBy(desc(workOrdersTable.createdAt))
    .limit(200);

  res.json(rows.map((r) => toJob(r.workOrder, r.customerName, r.customerPhone)));
});

// GET one of my jobs (with notes + history)
router.get("/fsm/jobs/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staff = await getVerifiedStaff(req as never, tenantId);
  if (!staff) { res.status(401).json({ error: "Technician identity required" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      workOrder: workOrdersTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)))
    .where(and(
      eq(workOrdersTable.id, id),
      eq(workOrdersTable.tenantId, tenantId),
      assignedToStaff(staff.id),
    ));
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }

  const [notes, history] = await Promise.all([
    db.select().from(workOrderNotesTable)
      .where(and(eq(workOrderNotesTable.tenantId, tenantId), eq(workOrderNotesTable.workOrderId, id)))
      .orderBy(desc(workOrderNotesTable.createdAt)),
    db.select().from(workOrderStatusHistoryTable)
      .where(and(eq(workOrderStatusHistoryTable.tenantId, tenantId), eq(workOrderStatusHistoryTable.workOrderId, id)))
      .orderBy(desc(workOrderStatusHistoryTable.createdAt)),
  ]);

  res.json({ ...toJob(row.workOrder, row.customerName, row.customerPhone), notes, history });
});

const DeclineBody = z.object({
  reason: z.string().min(1).max(500),
});

/** Shared accept/decline implementation. */
async function respondToJob(
  req: { headers: Record<string, string | undefined>; params: Record<string, string>; body: unknown },
  res: { status: (n: number) => { json: (b: unknown) => void }; json: (b: unknown) => void },
  action: "accepted" | "declined",
): Promise<void> {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staff = await getVerifiedStaff(req as never, tenantId);
  if (!staff) { res.status(401).json({ error: "Technician identity required" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  let declineReason: string | null = null;
  if (action === "declined") {
    const parsed = DeclineBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "A decline reason is required" }); return; }
    declineReason = parsed.data.reason;
  }

  const updated = await db.transaction(async (tx) => {
    // Row-lock so two simultaneous responses can't both write.
    const [existing] = await tx
      .select()
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.id, id),
        eq(workOrdersTable.tenantId, tenantId),
        assignedToStaff(staff.id),
      ))
      .for("update");
    if (!existing) return { error: 404 as const };
    if (existing.status === "collected" || existing.status === "cancelled") {
      return { error: 400 as const, message: "This job is closed" };
    }
    if (existing.assignmentStatus === action) {
      return { row: existing }; // idempotent — already in this state
    }
    if (existing.assignmentStatus !== "pending") {
      // Another assigned technician already responded — don't overwrite their answer.
      return {
        error: 409 as const,
        message: `This job was already ${existing.assignmentStatus} by a technician. Ask a manager to reassign it if that needs to change.`,
      };
    }

    const [row] = await tx
      .update(workOrdersTable)
      .set({
        assignmentStatus: action,
        assignmentRespondedAt: new Date(),
        declineReason,
        updatedAt: new Date(),
      })
      .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)))
      .returning();

    // Visible in the dispatcher's history timeline in NEXXUS POS Web.
    await tx.insert(workOrderStatusHistoryTable).values({
      tenantId,
      workOrderId: id,
      fromStatus: existing.status,
      toStatus: existing.status,
      changedByStaffId: staff.id,
      changedByName: staff.name,
      note: action === "accepted"
        ? `Job accepted by ${staff.name}`
        : `Job declined by ${staff.name}: ${declineReason}`,
    });

    return { row };
  });

  if ("error" in updated) {
    if (updated.error === 404) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(400).json({ error: updated.message ?? "Cannot respond to this job" });
    return;
  }
  res.json(toJob(updated.row));
}

router.post("/fsm/jobs/:id/accept", (req, res) => respondToJob(req as never, res as never, "accepted"));
router.post("/fsm/jobs/:id/decline", (req, res) => respondToJob(req as never, res as never, "declined"));

export default router;
