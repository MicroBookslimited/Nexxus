import { Router, type IRouter } from "express";
import { db, tenantsTable, subscriptionsTable, subscriptionPlansTable, resellersTable, tenantAdminUsersTable, subscriptionManualPaymentsTable } from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";
import { applyDueManualPayments } from "../utils/manual-payments";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { SendMailClient } from "zeptomail";
import crypto from "crypto";
import { trackTenantEvent, TenantEventType, clientIp } from "../lib/tenant-events";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signToken(tenantId: number, email: string, adminUserId?: number, isPrimary?: boolean) {
  return jwt.sign({ tenantId, email, type: "tenant", adminUserId, isPrimary }, getJwtSecret(), { expiresIn: "90d" });
}

export function verifyTenantToken(token: string): { tenantId: number; email: string; adminUserId?: number; isPrimary?: boolean; impersonation?: boolean; impersonationLogId?: number; restrictedRole?: string; actorTechnicianId?: number; actorName?: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { tenantId: number; email: string; type: string; adminUserId?: number; isPrimary?: boolean; impersonation?: boolean; impersonationLogId?: number; restrictedRole?: string; actorTechnicianId?: number; actorName?: string };
    if (payload.type !== "tenant") return null;
    return {
      tenantId: payload.tenantId,
      email: payload.email,
      adminUserId: payload.adminUserId,
      isPrimary: payload.isPrimary,
      impersonation: payload.impersonation,
      impersonationLogId: payload.impersonationLogId,
      restrictedRole: payload.restrictedRole,
      actorTechnicianId: payload.actorTechnicianId,
      actorName: payload.actorName,
    };
  } catch {
    return null;
  }
}

/**
 * Returns true and lets the request proceed if the tenant token has full access.
 * Returns false (and writes a 403) if the token is restricted (e.g. technician).
 * Use to gate write operations that technicians must not perform.
 */
export function requireFullTenant(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: object) => void } },
): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return false;
  }
  if (payload.restrictedRole === "technician") {
    res.status(403).json({ error: "Technicians cannot perform sales or financial operations" });
    return false;
  }
  return true;
}

function getAppBase(): string {
  if (process.env["APP_BASE_URL"]) return process.env["APP_BASE_URL"];
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) return `https://${replitDomains.split(",")[0]!.trim()}`;
  return "";
}

async function sendVerificationEmail(email: string, token: string, businessName: string) {
  const zeptoToken = process.env["ZEPTOMAIL_TOKEN"];
  if (!zeptoToken) { console.warn("ZEPTOMAIL_TOKEN not configured — skipping verification email"); return; }
  const link = `${getAppBase()}/app/verify-email?token=${token}`;
  try {
    const zepto = new SendMailClient({ url: "api.zeptomail.com/", token: zeptoToken });
    await zepto.sendMail({
      from: { address: "noreply@microbookspos.com", name: "NEXXUS POS" },
      to: [{ email_address: { address: email } }],
      subject: "Verify your NEXXUS POS email address",
      htmlbody: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1729;padding:32px;border-radius:12px;color:#f1f5f9">
          <h1 style="font-size:22px;margin:0 0 8px">Verify your email</h1>
          <p style="color:#94a3b8;margin:0 0 8px">Hi ${businessName},</p>
          <p style="color:#94a3b8;margin:0 0 24px">Please verify your email address to secure your NEXXUS POS account.</p>
          <a href="${link}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Verify Email Address</a>
          <p style="color:#475569;font-size:13px;margin:24px 0 0">If you did not sign up for NEXXUS POS, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
          <p style="color:#334155;font-size:12px;margin:0">Powered by MicroBooks · NEXXUS POS</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }
}

const RegisterBody = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  country: z.string().optional(),
  referralCode: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/saas/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { businessName, ownerName, email, password, phone, country, referralCode } = parsed.data;

  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Resolve referral code → reseller id (fraud check: code must be valid and active)
  let resellerId: number | undefined;
  if (referralCode) {
    const [reseller] = await db.select({ id: resellersTable.id, status: resellersTable.status })
      .from(resellersTable).where(eq(resellersTable.referralCode, referralCode.toUpperCase()));
    if (reseller && reseller.status === "active") {
      resellerId = reseller.id;
    }
  }

  const passwordHash = await bcryptjs.hash(password, 12);

  const emailVerificationToken = crypto.randomUUID();

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      businessName,
      ownerName,
      email,
      passwordHash,
      phone,
      country: country ?? "US",
      status: "active",
      onboardingStep: 2,
      onboardingComplete: false,
      resellerId,
      emailVerified: false,
      emailVerificationToken,
    })
    .returning();

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await db.insert(subscriptionsTable).values({
    tenantId: tenant.id,
    status: "trial",
    trialEndsAt: trialEnd,
  });

  // Send verification email (non-blocking)
  sendVerificationEmail(email, emailVerificationToken, businessName).catch(() => {});

  const token = signToken(tenant.id, tenant.email);
  res.json({ token, tenant: { id: tenant.id, businessName: tenant.businessName, email: tenant.email, onboardingStep: tenant.onboardingStep, emailVerified: false } });
});

