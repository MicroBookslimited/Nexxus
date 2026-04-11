import { Router, type IRouter } from "express";
import {
  db, resellersTable, resellerCommissionsTable, resellerPayoutsTable,
  tenantsTable, subscriptionsTable, subscriptionPlansTable,
} from "@workspace/db";
import { eq, and, desc, sql, count, sum, ne } from "drizzle-orm";
import { z } from "zod/v4";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signResellerToken(resellerId: number, email: string): string {
  return jwt.sign({ resellerId, email, type: "reseller" }, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyResellerToken(token: string): { resellerId: number; email: string } | null {
  try {
    const p = jwt.verify(token, getJwtSecret()) as { resellerId: number; email: string; type: string };
    if (p.type !== "reseller") return null;
    return { resellerId: p.resellerId, email: p.email };
  } catch {
    return null;
  }
}

function requireReseller(req: any, res: any): { resellerId: number; email: string } | null {
  const auth = req.headers?.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyResellerToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return payload;
}

function generateReferralCode(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(3, "X");
  return `${slug}-${nanoid(6).toUpperCase()}`;
}

/* ─── Signup ─── */
const SignupBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});

router.post("/reseller/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const { name, email, password, companyName, phone } = parsed.data;

  const [existing] = await db.select({ id: resellersTable.id }).from(resellersTable).where(eq(resellersTable.email, email));
  if (existing) { res.status(409).json({ error: "An account with this email already exists" }); return; }

  const passwordHash = await bcryptjs.hash(password, 12);
  let referralCode = generateReferralCode(name);

  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 5) {
    const [dupe] = await db.select({ id: resellersTable.id }).from(resellersTable).where(eq(resellersTable.referralCode, referralCode));
    if (!dupe) break;
    referralCode = generateReferralCode(name);
    attempts++;
  }

  const [reseller] = await db.insert(resellersTable).values({
    name, email, passwordHash, companyName, phone, referralCode,
  }).returning();

  const token = signResellerToken(reseller.id, reseller.email);
  res.status(201).json({
    token,
    reseller: { id: reseller.id, name: reseller.name, email: reseller.email, referralCode: reseller.referralCode },
  });
});

/* ─── Login ─── */
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/reseller/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { email, password } = parsed.data;

  // Allow superadmin credentials to access the reseller portal.
  // If no reseller account exists for the superadmin email, auto-create one.
  const adminEmail = process.env["SUPERADMIN_EMAIL"] ?? "admin@nexuspos.com";
  const adminPassword = process.env["SUPERADMIN_PASSWORD"] ?? "NexusAdmin2024!";
  if (email === adminEmail && password === adminPassword) {
    let [adminReseller] = await db.select().from(resellersTable).where(eq(resellersTable.email, adminEmail));
    if (!adminReseller) {
      const passwordHash = await bcryptjs.hash(adminPassword, 12);
      [adminReseller] = await db.insert(resellersTable).values({
        name: "Platform Admin",
        email: adminEmail,
        passwordHash,
        companyName: "MicroBooks",
        referralCode: "PLATFORM-ADMIN",
        commissionRate: 0,
        status: "active",
      }).returning();
    }
    const token = signResellerToken(adminReseller.id, adminReseller.email);
    res.json({
      token,
      reseller: { id: adminReseller.id, name: adminReseller.name, email: adminReseller.email, referralCode: adminReseller.referralCode, commissionRate: adminReseller.commissionRate },
    });
    return;
  }

  const [reseller] = await db.select().from(resellersTable).where(eq(resellersTable.email, email));
  if (!reseller) { res.status(401).json({ error: "Invalid email or password" }); return; }
  if (reseller.status !== "active") { res.status(403).json({ error: "Your account has been suspended" }); return; }

  const valid = await bcryptjs.compare(password, reseller.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }

  const token = signResellerToken(reseller.id, reseller.email);
  res.json({
    token,
    reseller: { id: reseller.id, name: reseller.name, email: reseller.email, referralCode: reseller.referralCode, commissionRate: reseller.commissionRate },
  });
});

