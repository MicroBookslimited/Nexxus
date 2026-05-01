import { Router, type IRouter } from "express";
import {
  db, tenantsTable, subscriptionsTable, subscriptionPlansTable,
  bankAccountSettingsTable, bankTransferProofsTable, appSettingsTable,
  impersonationLogsTable, tenantAdminUsersTable,
  techniciansTable, technicianAssignmentsTable,
} from "@workspace/db";
import { eq, desc, count, sql, ilike, or, and, isNull } from "drizzle-orm";
import { getSetting } from "./settings";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signSuperAdminToken() {
  return jwt.sign({ type: "superadmin" }, getJwtSecret(), { expiresIn: "8h" });
}

function signTenantToken(tenantId: number, email: string, impersonation = false, impersonationLogId?: number) {
  return jwt.sign({
    tenantId, email, type: "tenant",
    ...(impersonation ? { impersonation: true } : {}),
    ...(impersonationLogId ? { impersonationLogId } : {}),
  }, getJwtSecret(), { expiresIn: "90d" });
}

function getSuperadminEmailFromRequest(req: { headers: Record<string, string | undefined> }): string {
  try {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) return "superadmin";
    const payload = jwt.verify(auth.slice(7), getJwtSecret()) as { email?: string; type?: string };
    return payload.email ?? "superadmin";
  } catch {
    return "superadmin";
  }
}

function publicTechnician(t: typeof techniciansTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone,
    status: t.status,
    createdAt: t.createdAt,
    approvedAt: t.approvedAt,
    approvedBy: t.approvedBy,
    lastLoginAt: t.lastLoginAt,
  };
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
  const [pendingProofs] = await db.select({ count: count() }).from(bankTransferProofsTable).where(eq(bankTransferProofsTable.status, "pending"));

  const revenueResult = await db
    .select({
      monthly: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptionsTable.billingCycle} = 'monthly' THEN ${subscriptionPlansTable.priceMonthly} ELSE 0 END), 0)`,
      annual: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptionsTable.billingCycle} = 'annual' THEN ${subscriptionPlansTable.priceAnnual} ELSE 0 END), 0)`,
    })
    .from(subscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(subscriptionsTable.status, "active"));

  const planBreakdown = await db
    .select({ planName: subscriptionPlansTable.name, count: count() })
    .from(subscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(subscriptionsTable.status, "active"))
    .groupBy(subscriptionPlansTable.name);

  const mrr = (revenueResult[0]?.monthly ?? 0) + (revenueResult[0]?.annual ?? 0) / 12;

  res.json({
    totalTenants: totalTenants.count,
    activeSubscriptions: activeSubscriptions.count,
    trialSubscriptions: trialSubscriptions.count,
    pendingProofs: pendingProofs.count,
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
      lastLoginAt: tenantsTable.lastLoginAt,
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

/* ─── Create Tenant (superadmin onboard) ─── */
const CreateTenantBody = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  country: z.string().optional(),
  planSlug: z.string().optional(),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
  subscriptionStatus: z.enum(["trial", "active", "past_due", "cancelled"]).optional(),
});

router.post("/superadmin/tenants", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { businessName, ownerName, email, password, phone, country, planSlug, billingCycle, subscriptionStatus } = parsed.data;

  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 12);

  const [tenant] = await db.insert(tenantsTable).values({
    businessName,
    ownerName,
    email,
    passwordHash,
    phone,
    country: country ?? "US",
    status: "active",
    onboardingStep: 5,
    onboardingComplete: true,
  }).returning();

  let planId: number | undefined;
  if (planSlug) {
    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, planSlug));
    if (plan) planId = plan.id;
  }

  const subStatus = subscriptionStatus ?? (planId ? "active" : "trial");
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await db.insert(subscriptionsTable).values({
    tenantId: tenant.id,
    planId: planId ?? null,
    status: subStatus,
    provider: subStatus === "active" ? "offline" : undefined,
    billingCycle: billingCycle ?? "monthly",
    trialEndsAt: subStatus === "trial" ? trialEnd : undefined,
    currentPeriodStart: subStatus === "active" ? now : undefined,
    currentPeriodEnd: subStatus === "active" ? periodEnd : undefined,
  });

  res.status(201).json({ success: true, tenant: { id: tenant.id, email: tenant.email } });
});