router.post("/saas/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { email: rawEmail, password } = parsed.data;
  const email = rawEmail.toLowerCase().trim();

  try {
    const dbUrl =
      process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
    const u = new URL(dbUrl);
    let provider = "unknown";
    if (u.hostname.includes("supabase")) provider = "supabase";
    else if (u.hostname.includes("neon")) provider = "neon";
    else if (u.hostname.includes("replit") || u.hostname.includes("helium"))
      provider = "replit";
    console.log(
      `[login] db host=${u.hostname} db=${u.pathname.replace("/", "")} provider=${provider} source=${process.env.SUPABASE_DATABASE_URL ? "SUPABASE_DATABASE_URL" : "DATABASE_URL"}`,
    );
  } catch {
    console.log("[login] db host=<unparseable>");
  }

  // 1. Check tenant_admin_users first (supports multi-admin per tenant)
  const [adminUser] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(sql`lower(${tenantAdminUsersTable.email}) = ${email}`, eq(tenantAdminUsersTable.status, "active")));

  if (adminUser) {
    if (!adminUser.passwordHash) {
      res.status(401).json({ error: "No password set. Use your invite link to set a password." });
      return;
    }
    const valid = await bcryptjs.compare(password, adminUser.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, adminUser.tenantId));

    if (!tenant) {
      res.status(401).json({ error: "Account not found" });
      return;
    }

    const [subscription] = await db
      .select({ status: subscriptionsTable.status, planId: subscriptionsTable.planId, trialEndsAt: subscriptionsTable.trialEndsAt })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenant.id));

    await db.update(tenantsTable).set({ lastLoginAt: new Date() }).where(eq(tenantsTable.id, tenant.id));

    trackTenantEvent({
      tenantId: tenant.id,
      userId: adminUser.id,
      eventType: TenantEventType.LOGIN,
      metadata: { email: adminUser.email },
      ipAddress: clientIp(req.headers, req.ip),
    });

    const token = signToken(tenant.id, adminUser.email, adminUser.id, adminUser.isPrimary);
    res.json({
      token,
      tenant: {
        id: tenant.id,
        businessName: tenant.businessName,
        email: adminUser.email,
        onboardingStep: tenant.onboardingStep,
        onboardingComplete: tenant.onboardingComplete,
        emailVerified: tenant.emailVerified,
      },
      subscription,
      adminUser: { id: adminUser.id, name: adminUser.name, email: adminUser.email, isPrimary: adminUser.isPrimary },
    });
    return;
  }

  // 2. Fall back to legacy tenant login (also auto-migrates primary admin record)
  const [tenant] = await db.select().from(tenantsTable).where(sql`lower(${tenantsTable.email}) = ${email}`);
  if (!tenant) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcryptjs.compare(password, tenant.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Auto-migrate: create primary admin user record if it doesn't exist yet
  let primaryAdmin = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.tenantId, tenant.id), eq(tenantAdminUsersTable.isPrimary, true)))
    .then(r => r[0]);

  if (!primaryAdmin) {
    [primaryAdmin] = await db
      .insert(tenantAdminUsersTable)
      .values({
        tenantId: tenant.id,
        name: tenant.ownerName,
        email: tenant.email,
        passwordHash: tenant.passwordHash,
        isPrimary: true,
        status: "active",
      })
      .returning();
  }

  const [subscription] = await db
    .select({ status: subscriptionsTable.status, planId: subscriptionsTable.planId, trialEndsAt: subscriptionsTable.trialEndsAt })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id));

  await db.update(tenantsTable).set({ lastLoginAt: new Date() }).where(eq(tenantsTable.id, tenant.id));

  trackTenantEvent({
    tenantId: tenant.id,
    userId: primaryAdmin?.id,
    eventType: TenantEventType.LOGIN,
    metadata: { email: tenant.email, legacy: true },
    ipAddress: clientIp(req.headers, req.ip),
  });

  const token = signToken(tenant.id, tenant.email, primaryAdmin?.id, true);
  res.json({
    token,
    tenant: {
      id: tenant.id,
      businessName: tenant.businessName,
      email: tenant.email,
      onboardingStep: tenant.onboardingStep,
      onboardingComplete: tenant.onboardingComplete,
      emailVerified: tenant.emailVerified,
    },
    subscription,
    adminUser: { id: primaryAdmin?.id, name: tenant.ownerName, email: tenant.email, isPrimary: true },
  });
});