/* ─── Get profile ─── */
router.get("/reseller/me", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const [reseller] = await db.select().from(resellersTable).where(eq(resellersTable.id, auth.resellerId));
  if (!reseller) { res.status(404).json({ error: "Not found" }); return; }

  res.json({
    id: reseller.id, name: reseller.name, email: reseller.email,
    companyName: reseller.companyName, phone: reseller.phone,
    referralCode: reseller.referralCode, commissionRate: reseller.commissionRate,
    paymentDetails: reseller.paymentDetails, status: reseller.status,
    createdAt: reseller.createdAt,
  });
});

/* ─── Update profile ─── */
const UpdateProfileBody = z.object({
  name: z.string().min(2).optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  paymentDetails: z.string().optional(),
});

router.patch("/reseller/me", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  await db.update(resellersTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(resellersTable.id, auth.resellerId));
  const [updated] = await db.select().from(resellersTable).where(eq(resellersTable.id, auth.resellerId));
  res.json({ id: updated.id, name: updated.name, email: updated.email, companyName: updated.companyName, phone: updated.phone, referralCode: updated.referralCode, paymentDetails: updated.paymentDetails });
});

/* ─── Dashboard stats ─── */
router.get("/reseller/dashboard", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const resellerId = auth.resellerId;

  // Total referrals
  const [{ totalReferrals }] = await db.select({ totalReferrals: count() })
    .from(tenantsTable).where(eq(tenantsTable.resellerId, resellerId));

  // Active subscriptions (paid status)
  const activeReferralRows = await db.select({ tenantId: tenantsTable.id })
    .from(tenantsTable).where(eq(tenantsTable.resellerId, resellerId));
  const tenantIds = activeReferralRows.map(r => r.tenantId);

  let activeSubscriptions = 0;
  if (tenantIds.length > 0) {
    const activeSubs = await db.select({ cnt: count() }).from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.status, "active"), sql`${subscriptionsTable.tenantId} = ANY(ARRAY[${sql.join(tenantIds.map(id => sql`${id}`), sql`, `)}])`));
    activeSubscriptions = activeSubs[0]?.cnt ?? 0;
  }

  // Lifetime earnings
  const [lifetimeRow] = await db.select({ total: sum(resellerCommissionsTable.commissionAmount) })
    .from(resellerCommissionsTable)
    .where(eq(resellerCommissionsTable.resellerId, resellerId));
  const lifetimeEarnings = Number(lifetimeRow?.total ?? 0);

  // This month earnings
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [monthRow] = await db.select({ total: sum(resellerCommissionsTable.commissionAmount) })
    .from(resellerCommissionsTable)
    .where(and(eq(resellerCommissionsTable.resellerId, resellerId), eq(resellerCommissionsTable.periodMonth, thisMonth)));
  const monthlyEarnings = Number(monthRow?.total ?? 0);

  // Pending payouts
  const [pendingRow] = await db.select({ total: sum(resellerPayoutsTable.amount) })
    .from(resellerPayoutsTable)
    .where(and(eq(resellerPayoutsTable.resellerId, resellerId), eq(resellerPayoutsTable.status, "pending")));
  const pendingPayouts = Number(pendingRow?.total ?? 0);

  // Recent months breakdown (last 6 months)
  const monthlyBreakdown = await db.select({
    month: resellerCommissionsTable.periodMonth,
    total: sum(resellerCommissionsTable.commissionAmount),
    count: count(),
  }).from(resellerCommissionsTable)
    .where(eq(resellerCommissionsTable.resellerId, resellerId))
    .groupBy(resellerCommissionsTable.periodMonth)
    .orderBy(desc(resellerCommissionsTable.periodMonth))
    .limit(6);

  res.json({
    totalReferrals,
    activeSubscriptions,
    lifetimeEarnings,
    monthlyEarnings,
    pendingPayouts,
    monthlyBreakdown,
  });
});