/* ─── Tenant Detail ─── */
router.get("/superadmin/tenants/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, id));
  res.json({ tenant, subscription });
});

/* ─── Update Tenant ─── */
const UpdateTenantBody = z.object({
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  subscriptionStatus: z.enum(["active", "trial", "cancelled", "past_due"]).optional(),
  planId: z.number().optional(),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
});

router.patch("/superadmin/tenants/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  if (parsed.data.status) {
    await db.update(tenantsTable).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(tenantsTable.id, id));
  }

  if (parsed.data.subscriptionStatus || parsed.data.planId || parsed.data.billingCycle) {
    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, id));
    if (existing) {
      let setStatus = parsed.data.subscriptionStatus as string | undefined;
      let setProvider: string | undefined;
      let setPeriodStart: Date | undefined;
      let setPeriodEnd: Date | undefined;
      const cycle = parsed.data.billingCycle ?? existing.billingCycle ?? "monthly";

      if (setStatus === "active" && !existing.currentPeriodStart) {
        const now = new Date();
        const end = new Date(now);
        if (cycle === "annual") end.setFullYear(end.getFullYear() + 1);
        else end.setMonth(end.getMonth() + 1);
        setProvider = "offline";
        setPeriodStart = now;
        setPeriodEnd = end;
      }

      await db.update(subscriptionsTable).set({
        ...(setStatus ? { status: setStatus } : {}),
        ...(setProvider ? { provider: setProvider } : {}),
        ...(setPeriodStart ? { currentPeriodStart: setPeriodStart } : {}),
        ...(setPeriodEnd ? { currentPeriodEnd: setPeriodEnd } : {}),
        ...(parsed.data.planId ? { planId: parsed.data.planId } : {}),
        ...(parsed.data.billingCycle ? { billingCycle: parsed.data.billingCycle } : {}),
        updatedAt: new Date(),
      }).where(eq(subscriptionsTable.tenantId, id));
    }
  }

  res.json({ success: true });
});

/* ─── Bank Accounts ─── */
router.get("/superadmin/bank-accounts", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const accounts = await db.select().from(bankAccountSettingsTable).orderBy(bankAccountSettingsTable.sortOrder);
  res.json(accounts);
});

const BankAccountBody = z.object({
  accountHolder: z.string().min(2),
  bankName: z.string().min(2),
  accountNumber: z.string().min(2),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  currency: z.string().default("USD"),
  instructions: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

router.post("/superadmin/bank-accounts", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const existing = await db.select().from(bankAccountSettingsTable);
  if (existing.length >= 2) {
    res.status(400).json({ error: "Maximum of 2 bank accounts allowed" });
    return;
  }

  const parsed = BankAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const [account] = await db.insert(bankAccountSettingsTable).values(parsed.data).returning();
  res.status(201).json(account);
});

router.put("/superadmin/bank-accounts/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = BankAccountBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [account] = await db.update(bankAccountSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(bankAccountSettingsTable.id, id))
    .returning();

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(account);
});

router.delete("/superadmin/bank-accounts/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bankAccountSettingsTable).where(eq(bankAccountSettingsTable.id, id));
  res.json({ success: true });
});

