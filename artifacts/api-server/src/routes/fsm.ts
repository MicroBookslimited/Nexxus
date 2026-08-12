import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql, isNull } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderNotesTable,
  workOrderStatusHistoryTable,
  workOrderTimeEntriesTable,
  workOrderPhotosTable,
  customersTable,
  staffTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import {
  ServiceAreasSchema, InstallDetailsSchema,
  AllocationCreateSchema, AllocationUpdateSchema,
  createAllocation, updateAllocation, listAllocations,
  makePortalToken,
} from "./work-orders";
import {
  sendWorkOrderStatusEmail, sendWorkOrderSignedEmail,
  sendCompletionOtpEmail, sendWorkOrderReviewEmail,
} from "../lib/work-order-mail";
import { createHash, randomInt } from "node:crypto";
import { hashManagerCode, MANAGER_CODE_MAX_ATTEMPTS } from "../lib/manager-code";
import { getSetting } from "./settings";

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

type FsmStaff = { id: number; name: string; role: string };

async function getVerifiedStaff(
  req: { headers: Record<string, string | undefined> },
  tenantId: number,
): Promise<FsmStaff | null> {
  const raw = req.headers["x-staff-id"];
  const staffId = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(staffId)) return null;
  const [s] = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  return s ?? null;
}

/** Admins/managers get full access to all jobs from the mobile app.
 * Role values in the data are inconsistent ("Admin", "admin", "Manager"),
 * so match case-insensitively. */
export function isFsmAdmin(staff: FsmStaff): boolean {
  return /^(admin|manager|owner)$/i.test(staff.role.trim());
}

/** SQL condition: staff is the primary assignee OR appears in the JSONB id list. */
function assignedToStaff(staffId: number) {
  return sql`(${workOrdersTable.assignedStaffId} = ${staffId} OR ${workOrdersTable.assignedStaffIds} @> ${JSON.stringify([staffId])}::jsonb)`;
}

/** Job visibility scope: admins see every job in the tenant; technicians only theirs. */
function jobScope(staff: FsmStaff) {
  return isFsmAdmin(staff) ? sql`TRUE` : assignedToStaff(staff.id);
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
    customerId: w.customerId,
    assignedStaffIds: Array.isArray(w.assignedStaffIds) ? (w.assignedStaffIds as number[]) : [],
    estimatedMinutes: w.estimatedMinutes,
    appointmentDate: w.appointmentDate,
    promisedDate: w.promisedDate,
    notes: w.notes,
    total: w.total,
    depositPaid: w.depositPaid,
    travelStartedAt: w.travelStartedAt,
    arrivedAt: w.arrivedAt,
    workCompletedAt: w.workCompletedAt,
    // Signature image itself is only returned in the detail response
    completionSignedBy: w.completionSignedBy,
    completionSignedAt: w.completionSignedAt,
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
      jobScope(staff),
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
      jobScope(staff),
    ));
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }

  const [notes, history, timeEntries, photos] = await Promise.all([
    db.select().from(workOrderNotesTable)
      .where(and(eq(workOrderNotesTable.tenantId, tenantId), eq(workOrderNotesTable.workOrderId, id)))
      .orderBy(desc(workOrderNotesTable.createdAt)),
    db.select().from(workOrderStatusHistoryTable)
      .where(and(eq(workOrderStatusHistoryTable.tenantId, tenantId), eq(workOrderStatusHistoryTable.workOrderId, id)))
      .orderBy(desc(workOrderStatusHistoryTable.createdAt)),
    db.select().from(workOrderTimeEntriesTable)
      .where(and(eq(workOrderTimeEntriesTable.tenantId, tenantId), eq(workOrderTimeEntriesTable.workOrderId, id)))
      .orderBy(desc(workOrderTimeEntriesTable.startedAt)),
    db.select().from(workOrderPhotosTable)
      .where(and(eq(workOrderPhotosTable.tenantId, tenantId), eq(workOrderPhotosTable.workOrderId, id)))
      .orderBy(desc(workOrderPhotosTable.createdAt)),
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
    photos,
    completionSignature: row.workOrder.completionSignature,
    customerSignature: row.workOrder.customerSignature,
    // Line items shown to the customer in the pre-signature preview
    items: row.workOrder.items ?? [],
    subtotal: row.workOrder.subtotal,
    discountAmount: row.workOrder.discountAmount,
    tax: row.workOrder.tax,
    // Universal installation form
    serviceAreas: row.workOrder.serviceAreas ?? [],
    installDetails: row.workOrder.installDetails ?? {},
    // Materials & cable dispatched to this job
    allocations: await listAllocations(tenantId, id),
  });
});

