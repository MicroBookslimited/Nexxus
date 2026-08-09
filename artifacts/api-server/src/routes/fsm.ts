import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderNotesTable,
  workOrderStatusHistoryTable,
  workOrderTimeEntriesTable,
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
    travelStartedAt: w.travelStartedAt,
    arrivedAt: w.arrivedAt,
    workCompletedAt: w.workCompletedAt,
    fieldPhase: fieldPhase(w),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

/** Derived field-execution phase for the technician UI. */
function fieldPhase(w: typeof workOrdersTable.$inferSelect): "idle" | "en_route" | "on_site" | "done" {
  if (w.workCompletedAt) return "done";
  if (w.arrivedAt) return "on_site";
  if (w.travelStartedAt) return "en_route";
  return "idle";
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

  const [notes, history, timeEntries] = await Promise.all([
    db.select().from(workOrderNotesTable)
      .where(and(eq(workOrderNotesTable.tenantId, tenantId), eq(workOrderNotesTable.workOrderId, id)))
      .orderBy(desc(workOrderNotesTable.createdAt)),
    db.select().from(workOrderStatusHistoryTable)
      .where(and(eq(workOrderStatusHistoryTable.tenantId, tenantId), eq(workOrderStatusHistoryTable.workOrderId, id)))
      .orderBy(desc(workOrderStatusHistoryTable.createdAt)),
    db.select().from(workOrderTimeEntriesTable)
      .where(and(eq(workOrderTimeEntriesTable.tenantId, tenantId), eq(workOrderTimeEntriesTable.workOrderId, id)))
      .orderBy(desc(workOrderTimeEntriesTable.startedAt)),
  ]);

  const billableMinutes = timeEntries
    .filter((e) => e.entryType === "work" && e.minutes != null)
    .reduce((s, e) => s + (e.minutes ?? 0), 0);
  const pausedMinutes = timeEntries
    .filter((e) => e.entryType !== "work" && e.minutes != null)
    .reduce((s, e) => s + (e.minutes ?? 0), 0);
  const activeEntry = timeEntries.find((e) => !e.endedAt) ?? null;

  res.json({
    ...toJob(row.workOrder, row.customerName, row.customerPhone),
    notes, history, timeEntries, billableMinutes, pausedMinutes, activeEntry,
  });
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

// ─── Field execution: Start Travel → Arrive → (Pause/Resume) → Complete ──────

const PauseBody = z.object({ reason: z.string().min(1).max(200) });
const NoteBody = z.object({ content: z.string().min(1).max(2000) });

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

type ExecAction = "start-travel" | "arrive" | "pause" | "resume" | "complete";

/**
 * Shared field-execution transition. Row-locks the job, validates the phase,
 * manages the open time entry, and writes a history row for the dispatcher.
 */
async function execTransition(
  req: { headers: Record<string, string | undefined>; params: Record<string, string>; body: unknown },
  res: { status: (n: number) => { json: (b: unknown) => void }; json: (b: unknown) => void },
  action: ExecAction,
): Promise<void> {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staff = await getVerifiedStaff(req as never, tenantId);
  if (!staff) { res.status(401).json({ error: "Technician identity required" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  let pauseReason: string | null = null;
  if (action === "pause") {
    const parsed = PauseBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "A pause reason is required" }); return; }
    pauseReason = parsed.data.reason;
  }

  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.id, id),
        eq(workOrdersTable.tenantId, tenantId),
        assignedToStaff(staff.id),
      ))
      .for("update");
    if (!job) return { error: 404 as const };
    if (job.status === "collected" || job.status === "cancelled") {
      return { error: 400 as const, message: "This job is closed" };
    }
    if (job.assignmentStatus !== "accepted") {
      return { error: 400 as const, message: "Accept the job before starting work" };
    }
    if (job.workCompletedAt && action !== "complete") {
      return { error: 400 as const, message: "Work on this job is already completed" };
    }

    const now = new Date();
    const [openEntry] = await tx
      .select()
      .from(workOrderTimeEntriesTable)
      .where(and(
        eq(workOrderTimeEntriesTable.tenantId, tenantId),
        eq(workOrderTimeEntriesTable.workOrderId, id),
        sql`${workOrderTimeEntriesTable.endedAt} IS NULL`,
      ))
      .for("update");

    // Closes ALL open entries for this job (defensive: the DB's partial unique
    // index guarantees at most one, but legacy/bad data must not stay open).
    const closeOpenEntry = async () => {
      await tx.update(workOrderTimeEntriesTable)
        .set({
          endedAt: now,
          minutes: sql`GREATEST(0, ROUND(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - ${workOrderTimeEntriesTable.startedAt})) / 60))::int`,
        })
        .where(and(
          eq(workOrderTimeEntriesTable.tenantId, tenantId),
          eq(workOrderTimeEntriesTable.workOrderId, id),
          sql`${workOrderTimeEntriesTable.endedAt} IS NULL`,
        ));
    };
    const openNewEntry = async (entryType: "work" | "break", reason: string | null) => {
      await tx.insert(workOrderTimeEntriesTable).values({
        tenantId, workOrderId: id, staffId: staff.id, staffName: staff.name,
        entryType, pauseReason: reason, startedAt: now, isBillable: entryType === "work",
      });
    };

    const patch: Partial<typeof workOrdersTable.$inferInsert> = { updatedAt: now };
    let historyNote = "";
    let toStatus = job.status;

    switch (action) {
      case "start-travel": {
        if (job.travelStartedAt || job.arrivedAt) return { row: job }; // idempotent
        patch.travelStartedAt = now;
        historyNote = `${staff.name} is en route to the job`;
        break;
      }
      case "arrive": {
        if (job.arrivedAt) return { row: job }; // idempotent
        patch.arrivedAt = now;
        if (job.status === "received") { patch.status = "in_progress"; toStatus = "in_progress"; }
        if (!openEntry) await openNewEntry("work", null);
        historyNote = `${staff.name} arrived on site — work clock started`;
        break;
      }
      case "pause": {
        if (!job.arrivedAt) {
          return { error: 400 as const, message: "Arrive on site before pausing work" };
        }
        if (!openEntry || openEntry.entryType !== "work") {
          return { error: 400 as const, message: "No running work clock to pause" };
        }
        await closeOpenEntry();
        await openNewEntry("break", pauseReason);
        historyNote = `${staff.name} paused work: ${pauseReason}`;
        break;
      }
      case "resume": {
        if (!job.arrivedAt) {
          return { error: 400 as const, message: "Arrive on site before resuming work" };
        }
        if (!openEntry || openEntry.entryType === "work") {
          return { error: 400 as const, message: "Work is not paused" };
        }
        await closeOpenEntry();
        await openNewEntry("work", null);
        historyNote = `${staff.name} resumed work`;
        break;
      }
      case "complete": {
        if (job.workCompletedAt) return { row: job }; // idempotent
        if (!job.arrivedAt) return { error: 400 as const, message: "Arrive on site before completing the job" };
        if (job.status === "awaiting_parts" || job.status === "on_hold") {
          return {
            error: 400 as const,
            message: `This job is marked "${job.status === "awaiting_parts" ? "awaiting parts" : "on hold"}" in the POS — the office must clear that before it can be completed`,
          };
        }
        await closeOpenEntry();
        patch.workCompletedAt = now;
        if (job.status !== "ready") { patch.status = "ready"; toStatus = "ready"; }
        historyNote = `Work completed by ${staff.name}`;
        break;
      }
    }

    const [row] = await tx
      .update(workOrdersTable)
      .set(patch)
      .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)))
      .returning();

    await tx.insert(workOrderStatusHistoryTable).values({
      tenantId, workOrderId: id,
      fromStatus: job.status, toStatus,
      changedByStaffId: staff.id, changedByName: staff.name,
      note: historyNote,
    });

    return { row };
  });

  if ("error" in result) {
    if (result.error === 404) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(400).json({ error: result.message ?? "Cannot perform this action" });
    return;
  }
  res.json(toJob(result.row));
}

