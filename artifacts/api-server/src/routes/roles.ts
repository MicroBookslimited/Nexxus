import { Router, type IRouter } from "express";
import { db, rolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Permissions catalogue ─── */
export const ALL_PERMISSIONS = [
  { key: "pos.sale",           label: "Process Sales",           category: "Point of Sale" },
  { key: "pos.void",           label: "Void Transactions",       category: "Point of Sale" },
  { key: "pos.discount",       label: "Apply Discounts",         category: "Point of Sale" },
  { key: "pos.refund",         label: "Process Refunds",         category: "Point of Sale" },
  { key: "pos.open_drawer",    label: "Open Cash Drawer",        category: "Point of Sale" },
  { key: "orders.view",        label: "View Orders",             category: "Orders" },
  { key: "orders.manage",      label: "Manage Orders",           category: "Orders" },
  { key: "inventory.view",     label: "View Products & Stock",   category: "Inventory" },
  { key: "inventory.manage",   label: "Manage Products & Stock", category: "Inventory" },
  { key: "reports.view",       label: "View Reports",            category: "Reports" },
  { key: "reports.export",     label: "Export Reports",          category: "Reports" },
  { key: "staff.view",         label: "View Staff",              category: "Staff" },
  { key: "staff.manage",       label: "Manage Staff",            category: "Staff" },
  { key: "customers.view",     label: "View Customers",          category: "Customers" },
  { key: "customers.manage",   label: "Manage Customers",        category: "Customers" },
  { key: "cash.open_session",  label: "Open Cash Session",       category: "Cash Management" },
  { key: "cash.close_session", label: "Close Cash Session",      category: "Cash Management" },
  { key: "cash.manage_payouts",label: "Manage Payouts",          category: "Cash Management" },
  { key: "kitchen.view",       label: "View Kitchen Display",    category: "Kitchen" },
  { key: "kitchen.manage",     label: "Manage Kitchen Orders",   category: "Kitchen" },
  { key: "settings.view",      label: "View Settings",           category: "Settings" },
  { key: "settings.manage",    label: "Manage Settings",         category: "Settings" },
];

const ALL_KEYS = ALL_PERMISSIONS.map(p => p.key);

/* ─── System role definitions ─── */
const SYSTEM_ROLES: { name: string; color: string; permissions: string[] }[] = [
  {
    name: "Admin",
    color: "#ef4444",
    permissions: ALL_KEYS,
  },
  {
    name: "Manager",
    color: "#a855f7",
    permissions: ALL_KEYS.filter(k => !["settings.manage", "staff.manage"].includes(k)),
  },
  {
    name: "Supervisor",
    color: "#f59e0b",
    permissions: [
      "pos.sale","pos.void","pos.discount","pos.refund","pos.open_drawer",
      "orders.view","orders.manage","inventory.view","reports.view","reports.export",
      "customers.view","cash.open_session","cash.close_session","kitchen.view",
    ],
  },
  {
    name: "Cashier",
    color: "#3b82f6",
    permissions: [
      "pos.sale","pos.discount","pos.open_drawer","orders.view","customers.view","cash.open_session",
    ],
  },
  {
    name: "Kitchen",
    color: "#f97316",
    permissions: ["kitchen.view","kitchen.manage","orders.view"],
  },
  {
    name: "Inventory Clerk",
    color: "#10b981",
    permissions: ["inventory.view","inventory.manage","reports.view","orders.view"],
  },
];

/* ─── Auth helper ─── */
function getTenantId(req: Parameters<typeof router.get>[1] extends (...a: infer P) => unknown ? P[0] : never): number | null {
  const auth = (req as { headers: Record<string, string> }).headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Seed default roles for a new tenant ─── */
export async function seedDefaultRoles(tenantId: number): Promise<void> {
  const existing = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.tenantId, tenantId));
  if (existing.length > 0) return;
  await db.insert(rolesTable).values(
    SYSTEM_ROLES.map(r => ({ tenantId, name: r.name, color: r.color, permissions: r.permissions, isSystem: true }))
  );
}

/* ─── GET /api/roles ─── */
router.get("/roles", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await seedDefaultRoles(tenantId);
  const roles = await db.select().from(rolesTable).where(eq(rolesTable.tenantId, tenantId));
  res.json({ roles, permissions: ALL_PERMISSIONS });
});

/* ─── POST /api/roles ─── */
const CreateRoleBody = z.object({
  name: z.string().min(1).max(50),
  color: z.string().optional().default("#3b82f6"),
  permissions: z.array(z.string()).default([]),
});

router.post("/roles", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

  const existing = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, parsed.data.name)));
  if (existing.length > 0) { res.status(409).json({ error: "A role with that name already exists" }); return; }

  const validPerms = parsed.data.permissions.filter(p => ALL_KEYS.includes(p));
  const [role] = await db.insert(rolesTable).values({
    tenantId,
    name: parsed.data.name,
    color: parsed.data.color,
    permissions: validPerms,
    isSystem: false,
  }).returning();

  res.status(201).json(role);
});

/* ─── PATCH /api/roles/:id ─── */
const UpdateRoleBody = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

router.patch("/roles/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), eq(rolesTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Role not found" }); return; }

  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const update: Partial<typeof rolesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.color !== undefined) update.color = parsed.data.color;
  if (parsed.data.permissions !== undefined) update.permissions = parsed.data.permissions.filter(p => ALL_KEYS.includes(p));

  const [updated] = await db.update(rolesTable).set(update).where(eq(rolesTable.id, id)).returning();
  res.json(updated);
});

/* ─── DELETE /api/roles/:id ─── */
router.delete("/roles/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), eq(rolesTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Role not found" }); return; }
  if (existing.isSystem) { res.status(403).json({ error: "System roles cannot be deleted, only edited" }); return; }

  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.json({ success: true });
});

export default router;
