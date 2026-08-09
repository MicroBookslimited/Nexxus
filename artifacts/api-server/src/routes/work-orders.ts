import { Router, type IRouter } from "express";
import { and, eq, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import {
  db,
  workOrdersTable,
  workOrderNotesTable,
  workOrderPhotosTable,
  workOrderStatusHistoryTable,
  workOrderAppointmentsTable,
  customersTable,
  staffTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { getSetting } from "./settings";
import { sendWorkOrderEmail, sendWorkOrderStatusEmail } from "../lib/work-order-mail";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function getStaffId(req: { headers: Record<string, string | undefined> }): number | null {
  const raw = req.headers["x-staff-id"];
  const n = raw ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Status constants ──────────────────────────────────────────────────────── */
export const WORK_ORDER_STATUSES = [
  "received",
  "in_progress",
  "awaiting_parts",
  "on_hold",
  "ready",
  "collected",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

// Legal transitions. Converting to a sale may jump directly to collected.
const STATUS_FLOW: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received: ["in_progress", "awaiting_parts", "on_hold", "cancelled"],
  in_progress: ["ready", "awaiting_parts", "on_hold", "received", "cancelled"],
  awaiting_parts: ["in_progress", "on_hold", "cancelled"],
  on_hold: ["in_progress", "awaiting_parts", "received", "cancelled"],
  ready: ["collected", "in_progress", "cancelled"],
  collected: [],
  cancelled: [],
};

/* ─── Validation schemas ─────────────────────────────────────────────────────── */
/* Universal installation form — service areas + JSONB details */
export const SERVICE_AREA_IDS = ["pos", "networking", "pc", "access_control", "cctv", "other"] as const;
export const ServiceAreasSchema = z.array(z.enum(SERVICE_AREA_IDS)).max(SERVICE_AREA_IDS.length);
export const InstallDetailsSchema = z
  .record(z.string().max(60), z.record(z.string().max(60), z.unknown()))
  .refine((v) => JSON.stringify(v).length <= 100_000, { message: "Installation details too large" });

const WorkOrderItemSchema = z.object({
  type: z.enum(["part", "labor", "fee"]),
  productId: z.number().int().positive().optional(),
  description: z.string().min(1),
  price: z.number().nonnegative().finite(),
  quantity: z.number().positive().finite(),
  isTaxable: z.boolean().optional(),
  costPrice: z.number().nonnegative().optional(),
});

const CreateWorkOrderBody = z.object({
  customerId: z.number().int().optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().max(200).optional(),
  itemDescription: z.string().min(1).max(500),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  imei: z.string().max(50).optional(),
  assetTag: z.string().max(50).optional(),
  colour: z.string().max(50).optional(),
  conditionReceived: z.string().max(200).optional(),
  accessoriesReceived: z.string().max(500).optional(),
  problemDescription: z.string().min(1).max(2000),
  serviceType: z.string().max(100).optional(),
  serviceChannel: z.enum(["in_store", "on_site", "pickup", "delivery", "remote"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent", "emergency"]).optional(),
  assignedStaffId: z.number().int().optional(),
  assignedStaffIds: z.array(z.number().int()).optional(),
  promisedDate: z.coerce.date().optional(),
  appointmentDate: z.coerce.date().optional(),
  storageLocation: z.string().max(100).optional(),
  depositRequired: z.number().nonnegative().optional(),
  items: z.array(WorkOrderItemSchema).default([]),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountAmount: z.number().nonnegative().optional(),
  serviceAreas: ServiceAreasSchema.optional(),
  installDetails: InstallDetailsSchema.optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
});

const UpdateWorkOrderBody = z.object({
  customerId: z.number().int().nullable().optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().max(200).nullable().optional(),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  itemDescription: z.string().min(1).max(500).optional(),
  brand: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  serialNumber: z.string().max(100).nullable().optional(),
  imei: z.string().max(50).nullable().optional(),
  assetTag: z.string().max(50).nullable().optional(),
  colour: z.string().max(50).nullable().optional(),
  conditionReceived: z.string().max(200).nullable().optional(),
  accessoriesReceived: z.string().max(500).nullable().optional(),
  problemDescription: z.string().min(1).max(2000).optional(),
  diagnosis: z.string().max(2000).optional(),
  serviceType: z.string().max(100).nullable().optional(),
  serviceChannel: z.enum(["in_store", "on_site", "pickup", "delivery", "remote"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent", "emergency"]).optional(),
  assignedStaffId: z.number().int().nullable().optional(),
  assignedStaffIds: z.array(z.number().int()).nullable().optional(),
  promisedDate: z.coerce.date().nullable().optional(),
  appointmentDate: z.coerce.date().nullable().optional(),
  storageLocation: z.string().max(100).nullable().optional(),
  depositRequired: z.number().nonnegative().nullable().optional(),
  depositPaid: z.number().nonnegative().optional(),
  items: z.array(WorkOrderItemSchema).optional(),
  discountType: z.enum(["percent", "fixed"]).nullable().optional(),
  discountAmount: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  convertedOrderId: z.number().int().optional(),
  serviceAreas: ServiceAreasSchema.optional(),
  installDetails: InstallDetailsSchema.optional(),
  statusNote: z.string().max(500).optional(), // optional note attached to status change
  customerSignature: z.string().optional(),   // base64 PNG data URL
  staffSignature: z.string().optional(),       // base64 PNG data URL
});

/* ─── Financial helpers ──────────────────────────────────────────────────────── */
async function computeTotals(
  tenantId: number,
  items: Array<{ price: number; quantity: number; isTaxable?: boolean }>,
  discountInput: number | undefined | null,
  discountType: "percent" | "fixed" | undefined | null,
) {
  const taxRate = parseFloat((await getSetting("tax_rate", tenantId)) || "15") / 100;
  const taxMode = ((await getSetting("tax_mode", tenantId)) ?? "exclusive") as "exclusive" | "inclusive";
  const subtotal = items.reduce((s, c) => s + c.price * c.quantity, 0);
  const rawDiscount =
    discountInput && discountInput > 0
      ? discountType === "percent"
        ? subtotal * (discountInput / 100)
        : discountInput
      : 0;
  const discount = Math.min(Math.max(0, rawDiscount), subtotal);
  const taxBase = items.reduce((s, c) => (c.isTaxable === false ? s : s + c.price * c.quantity), 0);
  const taxableShare = subtotal > 0 ? taxBase / subtotal : 1;
  const taxableAfterDiscount = Math.max(0, taxBase - discount * taxableShare);
  const tax =
    taxMode === "inclusive"
      ? (taxableAfterDiscount * taxRate) / (1 + taxRate)
      : taxableAfterDiscount * taxRate;
  const total = subtotal - discount + (taxMode === "exclusive" ? tax : 0);
  return { subtotal: r2(subtotal), discount: r2(discount), tax: r2(tax), total: r2(total) };
}

/* ─── Numbering: WO-YY-NNNN ─────────────────────────────────────────────────── */
async function nextWorkOrderNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: number,
): Promise<string> {
  const nowJa = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = nowJa.getUTCFullYear();
  const yy = String(year).slice(-2);
  const yearStart = new Date(`${year}-01-01T05:00:00.000Z`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${tenantId}, ${year + 200000})`);
  const [{ cnt }] = await tx
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(workOrdersTable)
    .where(and(eq(workOrdersTable.tenantId, tenantId), gte(workOrdersTable.createdAt, yearStart)));
  const seq = String((cnt ?? 0) + 1).padStart(4, "0");
  return `WO-${yy}-${seq}`;
}

/* ─── Validation helpers ─────────────────────────────────────────────────────── */
async function validateRefs(
  tenantId: number,
  customerId?: number | null,
  assignedStaffId?: number | null,
  assignedStaffIds?: number[] | null,
): Promise<string | null> {
  if (customerId != null) {
    const [c] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.tenantId, tenantId)));
    if (!c) return "Customer not found";
  }
  // Validate all staff IDs (assignedStaffIds takes precedence; fall back to single ID)
  const staffIds = assignedStaffIds && assignedStaffIds.length > 0
    ? assignedStaffIds
    : assignedStaffId != null ? [assignedStaffId] : [];
  if (staffIds.length > 0) {
    const rows = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(and(eq(staffTable.tenantId, tenantId), inArray(staffTable.id, staffIds)));
    if (rows.length !== staffIds.length) return "One or more staff members not found";
  }
  return null;
}

/** Batch-lookup staff names for multiple work orders' assignedStaffIds arrays. */
async function batchResolveStaffNames(
  tenantId: number,
  allIds: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(allIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenantId), inArray(staffTable.id, unique)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/* ─── Work order normalise ───────────────────────────────────────────────────── */
type WorkOrderRow = typeof workOrdersTable.$inferSelect;
/* ─── HMAC portal token (lets customers check their own job status) ────────── */
function makePortalToken(woId: number, tenantId: number): string {
  const secret = process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
  return createHmac("sha256", secret).update(`wo:${woId}:${tenantId}`).digest("hex").slice(0, 16);
}

function normalize(
  w: WorkOrderRow,
  customerName?: string | null,
  customerPhone?: string | null,
  staffName?: string | null,
  staffNamesMap?: Map<number, string>,
) {
  const ids: number[] = Array.isArray(w.assignedStaffIds) ? w.assignedStaffIds as number[] : [];
  const assignedStaffNames = staffNamesMap && ids.length > 0
    ? ids.map((id) => staffNamesMap.get(id) ?? "").filter(Boolean)
    : staffName ? [staffName] : undefined;
  return {
    ...w,
    assignedStaffIds: ids,
    customerName: customerName ?? undefined,
    customerPhone: customerPhone ?? undefined,
    assignedStaffName: assignedStaffNames?.[0] ?? staffName ?? undefined,
    assignedStaffNames: assignedStaffNames,
    portalToken: makePortalToken(w.id, w.tenantId),
  };
}

/* ─── Routes ─────────────────────────────────────────────────────────────────── */

// LIST
router.get("/work-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = req.query.status ? String(req.query.status) : undefined;
  const conditions = [eq(workOrdersTable.tenantId, tenantId)];
  if (status && status !== "all" && WORK_ORDER_STATUSES.includes(status as WorkOrderStatus)) {
    conditions.push(eq(workOrdersTable.status, status));
  }

  const rows = await db
    .select({
      workOrder: workOrdersTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      staffName: staffTable.name,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)))
    .leftJoin(staffTable, and(eq(workOrdersTable.assignedStaffId, staffTable.id), eq(staffTable.tenantId, tenantId)))
    .where(and(...conditions))
    .orderBy(desc(workOrdersTable.createdAt))
    .limit(500);

  // Batch-resolve all staff names across the full result set
  const allStaffIds = rows.flatMap((r) =>
    Array.isArray(r.workOrder.assignedStaffIds) ? (r.workOrder.assignedStaffIds as number[]) : [],
  );
  const staffNamesMap = await batchResolveStaffNames(tenantId, allStaffIds);
  res.json(rows.map((r) => normalize(r.workOrder, r.customerName, r.customerPhone, r.staffName, staffNamesMap)));
});

// GET ONE
router.get("/work-orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      workOrder: workOrdersTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      staffName: staffTable.name,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)))
    .leftJoin(staffTable, and(eq(workOrdersTable.assignedStaffId, staffTable.id), eq(staffTable.tenantId, tenantId)))
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));

  if (!row) { res.status(404).json({ error: "Work order not found" }); return; }
  const woIds: number[] = Array.isArray(row.workOrder.assignedStaffIds) ? row.workOrder.assignedStaffIds as number[] : [];
  const staffNamesMap = await batchResolveStaffNames(tenantId, woIds);
  res.json(normalize(row.workOrder, row.customerName, row.customerPhone, row.staffName, staffNamesMap));
});

// CREATE
router.post("/work-orders", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  if (data.customerId == null && !data.contactName) {
    res.status(400).json({ error: "Link a customer or provide a contact name" });
    return;
  }
  // Resolve the canonical staff ID list: assignedStaffIds overrides the legacy single ID
  const staffIds = data.assignedStaffIds && data.assignedStaffIds.length > 0
    ? data.assignedStaffIds
    : data.assignedStaffId != null ? [data.assignedStaffId] : [];
  const primaryStaffId = staffIds[0] ?? null;

  const refError = await validateRefs(tenantId, data.customerId, null, staffIds.length > 0 ? staffIds : null);
  if (refError) { res.status(400).json({ error: refError }); return; }

  const totals = await computeTotals(tenantId, data.items, data.discountAmount, data.discountType);

  const row = await db.transaction(async (tx) => {
    const workOrderNumber = await nextWorkOrderNumber(tx, tenantId);
    const [created] = await tx
      .insert(workOrdersTable)
      .values({
        tenantId,
        workOrderNumber,
        customerId: data.customerId ?? null,
        contactName: data.contactName ?? null,
        contactPhone: data.contactPhone ?? null,
        contactEmail: data.contactEmail ?? null,
        itemDescription: data.itemDescription,
        brand: data.brand ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        imei: data.imei ?? null,
        assetTag: data.assetTag ?? null,
        colour: data.colour ?? null,
        conditionReceived: data.conditionReceived ?? null,
        accessoriesReceived: data.accessoriesReceived ?? null,
        problemDescription: data.problemDescription,
        serviceType: data.serviceType ?? null,
        serviceChannel: data.serviceChannel ?? "in_store",
        priority: data.priority ?? "normal",
        assignedStaffId: primaryStaffId,
        assignedStaffIds: staffIds,
        promisedDate: data.promisedDate ?? null,
        appointmentDate: data.appointmentDate ?? null,
        storageLocation: data.storageLocation ?? null,
        serviceAreas: data.serviceAreas ?? [],
        installDetails: (data.installDetails ?? {}) as Record<string, Record<string, unknown>>,
        depositRequired: data.depositRequired ?? null,
        depositPaid: 0,
        items: data.items,
        subtotal: totals.subtotal,
        discountType: totals.discount > 0 ? (data.discountType ?? "fixed") : null,
        discountAmount: totals.discount > 0 ? totals.discount : null,
        tax: totals.tax,
        total: totals.total,
        status: "received",
        notes: data.notes ?? null,
        internalNotes: data.internalNotes ?? null,
      })
      .returning();

    // Seed initial status history
    await tx.insert(workOrderStatusHistoryTable).values({
      tenantId,
      workOrderId: created.id,
      fromStatus: null,
      toStatus: "received",
      changedByName: "System",
      note: "Work order created",
    });

    return created;
  });

  const createdIds: number[] = Array.isArray(row.assignedStaffIds) ? row.assignedStaffIds as number[] : [];
  const createdStaffMap = await batchResolveStaffNames(tenantId, createdIds);
  res.status(201).json(normalize(row, undefined, undefined, undefined, createdStaffMap));

  // Fire-and-forget — never blocks the HTTP response
  const currency = await getSetting("currency", tenantId).catch(() => "JMD");
  sendWorkOrderEmail({
    tenantId,
    workOrderId:       row.id,
    workOrderNumber:   row.workOrderNumber,
    contactName:       row.contactName,
    contactEmail:      row.contactEmail,
    customerId:        row.customerId,
    assignedStaffId:   row.assignedStaffId,
    assignedStaffIds:  createdIds,
    itemDescription:   row.itemDescription,
    problemDescription: row.problemDescription,
    notes:             row.notes,
    scheduledDate:     row.appointmentDate ? String(row.appointmentDate) : null,
    promisedDate:      row.promisedDate ? String(row.promisedDate) : null,
    lineItems:         (row.items ?? []).map((it) => ({
      description: it.description,
      quantity:    it.quantity,
      unitPrice:   it.price,
    })),
    currency: currency || "JMD",
  }).catch(() => { /* already logged inside sendWorkOrderEmail */ });
});

// UPDATE
router.patch("/work-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  const [existing] = await db
    .select()
    .from(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Work order not found" }); return; }

  // Validate status transition
  if (data.status && data.status !== existing.status) {
    const allowed = STATUS_FLOW[existing.status as WorkOrderStatus] ?? [];
    const isConversion =
      data.convertedOrderId != null &&
      data.status === "collected" &&
      (existing.status === "ready" || existing.status === "in_progress" || existing.status === "awaiting_parts");
    if (!allowed.includes(data.status) && !isConversion) {
      res.status(400).json({ error: `Cannot move from ${existing.status} to ${data.status}` });
      return;
    }
  }
  // Require both digital signatures when manually marking as collected (not via POS sale)
  if (data.status === "collected" && existing.status !== "collected" && !data.convertedOrderId) {
    if (!data.customerSignature || !data.staffSignature) {
      res.status(400).json({ error: "Both customer and staff signatures are required to mark a work order as collected." });
      return;
    }
  }

  if (existing.status === "collected" || existing.status === "cancelled") {
    const touched = Object.keys(data).filter((k) => !["notes", "internalNotes"].includes(k));
    if (touched.length > 0) {
      res.status(400).json({ error: "This work order is closed" });
      return;
    }
  }

  // Resolve the canonical staff ID list for update
  const updStaffIds = data.assignedStaffIds != null
    ? data.assignedStaffIds
    : data.assignedStaffId !== undefined
      ? (data.assignedStaffId != null ? [data.assignedStaffId] : [])
      : null; // null = not being changed

  const updPrimaryStaffId = updStaffIds != null ? (updStaffIds[0] ?? null) : undefined;

  const refError = await validateRefs(tenantId, data.customerId ?? undefined, null, updStaffIds ?? undefined);
  if (refError) { res.status(400).json({ error: refError }); return; }

  const updates: Partial<typeof workOrdersTable.$inferInsert> = { updatedAt: new Date() };

  // Handle staff assignment update
  if (updStaffIds !== null) {
    updates.assignedStaffIds = updStaffIds;
    updates.assignedStaffId = updPrimaryStaffId ?? null;
    // FSM: a change in who is assigned resets the technician acceptance flow.
    const prevIds: number[] = Array.isArray(existing.assignedStaffIds) ? existing.assignedStaffIds as number[] : [];
    const changed = prevIds.length !== updStaffIds.length || prevIds.some((v, i) => v !== updStaffIds[i]);
    if (changed) {
      updates.assignmentStatus = "pending";
      updates.assignmentRespondedAt = null;
      updates.declineReason = null;
    }
  }

  const textFields = [
    "customerId", "status", "diagnosis", "promisedDate", "appointmentDate",
    "notes", "internalNotes", "contactName", "contactPhone", "contactEmail",
    "itemDescription", "problemDescription", "convertedOrderId", "brand", "model",
    "serialNumber", "imei", "assetTag", "colour", "conditionReceived", "accessoriesReceived",
    "serviceType", "serviceChannel", "priority", "storageLocation",
    "depositRequired", "depositPaid",
    "customerSignature", "staffSignature",
  ] as const;
  for (const f of textFields) {
    if (data[f] !== undefined) (updates as Record<string, unknown>)[f] = data[f];
  }
  if (data.serviceAreas !== undefined) updates.serviceAreas = data.serviceAreas;
  if (data.installDetails !== undefined) {
    // Atomic section-level merge in SQL so concurrent saves (POS + technician
    // app) can't overwrite each other's sections.
    updates.installDetails = sql`coalesce(${workOrdersTable.installDetails}, '{}'::jsonb) || ${JSON.stringify(data.installDetails)}::jsonb` as unknown as Record<string, Record<string, unknown>>;
  }

  if (data.items !== undefined || data.discountAmount !== undefined || data.discountType !== undefined) {
    const items = data.items ?? existing.items;
    const totals = await computeTotals(
      tenantId,
      items ?? [],
      data.discountAmount ?? existing.discountAmount,
      (data.discountType ?? existing.discountType ?? undefined) as "percent" | "fixed" | undefined,
    );
    updates.items = items ?? [];
    updates.subtotal = totals.subtotal;
    updates.discountType = totals.discount > 0 ? (data.discountType ?? existing.discountType ?? "fixed") : null;
    updates.discountAmount = totals.discount > 0 ? totals.discount : null;
    updates.tax = totals.tax;
    updates.total = totals.total;
  }

  const staffId = getStaffId(req as never);

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(workOrdersTable)
      .set(updates)
      .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)))
      .returning();

    // Record status change in history
    if (data.status && data.status !== existing.status) {
      let staffName: string | null = null;
      if (staffId) {
        const [s] = await tx.select({ name: staffTable.name }).from(staffTable)
          .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
        staffName = s?.name ?? null;
      }
      await tx.insert(workOrderStatusHistoryTable).values({
        tenantId,
        workOrderId: id,
        fromStatus: existing.status,
        toStatus: data.status,
        changedByStaffId: staffId,
        changedByName: staffName,
        note: data.statusNote ?? null,
      });
    }
    return updated;
  });

  const updatedIds: number[] = Array.isArray(row.assignedStaffIds) ? row.assignedStaffIds as number[] : [];
  const updStaffNamesMap = await batchResolveStaffNames(tenantId, updatedIds);
  res.json(normalize(row, undefined, undefined, undefined, updStaffNamesMap));

  // Fire-and-forget: notify the customer (copied to accounts@) on any status change.
  if (data.status && data.status !== existing.status) {
    sendWorkOrderStatusEmail({
      tenantId,
      workOrderNumber: row.workOrderNumber,
      contactName:     row.contactName,
      contactEmail:    row.contactEmail,
      customerId:      row.customerId,
      itemDescription: row.itemDescription,
      serviceChannel:  row.serviceChannel,
      fromStatus:      existing.status,
      toStatus:        row.status,
    }).catch(() => { /* logged inside */ });
  }
});

// DELETE
router.delete("/work-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Work order not found" }); return; }
  if (existing.status !== "cancelled" && existing.status !== "received") {
    res.status(400).json({ error: "Only received or cancelled work orders can be deleted" });
    return;
  }

  await db.delete(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  res.sendStatus(204);
});

/* ─── Photos (FSM proof-of-work, read-only for the office) ──────────────────── */

router.get("/work-orders/:id/photos", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const photos = await db
    .select()
    .from(workOrderPhotosTable)
    .where(and(eq(workOrderPhotosTable.workOrderId, id), eq(workOrderPhotosTable.tenantId, tenantId)))
    .orderBy(desc(workOrderPhotosTable.createdAt));
  res.json(photos);
});

/* ─── Notes ─────────────────────────────────────────────────────────────────── */

router.get("/work-orders/:id/notes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const notes = await db
    .select()
    .from(workOrderNotesTable)
    .where(and(eq(workOrderNotesTable.workOrderId, id), eq(workOrderNotesTable.tenantId, tenantId)))
    .orderBy(desc(workOrderNotesTable.createdAt));
  res.json(notes);
});

const CreateNoteBody = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional().default(true),
});

router.post("/work-orders/:id/notes", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify work order exists and belongs to tenant
  const [wo] = await db.select({ id: workOrdersTable.id })
    .from(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  if (!wo) { res.status(404).json({ error: "Work order not found" }); return; }

  const staffId = getStaffId(req as never);
  let staffName: string | null = null;
  if (staffId) {
    const [s] = await db.select({ name: staffTable.name }).from(staffTable)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
    staffName = s?.name ?? null;
  }

  const [note] = await db.insert(workOrderNotesTable)
    .values({
      tenantId,
      workOrderId: id,
      authorStaffId: staffId,
      authorName: staffName,
      content: parsed.data.content,
      isInternal: parsed.data.isInternal ?? true,
    })
    .returning();
  res.status(201).json(note);
});

router.delete("/work-orders/:id/notes/:noteId", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const noteId = parseInt(String(req.params.noteId), 10);
  if (!Number.isInteger(noteId)) { res.status(400).json({ error: "Invalid note id" }); return; }

  const [deleted] = await db.delete(workOrderNotesTable)
    .where(and(eq(workOrderNotesTable.id, noteId), eq(workOrderNotesTable.tenantId, tenantId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Note not found" }); return; }
  res.sendStatus(204);
});

/* ─── Status History ─────────────────────────────────────────────────────────── */

router.get("/work-orders/:id/history", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(workOrderStatusHistoryTable)
    .where(and(eq(workOrderStatusHistoryTable.workOrderId, id), eq(workOrderStatusHistoryTable.tenantId, tenantId)))
    .orderBy(workOrderStatusHistoryTable.createdAt);
  res.json(rows);
});

/* ─── Appointments ───────────────────────────────────────────────────────────── */

router.get("/work-orders/:id/appointments", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(workOrderAppointmentsTable)
    .where(and(eq(workOrderAppointmentsTable.workOrderId, id), eq(workOrderAppointmentsTable.tenantId, tenantId)))
    .orderBy(workOrderAppointmentsTable.startTime);
  res.json(rows);
});

const CreateAppointmentBody = z.object({
  appointmentType: z.enum(["assessment", "repair", "installation", "site_visit", "pickup", "delivery", "follow_up"]).default("repair"),
  staffId: z.number().int().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});

router.post("/work-orders/:id/appointments", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [wo] = await db.select({ id: workOrdersTable.id }).from(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  if (!wo) { res.status(404).json({ error: "Work order not found" }); return; }

  const [appt] = await db.insert(workOrderAppointmentsTable)
    .values({
      tenantId,
      workOrderId: id,
      staffId: parsed.data.staffId ?? null,
      appointmentType: parsed.data.appointmentType,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime ?? null,
      notes: parsed.data.notes ?? null,
      status: "scheduled",
    })
    .returning();
  res.status(201).json(appt);
});

router.patch("/work-orders/:id/appointments/:apptId", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const apptId = parseInt(String(req.params.apptId), 10);
  if (!Number.isInteger(apptId)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const PatchAppt = z.object({
    appointmentType: z.enum(["assessment", "repair", "installation", "site_visit", "pickup", "delivery", "follow_up"]).optional(),
    staffId: z.number().int().nullable().optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  });
  const parsed = PatchAppt.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(workOrderAppointmentsTable)
    .where(and(eq(workOrderAppointmentsTable.id, apptId), eq(workOrderAppointmentsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Appointment not found" }); return; }

  const updates: Partial<typeof workOrderAppointmentsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.appointmentType !== undefined) updates.appointmentType = parsed.data.appointmentType;
  if (parsed.data.staffId !== undefined) updates.staffId = parsed.data.staffId;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [updated] = await db.update(workOrderAppointmentsTable)
    .set(updates)
    .where(and(eq(workOrderAppointmentsTable.id, apptId), eq(workOrderAppointmentsTable.tenantId, tenantId)))
    .returning();
  res.json(updated);
});

router.delete("/work-orders/:id/appointments/:apptId", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const apptId = parseInt(String(req.params.apptId), 10);
  if (!Number.isInteger(apptId)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const [deleted] = await db.delete(workOrderAppointmentsTable)
    .where(and(eq(workOrderAppointmentsTable.id, apptId), eq(workOrderAppointmentsTable.tenantId, tenantId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Appointment not found" }); return; }
  res.sendStatus(204);
});

/* ─── Dashboard stats ─────────────────────────────────────────────────────────── */

/* ─── Aggregated appointments (calendar feed) ─────────────────────────────── */
router.get("/work-order-appointments", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const dow = now.getDay();
  const defaultStart = new Date(now);
  defaultStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  defaultStart.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 7);

  const startRaw = req.query["start"] as string | undefined;
  const endRaw = req.query["end"] as string | undefined;
  const startDate = startRaw ? new Date(startRaw) : defaultStart;
  const endDate = endRaw ? new Date(endRaw) : defaultEnd;

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({ error: "Invalid date range" }); return;
  }

  const rows = await db
    .select({
      id: workOrderAppointmentsTable.id,
      workOrderId: workOrderAppointmentsTable.workOrderId,
      appointmentType: workOrderAppointmentsTable.appointmentType,
      startTime: workOrderAppointmentsTable.startTime,
      endTime: workOrderAppointmentsTable.endTime,
      status: workOrderAppointmentsTable.status,
      notes: workOrderAppointmentsTable.notes,
      staffId: workOrderAppointmentsTable.staffId,
      workOrderNumber: workOrdersTable.workOrderNumber,
      woStatus: workOrdersTable.status,
      itemDescription: workOrdersTable.itemDescription,
      customerName: workOrdersTable.contactName,
      priority: workOrdersTable.priority,
    })
    .from(workOrderAppointmentsTable)
    .innerJoin(workOrdersTable, eq(workOrderAppointmentsTable.workOrderId, workOrdersTable.id))
    .where(and(
      eq(workOrderAppointmentsTable.tenantId, tenantId),
      gte(workOrderAppointmentsTable.startTime, startDate),
      lte(workOrderAppointmentsTable.startTime, endDate),
    ))
    .orderBy(workOrderAppointmentsTable.startTime);

  res.json(rows);
});

/* ─── Work orders reports (monthly trend + breakdown) ─────────────────────── */
router.get("/work-orders-reports", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1); sixMonthsAgo.setHours(0, 0, 0, 0);

  const monthly = await db
    .select({
      month: sql<string>`to_char(updated_at AT TIME ZONE 'UTC', 'Mon YY')`,
      monthSort: sql<string>`to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM')`,
      revenue: sql<number>`coalesce(sum(total), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.tenantId, tenantId),
      eq(workOrdersTable.status, "collected"),
      gte(workOrdersTable.updatedAt, sixMonthsAgo),
    ))
    .groupBy(sql`to_char(updated_at AT TIME ZONE 'UTC', 'Mon YY')`, sql`to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM')`)
    .orderBy(sql`to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM')`);

  const byServiceType = await db
    .select({
      serviceType: workOrdersTable.serviceType,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.tenantId, tenantId))
    .groupBy(workOrdersTable.serviceType);

  const [summary] = await db
    .select({
      totalCompleted: sql<number>`cast(count(*) as int)`,
      avgJobValue: sql<number>`coalesce(avg(total), 0)`,
      totalRevenue: sql<number>`coalesce(sum(total), 0)`,
    })
    .from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.tenantId, tenantId),
      eq(workOrdersTable.status, "collected"),
    ));

  res.json({
    monthly,
    byServiceType,
    totalCompleted: summary?.totalCompleted ?? 0,
    avgJobValue: Number(summary?.avgJobValue ?? 0),
    totalRevenue: Number(summary?.totalRevenue ?? 0),
  });
});

/* ─── Customer portal (public, HMAC-verified — no tenant auth required) ───── */
router.get("/public/work-orders/:id/:token", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id || isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }
  const token = (req.params["token"] ?? "").trim();

  const wo = await db.query.workOrdersTable.findFirst({
    where: eq(workOrdersTable.id, id),
  });
  if (!wo) { res.status(404).json({ error: "Not found" }); return; }

  if (!token || token !== makePortalToken(id, wo.tenantId)) {
    res.status(403).json({ error: "Invalid or expired link" }); return;
  }

  const notes = await db
    .select()
    .from(workOrderNotesTable)
    .where(and(
      eq(workOrderNotesTable.workOrderId, id),
      eq(workOrderNotesTable.isInternal, false),
    ))
    .orderBy(desc(workOrderNotesTable.createdAt));

  res.json({
    workOrderNumber: wo.workOrderNumber,
    status: wo.status,
    serviceChannel: wo.serviceChannel,
    itemDescription: wo.itemDescription,
    brand: wo.brand,
    model: wo.model,
    serialNumber: wo.serialNumber,
    problemDescription: wo.problemDescription,
    promisedDate: wo.promisedDate,
    total: wo.total,
    depositPaid: wo.depositPaid,
    createdAt: wo.createdAt,
    updatedAt: wo.updatedAt,
    notes: notes.map((n) => ({ content: n.content, createdAt: n.createdAt })),
  });
});

router.get("/work-orders-stats", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const counts = await db
    .select({ status: workOrdersTable.status, cnt: sql<number>`cast(count(*) as int)` })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.tenantId, tenantId))
    .groupBy(workOrdersTable.status);

  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.cnt]));
  const activeStatuses: WorkOrderStatus[] = ["received", "in_progress", "awaiting_parts", "on_hold", "ready"];
  const activeCount = activeStatuses.reduce((s, k) => s + (byStatus[k] ?? 0), 0);

  // Revenue from collected work orders this month
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [rev] = await db
    .select({ total: sql<number>`coalesce(sum(total), 0)` })
    .from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.tenantId, tenantId),
      eq(workOrdersTable.status, "collected"),
      gte(workOrdersTable.updatedAt, monthStart),
    ));

  res.json({ byStatus, activeCount, revenueThisMonth: Number(rev?.total ?? 0) });
});

export default router;