router.post("/fsm/jobs/:id/start-travel", (req, res) => execTransition(req as never, res as never, "start-travel"));
router.post("/fsm/jobs/:id/arrive", (req, res) => execTransition(req as never, res as never, "arrive"));
router.post("/fsm/jobs/:id/pause", (req, res) => execTransition(req as never, res as never, "pause"));
router.post("/fsm/jobs/:id/resume", (req, res) => execTransition(req as never, res as never, "resume"));
router.post("/fsm/jobs/:id/complete", (req, res) => execTransition(req as never, res as never, "complete"));

// ─── Notes ────────────────────────────────────────────────────────────────────

router.post("/fsm/jobs/:id/notes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staff = await getVerifiedStaff(req as never, tenantId);
  if (!staff) { res.status(401).json({ error: "Technician identity required" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = NoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Note content is required" }); return; }

  const [job] = await db
    .select({ id: workOrdersTable.id })
    .from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.id, id),
      eq(workOrdersTable.tenantId, tenantId),
      assignedToStaff(staff.id),
    ));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const [note] = await db.insert(workOrderNotesTable).values({
    tenantId, workOrderId: id,
    authorStaffId: staff.id, authorName: staff.name,
    content: parsed.data.content, isInternal: true,
  }).returning();

  res.status(201).json(note);
});

export default router;