/* ─── Referrals list ─── */
router.get("/reseller/referrals", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const rows = await db.select({
    id: tenantsTable.id,
    businessName: tenantsTable.businessName,
    email: tenantsTable.email,
    country: tenantsTable.country,
    status: tenantsTable.status,
    createdAt: tenantsTable.createdAt,
    subscriptionStatus: subscriptionsTable.status,
    planId: subscriptionsTable.planId,
    currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    planName: subscriptionPlansTable.name,
    planPrice: subscriptionPlansTable.priceMonthly,
  }).from(tenantsTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.tenantId, tenantsTable.id))
    .leftJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId))
    .where(eq(tenantsTable.resellerId, auth.resellerId))
    .orderBy(desc(tenantsTable.createdAt));

  res.json(rows);
});

/* ─── Commissions list ─── */
router.get("/reseller/commissions", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const rows = await db.select({
    id: resellerCommissionsTable.id,
    tenantId: resellerCommissionsTable.tenantId,
    periodMonth: resellerCommissionsTable.periodMonth,
    baseAmount: resellerCommissionsTable.baseAmount,
    commissionRate: resellerCommissionsTable.commissionRate,
    commissionAmount: resellerCommissionsTable.commissionAmount,
    status: resellerCommissionsTable.status,
    payoutId: resellerCommissionsTable.payoutId,
    createdAt: resellerCommissionsTable.createdAt,
    businessName: tenantsTable.businessName,
    planName: subscriptionPlansTable.name,
  }).from(resellerCommissionsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, resellerCommissionsTable.tenantId))
    .leftJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, resellerCommissionsTable.planId))
    .where(eq(resellerCommissionsTable.resellerId, auth.resellerId))
    .orderBy(desc(resellerCommissionsTable.createdAt));

  res.json(rows);
});

/* ─── Payouts ─── */
router.get("/reseller/payouts", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const rows = await db.select().from(resellerPayoutsTable)
    .where(eq(resellerPayoutsTable.resellerId, auth.resellerId))
    .orderBy(desc(resellerPayoutsTable.createdAt));

  res.json(rows);
});

const RequestPayoutBody = z.object({
  notes: z.string().optional(),
});

router.post("/reseller/payouts", async (req, res): Promise<void> => {
  const auth = requireReseller(req, res);
  if (!auth) return;

  const parsed = RequestPayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  // Calculate pending commission amount
  const pendingCommissions = await db.select({
    id: resellerCommissionsTable.id,
    amount: resellerCommissionsTable.commissionAmount,
  }).from(resellerCommissionsTable)
    .where(and(
      eq(resellerCommissionsTable.resellerId, auth.resellerId),
      eq(resellerCommissionsTable.status, "pending"),
    ));

  if (pendingCommissions.length === 0) {
    res.status(400).json({ error: "No pending commissions to pay out" });
    return;
  }

  const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

  const [reseller] = await db.select({ paymentDetails: resellersTable.paymentDetails })
    .from(resellersTable).where(eq(resellersTable.id, auth.resellerId));

  const [payout] = await db.insert(resellerPayoutsTable).values({
    resellerId: auth.resellerId,
    amount: totalAmount,
    commissionCount: pendingCommissions.length,
    status: "pending",
    notes: parsed.data.notes,
    paymentDetails: reseller?.paymentDetails ?? undefined,
  }).returning();

  // Mark commissions as paid and link to payout
  await db.update(resellerCommissionsTable)
    .set({ status: "paid", payoutId: payout.id })
    .where(and(
      eq(resellerCommissionsTable.resellerId, auth.resellerId),
      eq(resellerCommissionsTable.status, "pending"),
    ));

  res.status(201).json(payout);
});

