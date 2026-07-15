import { Router, type IRouter } from "express";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import { db, workOrdersTable, customersTable, staffTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { getSetting } from "./settings";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Validation ─── */

const WorkOrderItem = z.object({
  type: z.enum(["part", "labor"]),
  productId: z.number().int().positive().optional(),
  description: z.string().min(1),
  price: z.number().nonnegative().finite(),
  quantity: z.number().positive().finite(),
  isTaxable: z.boolean().optional(),
});

const CreateWorkOrderBody = z.object({
  customerId: z.number().int().optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  itemDescription: z.string().min(1).max(500),
  problemDescription: z.string().min(1).max(2000),
  assignedStaffId: z.number().int().optional(),
  items: z.array(WorkOrderItem).default([]),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountAmount: z.number().nonnegative().optional(),
  promisedDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateWorkOrderBody = z.object({
  customerId: z.number().int().nullable().optional(),
  status: z.enum(["received", "in_progress", "ready", "collected", "cancelled"]).optional(),
  diagnosis: z.string().max(2000).optional(),
  assignedStaffId: z.number().int().nullable().optional(),
  items: z.array(WorkOrderItem).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountAmount: z.number().nonnegative().optional(),
  promisedDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  itemDescription: z.string().min(1).max(500).optional(),
  problemDescription: z.string().min(1).max(2000).optional(),
  convertedOrderId: z.number().int().optional(),
});

// Legal transitions; converting to a sale sets "collected" via convertedOrderId.
const STATUS_FLOW: Record<string, string[]> = {
  received: ["in_progress", "ready", "cancelled"],
  in_progress: ["ready", "received", "cancelled"],
  ready: ["collected", "in_progress", "cancelled"],
  collected: [],
  cancelled: [],
};

/* ─── Totals (same math as quotations/layaways) ─── */
async function computeTotals(
  tenantId: number,
  items: Array<{ price: number; quantity: number; isTaxable?: boolean }>,
  discountInput: number | undefined,
  discountType: "percent" | "fixed" | undefined,
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

/* ─── Numbering: WO-YY-NNNN ─── */
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

type WorkOrderRow = typeof workOrdersTable.$inferSelect;
function normalize(
  w: WorkOrderRow,
  customerName?: string | null,
  customerPhone?: string | null,
  staffName?: string | null,
) {
  return {
    ...w,
    customerName: customerName ?? undefined,
    customerPhone: customerPhone ?? undefined,
    assignedStaffName: staffName ?? undefined,
  };
}

async function validateRefs(
  tenantId: number,
  customerId?: number,
  assignedStaffId?: number | null,
): Promise<string | null> {
  if (customerId != null) {
    const [c] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.tenantId, tenantId)));
    if (!c) return "Customer not found";
  }
  if (assignedStaffId != null) {
    const [s] = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(and(eq(staffTable.id, assignedStaffId), eq(staffTable.tenantId, tenantId)));
    if (!s) return "Staff member not found";
  }
  return null;
}

/* ─── Routes ─── */

router.get("/work-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db
    .select({
      workOrder: workOrdersTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      staffName: staffTable.name,
    })
    .from(workOrdersTable)
    .leftJoin(
      customersTable,
      and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)),
    )
    .leftJoin(
      staffTable,
      and(eq(workOrdersTable.assignedStaffId, staffTable.id), eq(staffTable.tenantId, tenantId)),
    )
    .where(eq(workOrdersTable.tenantId, tenantId))
    .orderBy(desc(workOrdersTable.createdAt));
  res.json(rows.map((r) => normalize(r.workOrder, r.customerName, r.customerPhone, r.staffName)));
});

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
    .leftJoin(
      customersTable,
      and(eq(workOrdersTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)),
    )
    .leftJoin(
      staffTable,
      and(eq(workOrdersTable.assignedStaffId, staffTable.id), eq(staffTable.tenantId, tenantId)),
    )
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)));
  if (!row) { res.status(404).json({ error: "Work order not found" }); return; }
  res.json(normalize(row.workOrder, row.customerName, row.customerPhone, row.staffName));
});

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
  const refError = await validateRefs(tenantId, data.customerId, data.assignedStaffId);
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
        itemDescription: data.itemDescription,
        problemDescription: data.problemDescription,
        assignedStaffId: data.assignedStaffId ?? null,
        items: data.items,
        subtotal: totals.subtotal,
        discountType: totals.discount > 0 ? (data.discountType ?? "fixed") : null,
        discountAmount: totals.discount > 0 ? totals.discount : null,
        tax: totals.tax,
        total: totals.total,
        status: "received",
        promisedDate: data.promisedDate ?? null,
        notes: data.notes ?? null,
      })
      .returning();
    return created;
  });
  res.status(201).json(normalize(row));
});

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

  if (data.status && data.status !== existing.status) {
    // Setting convertedOrderId (checkout) may jump to collected, but only from
    // an active working state — never resurrect cancelled/collected orders or
    // skip intake entirely from "received".
    const allowed = STATUS_FLOW[existing.status] ?? [];
    const isConversion =
      data.convertedOrderId != null &&
      data.status === "collected" &&
      (existing.status === "ready" || existing.status === "in_progress");
    if (!allowed.includes(data.status) && !isConversion) {
      res.status(400).json({ error: `Cannot move from ${existing.status} to ${data.status}` });
      return;
    }
  }
  if (existing.status === "collected" || existing.status === "cancelled") {
    // Terminal states: only allow note edits.
    const touched = Object.keys(data).filter((k) => k !== "notes");
    if (touched.length > 0) {
      res.status(400).json({ error: "This work order is closed" });
      return;
    }
  }

  const refError = await validateRefs(
    tenantId,
    data.customerId ?? undefined,
    data.assignedStaffId ?? undefined,
  );
  if (refError) { res.status(400).json({ error: refError }); return; }

  const updates: Partial<typeof workOrdersTable.$inferInsert> = { updatedAt: new Date() };
  if (data.customerId !== undefined) updates.customerId = data.customerId;
  if (data.status !== undefined) updates.status = data.status;
  if (data.diagnosis !== undefined) updates.diagnosis = data.diagnosis;
  if (data.assignedStaffId !== undefined) updates.assignedStaffId = data.assignedStaffId;
  if (data.promisedDate !== undefined) updates.promisedDate = data.promisedDate;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.contactName !== undefined) updates.contactName = data.contactName;
  if (data.contactPhone !== undefined) updates.contactPhone = data.contactPhone;
  if (data.itemDescription !== undefined) updates.itemDescription = data.itemDescription;
  if (data.problemDescription !== undefined) updates.problemDescription = data.problemDescription;
  if (data.convertedOrderId !== undefined) updates.convertedOrderId = data.convertedOrderId;

  if (data.items !== undefined || data.discountAmount !== undefined || data.discountType !== undefined) {
    const items = data.items ?? existing.items;
    const totals = await computeTotals(
      tenantId,
      items,
      data.discountAmount ?? existing.discountAmount ?? undefined,
      (data.discountType ?? existing.discountType ?? undefined) as "percent" | "fixed" | undefined,
    );
    updates.items = items;
    updates.subtotal = totals.subtotal;
    updates.discountType = totals.discount > 0 ? (data.discountType ?? existing.discountType ?? "fixed") : null;
    updates.discountAmount = totals.discount > 0 ? totals.discount : null;
    updates.tax = totals.tax;
    updates.total = totals.total;
  }

  const [row] = await db
    .update(workOrdersTable)
    .set(updates)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)))
    .returning();
  res.json(normalize(row));
});

router.delete("/work-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .delete(workOrdersTable)
    .where(and(eq(workOrdersTable.id, id), eq(workOrdersTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Work order not found" }); return; }
  res.sendStatus(204);
});

export default router;
