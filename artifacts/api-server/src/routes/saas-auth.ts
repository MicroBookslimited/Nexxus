import { Router, type IRouter } from "express";
import { db, tenantsTable, subscriptionsTable, subscriptionPlansTable, resellersTable, tenantAdminUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { SendMailClient } from "zeptomail";
import crypto from "crypto";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signToken(tenantId: number, email: string, adminUserId?: number, isPrimary?: boolean) {
  return jwt.sign({ tenantId, email, type: "tenant", adminUserId, isPrimary }, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyTenantToken(token: string): { tenantId: number; email: string; adminUserId?: number; isPrimary?: boolean } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { tenantId: number; email: string; type: string; adminUserId?: number; isPrimary?: boolean };
    if (payload.type !== "tenant") return null;
    return { tenantId: payload.tenantId, email: payload.email, adminUserId: payload.adminUserId, isPrimary: payload.isPrimary };
  } catch {
    return null;
  }
}

async function sendVerificationEmail(email: string, token: string, businessName: string) {
  const zeptoToken = process.env["ZEPTOMAIL_TOKEN"];
  if (!zeptoToken) { console.warn("ZEPTOMAIL_TOKEN not configured — skipping verification email"); return; }
  const appBase = process.env["APP_BASE_URL"] ?? "";
  const link = `${appBase}/app/verify-email?token=${token}`;
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

  const { email, password } = parsed.data;

  // 1. Check tenant_admin_users first (supports multi-admin per tenant)
  const [adminUser] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.email, email), eq(tenantAdminUsersTable.status, "active")));

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
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.email, email));
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

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id));

  let plan = null;
  if (subscription?.planId) {
    const [p] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, subscription.planId));
    plan = p;
  }

  res.json({ tenant: { id: tenant.id, businessName: tenant.businessName, email: tenant.email, ownerName: tenant.ownerName, phone: tenant.phone, country: tenant.country, slug: tenant.slug, onboardingStep: tenant.onboardingStep, onboardingComplete: tenant.onboardingComplete, status: tenant.status, emailVerified: tenant.emailVerified }, subscription, plan });
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

  const appBase = process.env["APP_BASE_URL"] ?? "";
  const resetLink = `${appBase}/app/reset-password?token=${resetToken}`;

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
  await db.update(tenantsTable).set({ passwordHash, updatedAt: new Date() }).where(eq(tenantsTable.id, tenant.id));

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