/* ─── Bank Transfer Proofs ─── */
router.get("/superadmin/bank-transfer-proofs", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const proofs = await db
    .select({
      id: bankTransferProofsTable.id,
      tenantId: bankTransferProofsTable.tenantId,
      planId: bankTransferProofsTable.planId,
      bankAccountId: bankTransferProofsTable.bankAccountId,
      billingCycle: bankTransferProofsTable.billingCycle,
      amount: bankTransferProofsTable.amount,
      referenceNumber: bankTransferProofsTable.referenceNumber,
      notes: bankTransferProofsTable.notes,
      proofFileName: bankTransferProofsTable.proofFileName,
      proofFileType: bankTransferProofsTable.proofFileType,
      proofFileData: bankTransferProofsTable.proofFileData,
      status: bankTransferProofsTable.status,
      reviewNotes: bankTransferProofsTable.reviewNotes,
      reviewedAt: bankTransferProofsTable.reviewedAt,
      createdAt: bankTransferProofsTable.createdAt,
      businessName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      email: tenantsTable.email,
      planName: subscriptionPlansTable.name,
      bankName: bankAccountSettingsTable.bankName,
      accountHolder: bankAccountSettingsTable.accountHolder,
    })
    .from(bankTransferProofsTable)
    .leftJoin(tenantsTable, eq(bankTransferProofsTable.tenantId, tenantsTable.id))
    .leftJoin(subscriptionPlansTable, eq(bankTransferProofsTable.planId, subscriptionPlansTable.id))
    .leftJoin(bankAccountSettingsTable, eq(bankTransferProofsTable.bankAccountId, bankAccountSettingsTable.id))
    .orderBy(desc(bankTransferProofsTable.createdAt));

  res.json(proofs);
});

const ReviewProofBody = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().optional(),
});

router.patch("/superadmin/bank-transfer-proofs/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReviewProofBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [proof] = await db.select().from(bankTransferProofsTable).where(eq(bankTransferProofsTable.id, id));
  if (!proof) { res.status(404).json({ error: "Proof not found" }); return; }

  await db.update(bankTransferProofsTable).set({
    status: parsed.data.status,
    reviewNotes: parsed.data.reviewNotes,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(bankTransferProofsTable.id, id));

  if (parsed.data.status === "approved" && proof.planId) {
    const now = new Date();
    const periodEnd = new Date(now);
    if (proof.billingCycle === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, proof.tenantId));
    if (existing) {
      await db.update(subscriptionsTable).set({
        planId: proof.planId,
        status: "active",
        provider: "bank_transfer",
        providerOrderId: proof.referenceNumber ?? `BT-${id}`,
        billingCycle: proof.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      }).where(eq(subscriptionsTable.tenantId, proof.tenantId));
    } else {
      await db.insert(subscriptionsTable).values({
        tenantId: proof.tenantId,
        planId: proof.planId,
        status: "active",
        provider: "bank_transfer",
        providerOrderId: proof.referenceNumber ?? `BT-${id}`,
        billingCycle: proof.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });
    }

    await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, proof.tenantId));
  }

  res.json({ success: true });
});

/* ─── Impersonate Tenant (Login As) ─── */
router.post("/superadmin/tenants/:id/impersonate", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  if (tenant.status === "suspended") { res.status(403).json({ error: "Account is suspended" }); return; }

  // Close any existing open sessions for this tenant before starting a new one
  await db
    .update(impersonationLogsTable)
    .set({ endedAt: new Date() })
    .where(and(eq(impersonationLogsTable.tenantId, id), isNull(impersonationLogsTable.endedAt)));

  const superadminEmail = getSuperadminEmailFromRequest(req);
  const [logRow] = await db.insert(impersonationLogsTable).values({
    superadminEmail,
    tenantId: tenant.id,
    tenantEmail: tenant.email,
    businessName: tenant.businessName,
  }).returning({ id: impersonationLogsTable.id });

  const token = signTenantToken(tenant.id, tenant.email, true, logRow?.id);
  res.json({ token, tenant: { id: tenant.id, email: tenant.email, businessName: tenant.businessName }, impersonationLogId: logRow?.id });
});