router.get("/saas/me", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await applyDueManualPayments(tenant.id);

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id));

  let plan = null;
  if (subscription?.planId) {
    const [p] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, subscription.planId));
    plan = p;
  }

  // Fetch the next scheduled manual payment (earliest start date) so the frontend
  // can show a different renewal message to tenants who have already pre-paid.
  const [nextScheduledPayment] = await db
    .select({
      id: subscriptionManualPaymentsTable.id,
      planId: subscriptionManualPaymentsTable.planId,
      planName: subscriptionPlansTable.name,
      billingCycle: subscriptionManualPaymentsTable.billingCycle,
      amount: subscriptionManualPaymentsTable.amount,
      scheduledStartDate: subscriptionManualPaymentsTable.scheduledStartDate,
      scheduledEndDate: subscriptionManualPaymentsTable.scheduledEndDate,
    })
    .from(subscriptionManualPaymentsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionManualPaymentsTable.planId, subscriptionPlansTable.id))
    .where(and(
      eq(subscriptionManualPaymentsTable.tenantId, tenant.id),
      eq(subscriptionManualPaymentsTable.status, "scheduled"),
    ))
    .orderBy(asc(subscriptionManualPaymentsTable.scheduledStartDate))
    .limit(1);

  res.json({
    tenant: { id: tenant.id, businessName: tenant.businessName, email: tenant.email, ownerName: tenant.ownerName, phone: tenant.phone, address: tenant.address, country: tenant.country, slug: tenant.slug, onboardingStep: tenant.onboardingStep, onboardingComplete: tenant.onboardingComplete, status: tenant.status, emailVerified: tenant.emailVerified },
    subscription,
    plan,
    nextScheduledPayment: nextScheduledPayment ?? null,
  });
});

/* ─── My Account (self-service profile / email / password) ─── */

/**
 * Resolves the credential the logged-in admin authenticates with. Multi-admin
 * tenants store the password on `tenant_admin_users`; legacy single-tenant
 * accounts store it on `tenants`. The primary admin is mirrored on both, so we
 * keep both in sync on change.
 */
async function resolveAccount(payload: { tenantId: number; adminUserId?: number }) {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  if (!tenant) return null;
  let adminUser: typeof tenantAdminUsersTable.$inferSelect | null = null;
  if (payload.adminUserId) {
    const [au] = await db
      .select()
      .from(tenantAdminUsersTable)
      .where(and(eq(tenantAdminUsersTable.id, payload.adminUserId), eq(tenantAdminUsersTable.tenantId, payload.tenantId)));
    adminUser = au ?? null;
  }
  // Legacy/older tokens may lack adminUserId. Fall back to the tenant's primary
  // active admin row so credential changes stay mirrored across both stores —
  // login checks tenant_admin_users before the tenants fallback, so an out-of-sync
  // admin row would otherwise keep serving the old password/email.
  if (!adminUser) {
    const [primary] = await db
      .select()
      .from(tenantAdminUsersTable)
      .where(and(
        eq(tenantAdminUsersTable.tenantId, payload.tenantId),
        eq(tenantAdminUsersTable.isPrimary, true),
        eq(tenantAdminUsersTable.status, "active"),
      ));
    adminUser = primary ?? null;
  }
  const credentialHash = adminUser?.passwordHash ?? tenant.passwordHash;
  const isPrimary = adminUser ? adminUser.isPrimary : true;
  return { tenant, adminUser, credentialHash, isPrimary };
}