/* ─── Material / cable allocations (field) ────────────────────────────────────
 * Technicians log cable runs and returns on jobs assigned to them; admins can
 * additionally dispatch new allocations from the phone (jobScope covers both). */
router.get("/fsm/jobs/:id/allocations", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never, { requireOpen: false });
  if (!ctx) return;
  res.json(await listAllocations(ctx.tenantId, ctx.job.id));
});

router.post("/fsm/jobs/:id/allocations", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  if (!isFsmAdmin(ctx.staff)) { res.status(403).json({ error: "Admin access required to dispatch materials" }); return; }
  const parsed = AllocationCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const result = await createAllocation(ctx.tenantId, ctx.job.id, { ...parsed.data, staffId: ctx.staff.id });
  if (result.error) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  res.status(201).json(result.allocation);
});

router.patch("/fsm/jobs/:id/allocations/:allocId", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const allocId = parseInt(String((req.params as Record<string, string>).allocId), 10);
  if (!Number.isInteger(allocId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AllocationUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Cable runs / remarks are work logs — require work to be started in the app.
  if ((parsed.data.runs !== undefined || parsed.data.remarks !== undefined) && !ctx.job.arrivedAt) {
    res.status(400).json({ error: "Start work first — tap Arrive on Site before logging cable runs" });
    return;
  }
  const result = await updateAllocation(ctx.tenantId, ctx.job.id, allocId, parsed.data);
  if (result.error) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  res.json(result.allocation);
});

const InstallDetailsBody = z.object({
  serviceAreas: ServiceAreasSchema.optional(),
  installDetails: InstallDetailsSchema.optional(),
});

/**
 * PATCH install-form answers from the technician. Merges section-by-section so
 * saving one section never wipes another (or answers entered in the web POS).
 */
router.patch("/fsm/jobs/:id/install-details", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const parsed = InstallDetailsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  if (ctx.job.status === "collected" || ctx.job.status === "cancelled") {
    res.status(400).json({ error: "This job is closed" }); return;
  }
  if (ctx.job.completionSignature || ctx.job.customerSignature) {
    res.status(400).json({ error: "The customer has signed off on this job — the form can no longer be changed" });
    return;
  }
  // Work can't be logged before the technician has started it in the app.
  if (!ctx.job.arrivedAt) {
    res.status(400).json({ error: "Start work first — tap Arrive on Site before filling the installation form" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.serviceAreas !== undefined) updates.serviceAreas = parsed.data.serviceAreas;
  if (parsed.data.installDetails !== undefined) {
    // Atomic section-level merge in SQL so concurrent saves (POS + technician
    // app, or two technicians) can't overwrite each other's sections.
    updates.installDetails = sql`coalesce(${workOrdersTable.installDetails}, '{}'::jsonb) || ${JSON.stringify(parsed.data.installDetails)}::jsonb`;
  }
  // Signature-null predicates make the freeze atomic — a sign-off committed
  // after the read above can't be overwritten by this update.
  const [row] = await db.update(workOrdersTable)
    .set(updates)
    .where(and(
      eq(workOrdersTable.id, ctx.job.id),
      eq(workOrdersTable.tenantId, ctx.tenantId),
      isNull(workOrdersTable.completionSignature),
      isNull(workOrdersTable.customerSignature),
    ))
    .returning();
  if (!row) {
    res.status(400).json({ error: "The customer has signed off on this job — the form can no longer be changed" });
    return;
  }
  res.json({
    serviceAreas: row.serviceAreas ?? [],
    installDetails: row.installDetails ?? {},
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

  let managerCode: string | null = null;
  if (action === "complete") {
    const body = req.body as { managerCode?: unknown } | null | undefined;
    if (typeof body?.managerCode === "string" && /^\d{6}$/.test(body.managerCode)) {
      managerCode = body.managerCode;
    }
  }

  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.id, id),
        eq(workOrdersTable.tenantId, tenantId),
        jobScope(staff),
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
        if (openEntry && openEntry.entryType === "work") {
          return { error: 400 as const, message: "Work is not paused" };
        }
        // No open entry happens when a completed job was reopened (completion
        // closed the clock) — resuming simply starts a fresh work entry.
        if (openEntry) await closeOpenEntry();
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
        // Completing WITHOUT a customer sign-off requires a manager code
        // (admins/managers/owners are exempt — they ARE management).
        if (!job.completionSignature && !isFsmAdmin(staff)) {
          if (!managerCode) {
            return { error: 400 as const, code: "MANAGER_CODE_REQUIRED" as const, message: "A manager completion code is required to complete without a customer sign-off — call the office to get one" };
          }
          const validCode =
            job.managerCodeHash != null &&
            job.managerCodeExpiresAt != null &&
            job.managerCodeExpiresAt > now &&
            job.managerCodeAttempts < MANAGER_CODE_MAX_ATTEMPTS &&
            job.managerCodeHash === hashManagerCode(managerCode, job.id, tenantId);
          if (!validCode) {
            if (!job.managerCodeHash || !job.managerCodeExpiresAt) {
              return { error: 400 as const, message: "No completion code has been issued — ask a manager to generate one" };
            }
            if (job.managerCodeExpiresAt <= now) {
              return { error: 400 as const, message: "The completion code has expired — ask a manager for a new one" };
            }
            if (job.managerCodeAttempts >= MANAGER_CODE_MAX_ATTEMPTS) {
              return { error: 400 as const, message: "Too many wrong attempts — ask a manager for a new code" };
            }
            // Wrong code: count the attempt against this generation.
            await tx.update(workOrdersTable)
              .set({ managerCodeAttempts: sql`${workOrdersTable.managerCodeAttempts} + 1` })
              .where(and(
                eq(workOrdersTable.id, job.id),
                eq(workOrdersTable.tenantId, tenantId),
                eq(workOrdersTable.managerCodeHash, job.managerCodeHash),
              ));
            return { error: 400 as const, message: "That completion code is incorrect" };
          }
        }
        // Any successful completion consumes an outstanding manager code so a
        // stale approval can't survive a reopen (mark-incomplete) cycle.
        patch.managerCodeHash = null;
        patch.managerCodeExpiresAt = null;
        patch.managerCodeAttempts = 0;
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

    return { row, fromStatus: job.status };
  });

  if ("error" in result) {
    if (result.error === 404) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(400).json({
      error: result.message ?? "Cannot perform this action",
      ...("code" in result && result.code ? { code: result.code } : {}),
    });
    return;
  }
  res.json(toJob(result.row));

  // Fire-and-forget: notify the customer (copied to accounts@) on any status change.
  if ("fromStatus" in result && result.row.status !== result.fromStatus) {
    sendWorkOrderStatusEmail({
      tenantId,
      workOrderNumber: result.row.workOrderNumber,
      contactName:     result.row.contactName,
      contactEmail:    result.row.contactEmail,
      customerId:      result.row.customerId,
      itemDescription: result.row.itemDescription,
      serviceChannel:  result.row.serviceChannel,
      fromStatus:      result.fromStatus ?? null,
      toStatus:        result.row.status,
      changedByName:   staff.name,
    }).catch(() => { /* logged inside */ });
  }

  // Completion just became durable: if a signature was captured beforehand
  // (normal mobile flow signs first), email the signed copy now.
  if (action === "complete" && "fromStatus" in result && result.row.workCompletedAt && result.row.completionSignature) {
    emailSignedCopy(tenantId, result.row).catch(() => { /* logged inside */ });
  }

  // After every completed job: ask the customer to rate the experience (once).
  if (action === "complete" && "fromStatus" in result && result.row.workCompletedAt) {
    sendReviewRequestOnce(tenantId, result.row).catch(() => { /* logged inside */ });
  }
}

/** Sends the review-request email exactly once per work order (atomic claim). */
async function sendReviewRequestOnce(tenantId: number, job: typeof workOrdersTable.$inferSelect): Promise<void> {
  const [claim] = await db.update(workOrdersTable)
    .set({ reviewEmailSentAt: new Date() })
    .where(and(
      eq(workOrdersTable.id, job.id),
      eq(workOrdersTable.tenantId, tenantId),
      isNull(workOrdersTable.reviewEmailSentAt),
    ))
    .returning({ id: workOrdersTable.id });
  if (!claim) return; // already sent
  try {
    await sendWorkOrderReviewEmail({
      tenantId,
      workOrderId: job.id,
      workOrderNumber: job.workOrderNumber,
      contactName: job.contactName,
      contactEmail: job.contactEmail,
      customerId: job.customerId,
      itemDescription: job.itemDescription,
      portalToken: makePortalToken(job.id, tenantId),
    });
  } catch (err) {
    // Release the claim so a later completion (or re-complete) can retry.
    await db.update(workOrdersTable)
      .set({ reviewEmailSentAt: null })
      .where(and(eq(workOrdersTable.id, job.id), eq(workOrdersTable.tenantId, tenantId)));
    throw err;
  }
}

router.post("/fsm/jobs/:id/start-travel", (req, res) => execTransition(req as never, res as never, "start-travel"));
router.post("/fsm/jobs/:id/arrive", (req, res) => execTransition(req as never, res as never, "arrive"));
router.post("/fsm/jobs/:id/pause", (req, res) => execTransition(req as never, res as never, "pause"));
router.post("/fsm/jobs/:id/resume", (req, res) => execTransition(req as never, res as never, "resume"));
router.post("/fsm/jobs/:id/complete", (req, res) => execTransition(req as never, res as never, "complete"));

// ─── Proof of work: photos + completion signature ─────────────────────────────

// ~4MB of base64 ≈ 3MB image; well under the 15mb body limit.
// Photos: raster formats ONLY (SVG would be stored active content rendered to office users).
const RASTER_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// Signatures are SVGs generated by our own pad, but still restricted to the safe subset below.
const SIGNATURE_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTOS_PER_JOB = 12;
const PhotoBody = z.object({
  image: z.string().regex(RASTER_DATA_URL_RE, "Must be a JPEG/PNG/WebP data URL").max(4_500_000),
  caption: z.string().max(200).optional(),
});
const SignatureBody = z.object({
  image: z.string().regex(SIGNATURE_DATA_URL_RE, "Must be an image data URL").max(1_500_000),
  signedBy: z.string().min(1).max(120),
});

/** Rejects SVG signature payloads containing anything beyond plain drawing markup. */
function isSafeSignatureSvg(dataUrl: string): boolean {
  if (!dataUrl.startsWith("data:image/svg+xml;base64,")) return true; // raster — fine
  let svg: string;
  try {
    svg = Buffer.from(dataUrl.split(",")[1] ?? "", "base64").toString("utf8");
  } catch {
    return false;
  }
  // No scripts, event handlers, external refs, or foreignObject
  if (/<\s*(script|foreignObject|iframe|use|image|a)\b/i.test(svg)) return false;
  if (/\bon[a-z]+\s*=/i.test(svg)) return false;
  if (/href|xlink/i.test(svg)) return false;
  return true;
}

/** Loads the job iff it's assigned to the verified staff member; null otherwise. */
async function loadAssignedJob(req: never, res: never, opts?: { requireOpen?: boolean }) {
  const rq = req as { params: Record<string, string> };
  const rs = res as { status: (n: number) => { json: (b: unknown) => void } };
  const tenantId = getTenantId(req);
  if (!tenantId) { rs.status(401).json({ error: "Unauthorized" }); return null; }
  const staff = await getVerifiedStaff(req, tenantId);
  if (!staff) { rs.status(401).json({ error: "Technician identity required" }); return null; }
  const id = parseInt(String(rq.params.id), 10);
  if (!Number.isInteger(id)) { rs.status(400).json({ error: "Invalid id" }); return null; }
  const [job] = await db.select().from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.id, id),
      eq(workOrdersTable.tenantId, tenantId),
      jobScope(staff),
    ));
  if (!job) { rs.status(404).json({ error: "Job not found" }); return null; }
  if (opts?.requireOpen !== false && (job.status === "collected" || job.status === "cancelled")) {
    rs.status(400).json({ error: "This job is closed" });
    return null;
  }
  return { tenantId, staff, job };
}

