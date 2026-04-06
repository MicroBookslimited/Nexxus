import { Router, type IRouter } from "express";
import { db, tenantsTable, subscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signSuperAdminToken() {
  return jwt.sign({ type: "superadmin" }, getJwtSecret(), { expiresIn: "8h" });
}

function verifySuperAdminToken(token: string): boolean {
  try {
    const p = jwt.verify(token, getJwtSecret()) as { type: string };
    return p.type === "superadmin";
  } catch {
    return false;
  }
}

function requireSuperAdmin(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: object) => void } }): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!verifySuperAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Invalid superadmin token" });
    return false;
  }
  return true;
}

/* ─── Superadmin Login ─── */
router.post("/superadmin/login", (req, res): void => {
  const { email, password } = req.body as { email?: string; password?: string };
  const adminEmail = process.env["SUPERADMIN_EMAIL"] ?? "admin@nexuspos.com";
  const adminPassword = process.env["SUPERADMIN_PASSWORD"] ?? "NexusAdmin2024!";

  if (email !== adminEmail || password !== adminPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signSuperAdminToken();
  res.json({ token });
});

/* ─── Stats ─── */
router.get("/superadmin/stats", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const [totalTenants] = await db.select({ count: count() }).from(tenantsTable);
  const [activeSubscriptions] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.status, "active"));
  const [trialSubscriptions] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.status, "trial"));

  const revenueResult = await db
    .select({
      monthly: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptionsTable.billingCycle} = 'monthly' THEN ${subscriptionPlansTable.priceMonthly} ELSE 0 END), 0)`,
      annual: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptionsTable.billingCycle} = 'annual' THEN ${subscriptionPlansTable.priceAnnual} ELSE 0 END), 0)`,
    })
    .from(subscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(subscriptionsTable.status, "active"));

  const planBreakdown = await db
    .select({
      planName: subscriptionPlansTable.name,
      count: count(),
    })
    .from(subscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(subscriptionsTable.status, "active"))
    .groupBy(subscriptionPlansTable.name);

  const mrr = (revenueResult[0]?.monthly ?? 0) + (revenueResult[0]?.annual ?? 0) / 12;

  res.json({
    totalTenants: totalTenants.count,
    activeSubscriptions: activeSubscriptions.count,
    trialSubscriptions: trialSubscriptions.count,
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    planBreakdown,
  });
});

/* ─── Tenants List ─── */
router.get("/superadmin/tenants", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const tenants = await db
    .select({
      id: tenantsTable.id,
      businessName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      email: tenantsTable.email,
      phone: tenantsTable.phone,
      country: tenantsTable.country,
      status: tenantsTable.status,
      onboardingComplete: tenantsTable.onboardingComplete,
      createdAt: tenantsTable.createdAt,
      subscriptionStatus: subscriptionsTable.status,
      planId: subscriptionsTable.planId,
      billingCycle: subscriptionsTable.billingCycle,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      trialEndsAt: subscriptionsTable.trialEndsAt,
      planName: subscriptionPlansTable.name,
    })
    .from(tenantsTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.tenantId, tenantsTable.id))
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .orderBy(desc(tenantsTable.createdAt));

  res.json(tenants);
});

/* ─── Tenant Detail ─── */
router.get("/superadmin/tenants/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, id));

  res.json({ tenant, subscription });
});

/* ─── Update Tenant ─── */
const UpdateTenantBody = z.object({
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  subscriptionStatus: z.enum(["active", "trial", "cancelled", "past_due"]).optional(),
  planId: z.number().optional(),
});

router.patch("/superadmin/tenants/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  if (parsed.data.status) {
    await db.update(tenantsTable).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(tenantsTable.id, id));
  }

  if (parsed.data.subscriptionStatus || parsed.data.planId) {
    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, id));
    if (existing) {
      await db.update(subscriptionsTable).set({
        ...(parsed.data.subscriptionStatus ? { status: parsed.data.subscriptionStatus } : {}),
        ...(parsed.data.planId ? { planId: parsed.data.planId } : {}),
        updatedAt: new Date(),
      }).where(eq(subscriptionsTable.tenantId, id));
    }
  }

  res.json({ success: true });
});

export default router;