/* ─── End Impersonation Session (called from banner on logout) ─── */
router.post("/superadmin/impersonation-end", async (req, res): Promise<void> => {
  const parsed = z.object({ logId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.json({ success: true }); return; }

  await db
    .update(impersonationLogsTable)
    .set({ endedAt: new Date() })
    .where(and(eq(impersonationLogsTable.id, parsed.data.logId), isNull(impersonationLogsTable.endedAt)));

  res.json({ success: true });
});

/* ─── Close Impersonation Session (superadmin-authenticated, from Access Logs UI) ─── */
router.post("/superadmin/impersonation-logs/:id/close", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(impersonationLogsTable)
    .set({ endedAt: new Date() })
    .where(and(eq(impersonationLogsTable.id, id), isNull(impersonationLogsTable.endedAt)));

  res.json({ success: true });
});

/* ─── Impersonation Logs ─── */
router.get("/superadmin/impersonation-logs", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const rows = await db
    .select()
    .from(impersonationLogsTable)
    .orderBy(desc(impersonationLogsTable.startedAt))
    .limit(500);

  res.json(rows);
});

/* ─── Reset Tenant Password ─── */
const ResetPasswordBody = z.object({ newPassword: z.string().min(6) });

router.post("/superadmin/tenants/:id/reset-password", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.newPassword, 12);
  await db.update(tenantsTable).set({ passwordHash, updatedAt: new Date() }).where(eq(tenantsTable.id, id));

  res.json({ success: true });
});

/* ─── Force Logout ─── */
// Bumping sessions_invalidated_at causes the session-revocation middleware to
// reject any JWT issued before this moment. Effective on the next request after
// the in-memory cache (60s) refreshes — or immediately for the bumped record
// because we clear the cache entry inline.
import { clearTenantSessionCache, clearAdminUserSessionCache } from "../middleware/session-revocation";

router.post("/superadmin/tenants/:id/force-logout", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const now = new Date();
  // Bumping the tenant cuts off the primary owner's tokens. To also cut off
  // every co-admin user under this tenant, bump their rows too.
  await db.update(tenantsTable).set({ sessionsInvalidatedAt: now, updatedAt: now }).where(eq(tenantsTable.id, id));
  const adminUsers = await db.select({ id: tenantAdminUsersTable.id })
    .from(tenantAdminUsersTable).where(eq(tenantAdminUsersTable.tenantId, id));
  if (adminUsers.length > 0) {
    await db.update(tenantAdminUsersTable)
      .set({ sessionsInvalidatedAt: now, updatedAt: now })
      .where(eq(tenantAdminUsersTable.tenantId, id));
  }

  clearTenantSessionCache(id);
  for (const u of adminUsers) clearAdminUserSessionCache(u.id);

  res.json({ success: true, invalidatedAt: now.toISOString(), affectedAdminUsers: adminUsers.length });
});

router.post("/superadmin/admin-users/:id/force-logout", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(tenantAdminUsersTable).where(eq(tenantAdminUsersTable.id, id));
  if (!user) { res.status(404).json({ error: "Admin user not found" }); return; }

  const now = new Date();
  await db.update(tenantAdminUsersTable)
    .set({ sessionsInvalidatedAt: now, updatedAt: now })
    .where(eq(tenantAdminUsersTable.id, id));
  clearAdminUserSessionCache(id);

  res.json({ success: true, invalidatedAt: now.toISOString() });
});

/* ─── Superadmin Plan CRUD ─── */
router.get("/superadmin/plans", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.id);
  res.json(plans.map((p) => ({ ...p, features: JSON.parse(p.features), modules: JSON.parse(p.modules) })));
});

const coerceInt = z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)]);
const coerceNum = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]);

const PlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(""),
  priceMonthly: coerceNum.pipe(z.number().min(0)),
  priceAnnual: coerceNum.pipe(z.number().min(0)),
  maxStaff: coerceInt.pipe(z.number().int().min(0)),
  maxProducts: coerceInt.pipe(z.number().int().min(0)),
  maxLocations: coerceInt.pipe(z.number().int().min(0)),
  maxInvoices: coerceInt.pipe(z.number().int().min(0)).default(9999),
  modules: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  isActive: z.union([z.boolean(), z.enum(["true", "false"]).transform(v => v === "true")]).default(true),
  isPromotional: z.union([z.boolean(), z.enum(["true", "false"]).transform(v => v === "true")]).default(false),
  durationDays: coerceInt.pipe(z.number().int().min(1)).optional(),
});