router.post("/fsm/jobs/:id/photos", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const parsed = PhotoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid photo is required" }); return; }
  if (ctx.job.assignmentStatus !== "accepted") {
    res.status(400).json({ error: "Accept the job before adding photos" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workOrderPhotosTable)
    .where(and(
      eq(workOrderPhotosTable.tenantId, ctx.tenantId),
      eq(workOrderPhotosTable.workOrderId, ctx.job.id),
    ));
  if (count >= MAX_PHOTOS_PER_JOB) {
    res.status(400).json({ error: `A job can have at most ${MAX_PHOTOS_PER_JOB} photos` });
    return;
  }
  const [photo] = await db.insert(workOrderPhotosTable).values({
    tenantId: ctx.tenantId, workOrderId: ctx.job.id,
    staffId: ctx.staff.id, staffName: ctx.staff.name,
    data: parsed.data.image, caption: parsed.data.caption ?? null,
  }).returning();
  res.status(201).json(photo);
});

router.delete("/fsm/jobs/:id/photos/:photoId", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const photoId = parseInt(String(req.params.photoId), 10);
  if (!Number.isInteger(photoId)) { res.status(400).json({ error: "Invalid photo id" }); return; }
  // Technicians can only remove their own photos, and not after completion
  if (ctx.job.workCompletedAt) {
    res.status(400).json({ error: "Photos are locked once work is completed" });
    return;
  }
  const [deleted] = await db.delete(workOrderPhotosTable)
    .where(and(
      eq(workOrderPhotosTable.id, photoId),
      eq(workOrderPhotosTable.tenantId, ctx.tenantId),
      eq(workOrderPhotosTable.workOrderId, ctx.job.id),
      eq(workOrderPhotosTable.staffId, ctx.staff.id),
    ))
    .returning({ id: workOrderPhotosTable.id });
  if (!deleted) { res.status(404).json({ error: "Photo not found" }); return; }
  res.json({ ok: true });
});