const UpdateProfileBody = z.object({
  businessName: z.string().trim().min(1, "Business name is required").optional(),
  ownerName: z.string().trim().min(1, "Owner name is required").optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

router.patch("/saas/account/profile", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
  if (payload.restrictedRole) { res.status(403).json({ error: "Not permitted for this session" }); return; }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) fields[k] = v === "" ? null : v;
  }
  if (Object.keys(fields).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  await db.update(tenantsTable).set({ ...fields, updatedAt: new Date() }).where(eq(tenantsTable.id, payload.tenantId));
  const [updated] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  res.json({
    tenant: {
      id: updated!.id, businessName: updated!.businessName, email: updated!.email, ownerName: updated!.ownerName,
      phone: updated!.phone, address: updated!.address, country: updated!.country, slug: updated!.slug,
      onboardingStep: updated!.onboardingStep, onboardingComplete: updated!.onboardingComplete,
      status: updated!.status, emailVerified: updated!.emailVerified,
    },
  });
});

const UpdateEmailBody = z.object({
  newEmail: z.string().trim().email("Enter a valid email address"),
  currentPassword: z.string().min(1, "Current password is required"),
});

router.patch("/saas/account/email", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
  if (payload.restrictedRole) { res.status(403).json({ error: "Not permitted for this session" }); return; }

  const parsed = UpdateEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const account = await resolveAccount(payload);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  if (!account.credentialHash) { res.status(400).json({ error: "No password is set on this account" }); return; }

  const valid = await bcryptjs.compare(parsed.data.currentPassword, account.credentialHash);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }

  const newEmail = parsed.data.newEmail;

  // Reject if the email is already used by another tenant or another active admin user.
  const [tenantConflict] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(and(sql`lower(${tenantsTable.email}) = ${newEmail.toLowerCase()}`, sql`${tenantsTable.id} <> ${payload.tenantId}`));
  if (tenantConflict) { res.status(409).json({ error: "That email is already in use" }); return; }

  const adminConflicts = await db
    .select({ id: tenantAdminUsersTable.id })
    .from(tenantAdminUsersTable)
    .where(and(
      sql`lower(${tenantAdminUsersTable.email}) = ${newEmail.toLowerCase()}`,
      eq(tenantAdminUsersTable.status, "active"),
    ));
  const conflictWithOther = adminConflicts.some((a) => a.id !== account.adminUser?.id);
  if (conflictWithOther) { res.status(409).json({ error: "That email is already in use" }); return; }

  const now = new Date();
  if (account.adminUser) {
    await db.update(tenantAdminUsersTable).set({ email: newEmail, updatedAt: now }).where(eq(tenantAdminUsersTable.id, account.adminUser.id));
  }
  if (account.isPrimary) {
    await db.update(tenantsTable).set({ email: newEmail, emailVerified: false, emailVerificationToken: null, updatedAt: now }).where(eq(tenantsTable.id, payload.tenantId));
  }

  // Re-issue the token so its embedded email matches the new value.
  const token = signToken(payload.tenantId, newEmail, payload.adminUserId, payload.isPrimary);
  res.json({ success: true, token, email: newEmail });
});

const UpdatePasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

router.patch("/saas/account/password", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
  if (payload.restrictedRole) { res.status(403).json({ error: "Not permitted for this session" }); return; }

  const parsed = UpdatePasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const account = await resolveAccount(payload);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  if (!account.credentialHash) { res.status(400).json({ error: "No password is set on this account" }); return; }

  const valid = await bcryptjs.compare(parsed.data.currentPassword, account.credentialHash);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.newPassword, 12);
  const now = new Date();
  if (account.adminUser) {
    await db.update(tenantAdminUsersTable).set({ passwordHash, updatedAt: now }).where(eq(tenantAdminUsersTable.id, account.adminUser.id));
  }
  if (account.isPrimary) {
    await db.update(tenantsTable).set({ passwordHash, updatedAt: now }).where(eq(tenantsTable.id, payload.tenantId));
  }

  // Re-issue the current session's token so this session stays signed in.
  const token = signToken(payload.tenantId, payload.email, payload.adminUserId, payload.isPrimary);
  res.json({ success: true, token });
});

/* ─── Email Verification ─── */

router.post("/saas/send-verification", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  if (!tenant) { res.status(404).json({ error: "Account not found" }); return; }
  if (tenant.emailVerified) { res.json({ success: true, alreadyVerified: true }); return; }

  // Generate a fresh token each time
  const verificationToken = crypto.randomUUID();
  await db.update(tenantsTable)
    .set({ emailVerificationToken: verificationToken, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenant.id));

  await sendVerificationEmail(tenant.email, verificationToken, tenant.businessName);
  res.json({ success: true });
});