router.post("/superadmin/plans", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { modules, features, ...rest } = parsed.data;
  const [plan] = await db.insert(subscriptionPlansTable).values({
    ...rest,
    modules: JSON.stringify(modules),
    features: JSON.stringify(features),
  }).returning();
  res.status(201).json({ ...plan, features: JSON.parse(plan.features), modules: JSON.parse(plan.modules) });
});

router.put("/superadmin/plans/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "0", 10);
  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) {
    console.error("Plan PUT validation failed:", JSON.stringify(req.body, null, 2), "\nErrors:", JSON.stringify(parsed.error.issues, null, 2));
    res.status(400).json({ error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return;
  }
  const { modules, features, ...rest } = parsed.data;
  const [plan] = await db.update(subscriptionPlansTable).set({
    ...rest,
    modules: JSON.stringify(modules),
    features: JSON.stringify(features),
  }).where(eq(subscriptionPlansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ ...plan, features: JSON.parse(plan.features), modules: JSON.parse(plan.modules) });
});

router.delete("/superadmin/plans/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(subscriptionPlansTable).set({ isActive: false }).where(eq(subscriptionPlansTable.id, id));
  res.json({ success: true });
});

/* ─── All Users (Tenants) with full search ─── */
router.get("/superadmin/users", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const q = (req.query["q"] as string | undefined) ?? "";

  // ── Primary tenant owners ──────────────────────────────────
  const owners = await db
    .select({
      id: tenantsTable.id,
      adminUserId: sql<number | null>`null`,
      userType: sql<string>`'owner'`,
      businessName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      email: tenantsTable.email,
      phone: tenantsTable.phone,
      country: tenantsTable.country,
      status: tenantsTable.status,
      onboardingComplete: tenantsTable.onboardingComplete,
      onboardingStep: tenantsTable.onboardingStep,
      createdAt: tenantsTable.createdAt,
      subscriptionStatus: subscriptionsTable.status,
      planName: subscriptionPlansTable.name,
      billingCycle: subscriptionsTable.billingCycle,
    })
    .from(tenantsTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.tenantId, tenantsTable.id))
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(
      q
        ? or(
            ilike(tenantsTable.email, `%${q}%`),
            ilike(tenantsTable.businessName, `%${q}%`),
            ilike(tenantsTable.ownerName, `%${q}%`)
          )
        : undefined
    )
    .orderBy(desc(tenantsTable.createdAt));

  // ── Co-admins (non-primary with a set password) ─────────────
  const coAdmins = await db
    .select({
      id: tenantAdminUsersTable.tenantId,
      adminUserId: tenantAdminUsersTable.id,
      userType: sql<string>`'admin'`,
      businessName: tenantsTable.businessName,
      ownerName: tenantAdminUsersTable.name,
      email: tenantAdminUsersTable.email,
      phone: sql<string | null>`null`,
      country: sql<string | null>`null`,
      status: tenantAdminUsersTable.status,
      onboardingComplete: sql<boolean>`true`,
      onboardingStep: sql<number>`0`,
      createdAt: tenantAdminUsersTable.createdAt,
      subscriptionStatus: subscriptionsTable.status,
      planName: subscriptionPlansTable.name,
      billingCycle: subscriptionsTable.billingCycle,
    })
    .from(tenantAdminUsersTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, tenantAdminUsersTable.tenantId))
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.tenantId, tenantAdminUsersTable.tenantId))
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(
      and(
        eq(tenantAdminUsersTable.isPrimary, false),
        sql`${tenantAdminUsersTable.passwordHash} IS NOT NULL`,
        eq(tenantAdminUsersTable.status, "active"),
        q
          ? or(
              ilike(tenantAdminUsersTable.email, `%${q}%`),
              ilike(tenantAdminUsersTable.name, `%${q}%`),
              ilike(tenantsTable.businessName, `%${q}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(tenantAdminUsersTable.createdAt));

  // Merge and sort by createdAt desc
  const all = [...owners, ...coAdmins].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json(all);
});

/* ─── Reset Co-Admin Password ─── */
router.post("/superadmin/admin-users/:id/reset-password", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = z.object({ newPassword: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const [adminUser] = await db.select().from(tenantAdminUsersTable).where(eq(tenantAdminUsersTable.id, id));
  if (!adminUser) { res.status(404).json({ error: "Admin user not found" }); return; }

  const hash = await bcryptjs.hash(parsed.data.newPassword, 10);
  await db.update(tenantAdminUsersTable).set({ passwordHash: hash }).where(eq(tenantAdminUsersTable.id, id));
  res.json({ success: true });
});

/* ─── Gateway Settings ─── */
const GATEWAY_KEYS = ["powertranz_spid", "powertranz_sppassword", "powertranz_env", "powertranz_enabled"] as const;

router.get("/superadmin/gateway", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;
  const result: Record<string, string> = {};
  for (const key of GATEWAY_KEYS) {
    result[key] = await getSetting(key, 0);
  }
  if (result["powertranz_sppassword"]) {
    result["powertranz_sppassword_set"] = "true";
    result["powertranz_sppassword"] = "";
  }
  res.json(result);
});

const GatewayBody = z.object({
  powertranz_spid: z.string().optional(),
  powertranz_sppassword: z.string().optional(),
  powertranz_env: z.enum(["staging", "production"]).optional(),
  powertranz_enabled: z.string().optional(),
});

router.patch("/superadmin/gateway", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;
  const parsed = GatewayBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const data = parsed.data;
  for (const key of GATEWAY_KEYS) {
    const val = data[key as keyof typeof data];
    if (val !== undefined && val !== "") {
      const dbKey = `0:${key}`;
      await db.insert(appSettingsTable)
        .values({ key: dbKey, tenantId: 0, value: val, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: val, updatedAt: new Date() } });
    }
  }
  res.json({ success: true });
});

/* ────────────────────────── Technicians (Installers) ────────────────────────── */

router.get("/superadmin/technicians", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const status = (req.query["status"] as string | undefined)?.trim();
  const baseQuery = db.select({
    id: techniciansTable.id,
    name: techniciansTable.name,
    email: techniciansTable.email,
    phone: techniciansTable.phone,
    status: techniciansTable.status,
    createdAt: techniciansTable.createdAt,
    approvedAt: techniciansTable.approvedAt,
    approvedBy: techniciansTable.approvedBy,
    lastLoginAt: techniciansTable.lastLoginAt,
    assignmentCount: sql<number>`(SELECT COUNT(*)::int FROM technician_assignments a WHERE a.technician_id = ${techniciansTable.id})`,
  }).from(techniciansTable);

  const rows = status
    ? await baseQuery.where(eq(techniciansTable.status, status)).orderBy(desc(techniciansTable.createdAt))
    : await baseQuery.orderBy(desc(techniciansTable.createdAt));

  res.json(rows);
});

router.get("/superadmin/technicians/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tech] = await db.select().from(techniciansTable).where(eq(techniciansTable.id, id));
  if (!tech) { res.status(404).json({ error: "Technician not found" }); return; }

  const assignments = await db.select({
    id: technicianAssignmentsTable.id,
    tenantId: technicianAssignmentsTable.tenantId,
    assignedAt: technicianAssignmentsTable.assignedAt,
    assignedBy: technicianAssignmentsTable.assignedBy,
    businessName: tenantsTable.businessName,
    email: tenantsTable.email,
    status: tenantsTable.status,
  })
    .from(technicianAssignmentsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, technicianAssignmentsTable.tenantId))
    .where(eq(technicianAssignmentsTable.technicianId, id))
    .orderBy(tenantsTable.businessName);

  res.json({ ...publicTechnician(tech), assignments });
});

const PatchTechBody = z.object({
  status: z.enum(["pending", "approved", "suspended", "rejected"]).optional(),
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).optional(),
});

router.patch("/superadmin/technicians/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = PatchTechBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [tech] = await db.select().from(techniciansTable).where(eq(techniciansTable.id, id));
  if (!tech) { res.status(404).json({ error: "Technician not found" }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates["name"] = parsed.data.name;
  if (parsed.data.phone !== undefined) updates["phone"] = parsed.data.phone;
  if (parsed.data.status !== undefined) {
    updates["status"] = parsed.data.status;
    if (parsed.data.status === "approved" && tech.status !== "approved") {
      updates["approvedAt"] = new Date();
      updates["approvedBy"] = getSuperadminEmailFromRequest(req);
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(publicTechnician(tech));
    return;
  }

  const [updated] = await db.update(techniciansTable)
    .set(updates)
    .where(eq(techniciansTable.id, id))
    .returning();

  if (!updated) { res.status(500).json({ error: "Update failed" }); return; }
  res.json(publicTechnician(updated));
});

router.delete("/superadmin/technicians/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(techniciansTable).where(eq(techniciansTable.id, id));
  res.json({ success: true });
});

const ResetTechPwBody = z.object({ newPassword: z.string().min(8) });

router.post("/superadmin/technicians/:id/reset-password", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ResetTechPwBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.newPassword, 10);
  const [updated] = await db.update(techniciansTable)
    .set({ passwordHash })
    .where(eq(techniciansTable.id, id))
    .returning({ id: techniciansTable.id });
  if (!updated) { res.status(404).json({ error: "Technician not found" }); return; }
  res.json({ success: true });
});

const AssignBody = z.object({ tenantId: z.number().int().positive() });

router.post("/superadmin/technicians/:id/assignments", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const technicianId = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(technicianId)) { res.status(400).json({ error: "Invalid technician id" }); return; }

  const parsed = AssignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [tech] = await db.select({ id: techniciansTable.id }).from(techniciansTable).where(eq(techniciansTable.id, technicianId));
  if (!tech) { res.status(404).json({ error: "Technician not found" }); return; }

  const [tenant] = await db.select({ id: tenantsTable.id, businessName: tenantsTable.businessName }).from(tenantsTable).where(eq(tenantsTable.id, parsed.data.tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [existing] = await db.select({ id: technicianAssignmentsTable.id })
    .from(technicianAssignmentsTable)
    .where(and(
      eq(technicianAssignmentsTable.technicianId, technicianId),
      eq(technicianAssignmentsTable.tenantId, parsed.data.tenantId),
    ));
  if (existing) { res.status(409).json({ error: "Already assigned" }); return; }

  const [created] = await db.insert(technicianAssignmentsTable).values({
    technicianId,
    tenantId: parsed.data.tenantId,
    assignedBy: getSuperadminEmailFromRequest(req),
  }).returning();

  res.status(201).json({ ...created, businessName: tenant.businessName });
});

router.delete("/superadmin/technicians/:id/assignments/:tenantId", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const technicianId = parseInt(req.params["id"] ?? "", 10);
  const tenantId = parseInt(req.params["tenantId"] ?? "", 10);
  if (!Number.isFinite(technicianId) || !Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(technicianAssignmentsTable).where(and(
    eq(technicianAssignmentsTable.technicianId, technicianId),
    eq(technicianAssignmentsTable.tenantId, tenantId),
  ));
  res.json({ success: true });
});

/* ─── Tenant search for assignment dialog (lightweight) ─── */
router.get("/superadmin/tenants-lite", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const q = (req.query["q"] as string | undefined)?.trim();
  const baseQuery = db.select({
    id: tenantsTable.id,
    businessName: tenantsTable.businessName,
    email: tenantsTable.email,
    status: tenantsTable.status,
  }).from(tenantsTable);

  const rows = q
    ? await baseQuery.where(or(
        ilike(tenantsTable.businessName, `%${q}%`),
        ilike(tenantsTable.email, `%${q}%`),
      )).orderBy(tenantsTable.businessName).limit(50)
    : await baseQuery.orderBy(tenantsTable.businessName).limit(50);

  res.json(rows);
});

export default router;