/* ─── Validate referral code (public) ─── */
router.get("/reseller/validate-code/:code", async (req, res): Promise<void> => {
  const [reseller] = await db.select({ id: resellersTable.id, name: resellersTable.name, referralCode: resellersTable.referralCode })
    .from(resellersTable)
    .where(and(eq(resellersTable.referralCode, req.params.code), eq(resellersTable.status, "active")));

  if (!reseller) { res.status(404).json({ error: "Invalid referral code" }); return; }
  res.json({ valid: true, reseller: { name: reseller.name, referralCode: reseller.referralCode } });
});

/* ═══════════════════════════════════════════════════
   SUPERADMIN endpoints for reseller management
═══════════════════════════════════════════════════ */
import jwt_pkg from "jsonwebtoken";

function verifySuperAdmin(req: any, res: any): boolean {
  const auth = req.headers?.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return false; }
  try {
    const p = jwt.verify(auth.slice(7), getJwtSecret()) as { type: string };
    if (p.type !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return false; }
    return true;
  } catch {
    res.status(401).json({ error: "Invalid token" }); return false;
  }
}

/* List all resellers */
router.get("/admin/resellers", async (req, res): Promise<void> => {
  if (!verifySuperAdmin(req, res)) return;

  const rows = await db.select({
    id: resellersTable.id,
    name: resellersTable.name,
    email: resellersTable.email,
    companyName: resellersTable.companyName,
    referralCode: resellersTable.referralCode,
    commissionRate: resellersTable.commissionRate,
    status: resellersTable.status,
    createdAt: resellersTable.createdAt,
    totalReferrals: sql<number>`(SELECT COUNT(*) FROM tenants WHERE tenants.reseller_id = ${resellersTable.id})`,
    lifetimeEarnings: sql<number>`(SELECT COALESCE(SUM(commission_amount), 0) FROM reseller_commissions WHERE reseller_commissions.reseller_id = ${resellersTable.id})`,
    pendingPayouts: sql<number>`(SELECT COALESCE(SUM(amount), 0) FROM reseller_payouts WHERE reseller_payouts.reseller_id = ${resellersTable.id} AND reseller_payouts.status = 'pending')`,
  }).from(resellersTable).orderBy(desc(resellersTable.createdAt));

  res.json(rows);
});

/* Update reseller status */
router.patch("/admin/resellers/:id", async (req, res): Promise<void> => {
  if (!verifySuperAdmin(req, res)) return;

  const id = parseInt(req.params.id);
  const { status, commissionRate } = req.body as { status?: string; commissionRate?: number };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (commissionRate != null) updates.commissionRate = commissionRate;

  await db.update(resellersTable).set(updates).where(eq(resellersTable.id, id));
  res.json({ success: true });
});

/* List all pending payouts (admin) */
router.get("/admin/reseller-payouts", async (req, res): Promise<void> => {
  if (!verifySuperAdmin(req, res)) return;

  const rows = await db.select({
    id: resellerPayoutsTable.id,
    resellerId: resellerPayoutsTable.resellerId,
    amount: resellerPayoutsTable.amount,
    commissionCount: resellerPayoutsTable.commissionCount,
    status: resellerPayoutsTable.status,
    notes: resellerPayoutsTable.notes,
    paymentDetails: resellerPayoutsTable.paymentDetails,
    requestedAt: resellerPayoutsTable.requestedAt,
    paidAt: resellerPayoutsTable.paidAt,
    resellerName: resellersTable.name,
    resellerEmail: resellersTable.email,
  }).from(resellerPayoutsTable)
    .leftJoin(resellersTable, eq(resellersTable.id, resellerPayoutsTable.resellerId))
    .orderBy(desc(resellerPayoutsTable.createdAt));

  res.json(rows);
});