router.post("/saas/verify-email", async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Verification token is required" }); return;
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, emailVerified: tenantsTable.emailVerified })
    .from(tenantsTable)
    .where(eq(tenantsTable.emailVerificationToken, token));

  if (!tenant) {
    res.status(400).json({ error: "Invalid or expired verification link" }); return;
  }

  if (!tenant.emailVerified) {
    await db.update(tenantsTable)
      .set({ emailVerified: true, emailVerificationToken: null, updatedAt: new Date() })
      .where(eq(tenantsTable.id, tenant.id));
  }

  res.json({ success: true });
});

/* ─── Forgot Password ─── */
const ForgotPasswordBody = z.object({ email: z.string().email() });

router.post("/saas/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid email address" }); return; }

  const [tenant] = await db.select({ id: tenantsTable.id, email: tenantsTable.email, businessName: tenantsTable.businessName })
    .from(tenantsTable).where(eq(tenantsTable.email, parsed.data.email));

  if (!tenant) {
    res.json({ success: true });
    return;
  }

  const resetToken = jwt.sign(
    { tenantId: tenant.id, email: tenant.email, type: "password_reset" },
    getJwtSecret(),
    { expiresIn: "1h" }
  );

  const resetLink = `${getAppBase()}/app/reset-password?token=${resetToken}`;

  try {
    const zeptoToken = process.env["ZEPTOMAIL_TOKEN"];
    if (!zeptoToken) throw new Error("ZEPTOMAIL_TOKEN not configured");
    const zepto = new SendMailClient({ url: "api.zeptomail.com/", token: zeptoToken });
    await zepto.sendMail({
      from: { address: "noreply@microbookspos.com", name: "NEXXUS POS" },
      to: [{ email_address: { address: tenant.email } }],
      subject: "Reset your NEXXUS POS password",
      htmlbody: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1729;padding:32px;border-radius:12px;color:#f1f5f9">
          <h1 style="font-size:22px;margin:0 0 8px">Reset your password</h1>
          <p style="color:#94a3b8;margin:0 0 24px">We received a request to reset the password for your NEXXUS POS account (${tenant.email}).</p>
          <a href="${resetLink}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reset Password</a>
          <p style="color:#475569;font-size:13px;margin:24px 0 0">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
          <p style="color:#334155;font-size:12px;margin:0">Powered by MicroBooks · NEXXUS POS</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  res.json({ success: true });
});

/* ─── Reset Password ─── */
const ResetPasswordBody = z.object({
  token: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/saas/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  let payload: { tenantId: number; email: string; type: string };
  try {
    payload = jwt.verify(parsed.data.token, getJwtSecret()) as typeof payload;
  } catch {
    res.status(400).json({ error: "Reset link is invalid or has expired. Please request a new one." }); return;
  }

  if (payload.type !== "password_reset") {
    res.status(400).json({ error: "Invalid reset token" }); return;
  }

  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  if (!tenant) { res.status(404).json({ error: "Account not found" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.newPassword, 12);
  const now = new Date();
  // Login checks tenant_admin_users before the tenants fallback, so both stores
  // MUST be synced atomically or a partial failure silently breaks reset login.
  await db.transaction(async (tx) => {
    await tx.update(tenantsTable).set({ passwordHash, updatedAt: now }).where(eq(tenantsTable.id, tenant.id));
    await tx
      .update(tenantAdminUsersTable)
      .set({ passwordHash, updatedAt: now })
      .where(and(eq(tenantAdminUsersTable.tenantId, tenant.id), sql`lower(${tenantAdminUsersTable.email}) = ${payload.email.toLowerCase()}`));
  });

  res.json({ success: true });
});

router.patch("/saas/onboarding", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { step, ...fields } = req.body as { step: number; [key: string]: unknown };

  await db
    .update(tenantsTable)
    .set({ ...fields, onboardingStep: step, updatedAt: new Date() })
    .where(eq(tenantsTable.id, payload.tenantId));

  if (step >= 5) {
    await db.update(tenantsTable).set({ onboardingComplete: true }).where(eq(tenantsTable.id, payload.tenantId));
  }

  const [updated] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  res.json({ tenant: updated });
});

export default router;