router.post("/fsm/jobs/:id/signature", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const parsed = SignatureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A signature and signer name are required" }); return; }
  if (ctx.job.assignmentStatus !== "accepted" || !ctx.job.arrivedAt) {
    res.status(400).json({ error: "Arrive on site before capturing a signature" });
    return;
  }
  if (!isSafeSignatureSvg(parsed.data.image)) {
    res.status(400).json({ error: "Invalid signature image" });
    return;
  }
  const now = new Date();
  // One-shot guarantee: conditional update — only the first writer wins,
  // and the history row is only written when the update actually applied.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.update(workOrdersTable)
      .set({
        completionSignature: parsed.data.image,
        completionSignedBy: parsed.data.signedBy,
        completionSignedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(workOrdersTable.id, ctx.job.id),
        eq(workOrdersTable.tenantId, ctx.tenantId),
        sql`${workOrdersTable.completionSignature} IS NULL`,
      ))
      .returning({ id: workOrdersTable.id });
    if (!row) return false;
    await tx.insert(workOrderStatusHistoryTable).values({
      tenantId: ctx.tenantId, workOrderId: ctx.job.id,
      fromStatus: ctx.job.status, toStatus: ctx.job.status,
      changedByStaffId: ctx.staff.id, changedByName: ctx.staff.name,
      note: `Customer sign-off captured from ${parsed.data.signedBy}`,
    });
    return true;
  });
  if (!claimed) {
    res.status(409).json({ error: "A completion signature was already captured" });
    return;
  }
  res.json({ ok: true, completionSignedBy: parsed.data.signedBy, completionSignedAt: now });

  // The signed copy is only emailed once work is durably completed. In the
  // normal mobile flow (sign → complete) the complete transition sends it;
  // this covers signing AFTER completion.
  if (ctx.job.workCompletedAt) {
    emailSignedCopy(ctx.tenantId, {
      ...ctx.job,
      completionSignature: parsed.data.image,
      completionSignedBy: parsed.data.signedBy,
      completionSignedAt: now,
    }).catch(() => { /* logged inside */ });
  }
});

