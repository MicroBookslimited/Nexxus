import { Router, type IRouter } from "express";
import {
  db, tenantsTable, subscriptionsTable, subscriptionPlansTable,
  bankAccountSettingsTable, bankTransferProofsTable,
} from "@workspace/db";
import { eq, desc, count, sql, ilike, or } from "drizzle-orm";
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

function signTenantToken(tenantId: number, email: string) {
  return jwt.sign({ tenantId, email, type: "tenant" }, getJwtSecret(), { expiresIn: "7d" });
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

  if (parsed.data.subscriptionStatus || parsed.data.planId) {
    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, id));
    if (existing) {
      let setStatus = parsed.data.subscriptionStatus as string | undefined;
      let setProvider: string | undefined;
      let setPeriodStart: Date | undefined;
      let setPeriodEnd: Date | undefined;

      if (setStatus === "active" && !existing.currentPeriodStart) {
        const now = new Date();
        const end = new Date(now);
        end.setMonth(end.getMonth() + 1);
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

  const token = signTenantToken(tenant.id, tenant.email);
  res.json({ token, tenant: { id: tenant.id, email: tenant.email, businessName: tenant.businessName } });
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

/* ─── Superadmin Plan CRUD ─── */
router.get("/superadmin/plans", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.id);
  res.json(plans.map((p) => ({ ...p, features: JSON.parse(p.features), modules: JSON.parse(p.modules) })));
});

const PlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(""),
  priceMonthly: z.number().min(0),
  priceAnnual: z.number().min(0),
  maxStaff: z.number().int().min(0),
  maxProducts: z.number().int().min(0),
  maxLocations: z.number().int().min(0),
  maxInvoices: z.number().int().min(0).default(9999),
  modules: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
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
  const parsed = PlanBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { modules, features, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (modules !== undefined) updates["modules"] = JSON.stringify(modules);
  if (features !== undefined) updates["features"] = JSON.stringify(features);
  const [plan] = await db.update(subscriptionPlansTable).set(updates).where(eq(subscriptionPlansTable.id, id)).returning();
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

  const users = await db
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

  res.json(users);
});

export default router;