/* Mark payout as paid (admin) */
router.patch("/admin/reseller-payouts/:id", async (req, res): Promise<void> => {
  if (!verifySuperAdmin(req, res)) return;

  const id = parseInt(req.params.id);
  const { status, notes } = req.body as { status: string; notes?: string };

  await db.update(resellerPayoutsTable).set({
    status,
    notes: notes ?? undefined,
    paidAt: status === "paid" ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(eq(resellerPayoutsTable.id, id));

  res.json({ success: true });
});

/* Generate monthly commissions manually (admin trigger) */
router.post("/admin/reseller-commissions/generate", async (req, res): Promise<void> => {
  if (!verifySuperAdmin(req, res)) return;

  const periodMonth = req.body?.periodMonth ?? new Date().toISOString().slice(0, 7);

  // Find all active subscriptions for tenants with a reseller
  const rows = await db.select({
    tenantId: tenantsTable.id,
    resellerId: tenantsTable.resellerId,
    planId: subscriptionsTable.planId,
    planPrice: subscriptionPlansTable.priceMonthly,
    commissionRate: resellersTable.commissionRate,
  }).from(tenantsTable)
    .innerJoin(subscriptionsTable, and(eq(subscriptionsTable.tenantId, tenantsTable.id), eq(subscriptionsTable.status, "active")))
    .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId))
    .innerJoin(resellersTable, eq(resellersTable.id, tenantsTable.resellerId))
    .where(sql`${tenantsTable.resellerId} IS NOT NULL`);

  let created = 0;
  for (const row of rows) {
    if (!row.resellerId) continue;

    // Check if commission already exists for this period
    const [existing] = await db.select({ id: resellerCommissionsTable.id })
      .from(resellerCommissionsTable)
      .where(and(
        eq(resellerCommissionsTable.resellerId, row.resellerId),
        eq(resellerCommissionsTable.tenantId, row.tenantId),
        eq(resellerCommissionsTable.periodMonth, periodMonth),
      ));

    if (existing) continue;

    const baseAmount = row.planPrice ?? 0;
    const commissionAmount = baseAmount * (row.commissionRate ?? 0.30);

    await db.insert(resellerCommissionsTable).values({
      resellerId: row.resellerId,
      tenantId: row.tenantId,
      planId: row.planId ?? undefined,
      periodMonth,
      baseAmount,
      commissionRate: row.commissionRate ?? 0.30,
      commissionAmount,
      status: "pending",
    });
    created++;
  }

  res.json({ created, periodMonth });
});

export default router;

/* ─── Helper: record commission on a successful payment ─── */
export async function recordResellerCommission(
  tenantId: number,
  planId: number | null,
  baseAmount: number,
): Promise<void> {
  try {
    const [tenant] = await db.select({ resellerId: tenantsTable.resellerId })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    if (!tenant?.resellerId) return;

    const [reseller] = await db.select({ commissionRate: resellersTable.commissionRate, status: resellersTable.status })
      .from(resellersTable).where(eq(resellersTable.id, tenant.resellerId));
    if (!reseller || reseller.status !== "active") return;

    const periodMonth = new Date().toISOString().slice(0, 7);

    // Prevent duplicate commission for same period+tenant
    const [existing] = await db.select({ id: resellerCommissionsTable.id })
      .from(resellerCommissionsTable)
      .where(and(
        eq(resellerCommissionsTable.resellerId, tenant.resellerId),
        eq(resellerCommissionsTable.tenantId, tenantId),
        eq(resellerCommissionsTable.periodMonth, periodMonth),
      ));
    if (existing) return;

    const commissionAmount = baseAmount * reseller.commissionRate;
    await db.insert(resellerCommissionsTable).values({
      resellerId: tenant.resellerId,
      tenantId,
      planId: planId ?? undefined,
      periodMonth,
      baseAmount,
      commissionRate: reseller.commissionRate,
      commissionAmount,
      status: "pending",
    });
  } catch (err) {
    console.error("Failed to record reseller commission:", err);
  }
}