/* ─── Completion verification by email OTP ────────────────────────────────────
 * Alternative to the drawn signature: the customer receives a 6-digit code by
 * email and reads it back to the technician. Verifying it records the sign-off
 * (completionSignature sentinel "otp-verified") so the same freeze applies. */

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
export const OTP_SIGNATURE_SENTINEL = "otp-verified";

function hashOtp(code: string, woId: number, tenantId: number): string {
  const secret = process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
  return createHash("sha256").update(`${secret}:${tenantId}:${woId}:${code}`).digest("hex");
}

router.post("/fsm/jobs/:id/send-completion-otp", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  if (ctx.job.assignmentStatus !== "accepted" || !ctx.job.arrivedAt) {
    res.status(400).json({ error: "Arrive on site before requesting a verification code" });
    return;
  }
  if (ctx.job.completionSignature) {
    res.status(409).json({ error: "This job is already signed off" });
    return;
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  const sent = await sendCompletionOtpEmail({
    tenantId: ctx.tenantId,
    workOrderNumber: ctx.job.workOrderNumber,
    contactName: ctx.job.contactName,
    contactEmail: ctx.job.contactEmail,
    customerId: ctx.job.customerId,
    itemDescription: ctx.job.itemDescription,
    code,
    expiresMinutes: OTP_TTL_MINUTES,
  }).catch((err) => ({ error: err instanceof Error ? err.message : "Failed to send email" }));
  if ("error" in sent) { res.status(400).json({ error: sent.error }); return; }

  // Store the hash only after the email actually went out.
  await db.update(workOrdersTable)
    .set({
      completionOtpHash: hashOtp(code, ctx.job.id, ctx.tenantId),
      completionOtpExpiresAt: expiresAt,
      completionOtpAttempts: 0,
      updatedAt: new Date(),
    })
    .where(and(eq(workOrdersTable.id, ctx.job.id), eq(workOrdersTable.tenantId, ctx.tenantId)));

  // Mask the recipient so the technician sees where it went without full PII.
  const masked = sent.sentTo.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
  res.json({ ok: true, sentTo: masked, expiresMinutes: OTP_TTL_MINUTES });
});

const VerifyOtpBody = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  verifiedBy: z.string().min(1).max(120),
});

router.post("/fsm/jobs/:id/verify-completion-otp", async (req, res): Promise<void> => {
  const ctx = await loadAssignedJob(req as never, res as never);
  if (!ctx) return;
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter the 6-digit code and the customer's name" }); return; }
  const expectedHash = hashOtp(parsed.data.code, ctx.job.id, ctx.tenantId);
  const now = new Date();

  // Atomic claim: hash match, not expired, attempts under limit, and no
  // sign-off yet — all validated INSIDE the UPDATE predicate so a concurrent
  // resend (which replaces the hash) or a second verifier can't slip through.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.update(workOrdersTable)
      .set({
        completionSignature: OTP_SIGNATURE_SENTINEL,
        completionSignedBy: parsed.data.verifiedBy,
        completionSignedAt: now,
        completionVerifiedVia: "otp",
        completionOtpHash: null,
        completionOtpExpiresAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(workOrdersTable.id, ctx.job.id),
        eq(workOrdersTable.tenantId, ctx.tenantId),
        eq(workOrdersTable.completionOtpHash, expectedHash),
        sql`${workOrdersTable.completionOtpExpiresAt} > now()`,
        sql`${workOrdersTable.completionOtpAttempts} < ${OTP_MAX_ATTEMPTS}`,
        sql`${workOrdersTable.completionSignature} IS NULL`,
      ))
      .returning({ id: workOrdersTable.id });
    if (!row) return false;
    await tx.insert(workOrderStatusHistoryTable).values({
      tenantId: ctx.tenantId, workOrderId: ctx.job.id,
      fromStatus: ctx.job.status, toStatus: ctx.job.status,
      changedByStaffId: ctx.staff.id, changedByName: ctx.staff.name,
      note: `Completion verified by email code from ${parsed.data.verifiedBy}`,
    });
    return true;
  });

  if (!claimed) {
    // Work out why, in priority order, from the current row state.
    const [fresh] = await db.select({
      completionSignature: workOrdersTable.completionSignature,
      hash: workOrdersTable.completionOtpHash,
      expiresAt: workOrdersTable.completionOtpExpiresAt,
      attempts: workOrdersTable.completionOtpAttempts,
    }).from(workOrdersTable)
      .where(and(eq(workOrdersTable.id, ctx.job.id), eq(workOrdersTable.tenantId, ctx.tenantId)));
    if (fresh?.completionSignature) { res.status(409).json({ error: "A completion sign-off was already captured" }); return; }
    if (!fresh?.hash || !fresh.expiresAt) { res.status(400).json({ error: "No code has been sent — send the verification email first" }); return; }
    if (fresh.expiresAt < new Date()) { res.status(400).json({ error: "The code has expired — send a new one" }); return; }
    if (fresh.attempts >= OTP_MAX_ATTEMPTS) { res.status(400).json({ error: "Too many wrong attempts — send a new code" }); return; }
    // Wrong code: count the attempt against the SAME generation only.
    await db.update(workOrdersTable)
      .set({ completionOtpAttempts: sql`${workOrdersTable.completionOtpAttempts} + 1` })
      .where(and(
        eq(workOrdersTable.id, ctx.job.id),
        eq(workOrdersTable.tenantId, ctx.tenantId),
        eq(workOrdersTable.completionOtpHash, fresh.hash),
      ));
    res.status(400).json({ error: "That code is incorrect" });
    return;
  }
  res.json({ ok: true, completionSignedBy: parsed.data.verifiedBy, completionSignedAt: now, verifiedVia: "otp" });
});

/**
 * Fire-and-forget: emails the signed completion copy (PDF with the drawn
 * signature) to the customer, copied to accounts@. Callers ensure the job is
 * completed AND signed before invoking.
 */
async function emailSignedCopy(tenantId: number, job: typeof workOrdersTable.$inferSelect): Promise<void> {
  if (!job.completionSignature || !job.completionSignedBy) return;
  const currency = await getSetting("currency", tenantId).catch(() => "JMD");
  const staffIds: number[] = Array.isArray(job.assignedStaffIds) ? job.assignedStaffIds as number[] : [];
  await sendWorkOrderSignedEmail({
    tenantId,
    workOrderId:       job.id,
    workOrderNumber:   job.workOrderNumber,
    contactName:       job.contactName,
    contactEmail:      job.contactEmail,
    customerId:        job.customerId,
    assignedStaffId:   job.assignedStaffId,
    assignedStaffIds:  staffIds,
    itemDescription:   job.itemDescription,
    problemDescription: job.problemDescription,
    notes:             job.notes,
    scheduledDate:     job.appointmentDate ? String(job.appointmentDate) : null,
    promisedDate:      job.promisedDate ? String(job.promisedDate) : null,
    lineItems:         (job.items ?? []).map((it) => ({
      description: it.description,
      quantity:    it.quantity,
      unitPrice:   it.price,
    })),
    currency:          currency || "JMD",
    signature: {
      svgDataUrl: job.completionSignature,
      signedBy:   job.completionSignedBy,
      signedAt:   job.completionSignedAt ?? new Date(),
    },
  });
}

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
      jobScope(staff),
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
