import { Router, type IRouter } from "express";
import { db, tenantsTable, tenantAdminUsersTable, subscriptionsTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { SendMailClient } from "zeptomail";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function getTenantId(req: { headers: Record<string, string | undefined> }): { tenantId: number; isPrimary: boolean; adminUserId?: number } | null {
  const auth = (req as never as { headers: { authorization?: string } }).headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? { tenantId: p.tenantId, isPrimary: (p as { isPrimary?: boolean }).isPrimary ?? false, adminUserId: (p as { adminUserId?: number }).adminUserId } : null;
}

async function sendAdminInviteEmail(
  email: string,
  name: string,
  businessName: string,
  inviteToken: string
) {
  const zeptoToken = process.env["ZEPTOMAIL_TOKEN"];
  const appBase = process.env["APP_BASE_URL"] ?? "";
  const link = `${appBase}/app/admin-invite?token=${inviteToken}`;

  if (!zeptoToken) {
    console.warn("[admin-invite] ZEPTOMAIL_TOKEN not configured — skipping invite email. Link:", link);
    return link;
  }

  try {
    const zepto = new SendMailClient({ url: "api.zeptomail.com/", token: zeptoToken });
    await zepto.sendMail({
      from: { address: "noreply@microbookspos.com", name: "NEXXUS POS" },
      to: [{ email_address: { address: email } }],
      subject: `You've been invited to manage ${businessName} on NEXXUS POS`,
      htmlbody: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1729;padding:32px;border-radius:12px;color:#f1f5f9">
          <h1 style="font-size:22px;margin:0 0 8px">You're invited!</h1>
          <p style="color:#94a3b8;margin:0 0 8px">Hi ${name},</p>
          <p style="color:#94a3b8;margin:0 0 24px">You've been added as an admin for <strong style="color:#f1f5f9">${businessName}</strong> on NEXXUS POS. Click below to set your password and access the system.</p>
          <a href="${link}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept Invitation &amp; Set Password</a>
          <p style="color:#475569;font-size:13px;margin:24px 0 0">This invitation link expires in 48 hours. If you were not expecting this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
          <p style="color:#334155;font-size:12px;margin:0">Powered by MicroBooks · NEXXUS POS</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[admin-invite] Failed to send invite email:", err);
  }
  return link;
}

/* ─── GET /admin-users — list all admin users for this tenant ─── */
router.get("/admin-users", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const users = await db
    .select({
      id: tenantAdminUsersTable.id,
      name: tenantAdminUsersTable.name,
      email: tenantAdminUsersTable.email,
      isPrimary: tenantAdminUsersTable.isPrimary,
      status: tenantAdminUsersTable.status,
      hasPassword: tenantAdminUsersTable.passwordHash,
      createdAt: tenantAdminUsersTable.createdAt,
    })
    .from(tenantAdminUsersTable)
    .where(eq(tenantAdminUsersTable.tenantId, ctx.tenantId))
    .orderBy(tenantAdminUsersTable.createdAt);

  res.json(users.map(u => ({ ...u, hasPassword: !!u.hasPassword })));
});

/* ─── POST /admin-users — create a new admin user ─── */
const CreateAdminUserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  sendInvite: z.boolean().optional().default(false),
});

router.post("/admin-users", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }); return; }

  const { name, password, sendInvite } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: tenantAdminUsersTable.id })
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.tenantId, ctx.tenantId), sql`lower(${tenantAdminUsersTable.email}) = ${email}`));

  if (existing) { res.status(409).json({ error: "An admin user with this email already exists" }); return; }

  const [tenant] = await db.select({ businessName: tenantsTable.businessName }).from(tenantsTable).where(eq(tenantsTable.id, ctx.tenantId));

  let passwordHash: string | undefined;
  if (password) passwordHash = await bcryptjs.hash(password, 12);

  let inviteToken: string | undefined;
  let inviteExpiresAt: Date | undefined;
  if (sendInvite) {
    inviteToken = crypto.randomBytes(32).toString("hex");
    inviteExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  }

  const [created] = await db
    .insert(tenantAdminUsersTable)
    .values({
      tenantId: ctx.tenantId,
      name,
      email,
      passwordHash: passwordHash ?? null,
      isPrimary: false,
      inviteToken: inviteToken ?? null,
      inviteExpiresAt: inviteExpiresAt ?? null,
      status: sendInvite && !password ? "invited" : "active",
    })
    .returning();

  let inviteLink: string | undefined;
  if (sendInvite && inviteToken) {
    inviteLink = await sendAdminInviteEmail(email, name, tenant?.businessName ?? "your business", inviteToken);
  }

  res.status(201).json({ ...created, passwordHash: undefined, hasPassword: !!created.passwordHash, inviteLink });
});

/* ─── PUT /admin-users/:id — update name / email / status ─── */
const UpdateAdminUserBody = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

router.put("/admin-users/:id", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [existing] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.id, id), eq(tenantAdminUsersTable.tenantId, ctx.tenantId)));

  if (!existing) { res.status(404).json({ error: "Admin user not found" }); return; }

  const [updated] = await db
    .update(tenantAdminUsersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(tenantAdminUsersTable.id, id))
    .returning();

  res.json({ ...updated, passwordHash: undefined, hasPassword: !!updated.passwordHash });
});

/* ─── DELETE /admin-users/:id — delete a non-primary admin user ─── */
router.delete("/admin-users/:id", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.id, id), eq(tenantAdminUsersTable.tenantId, ctx.tenantId)));

  if (!existing) { res.status(404).json({ error: "Admin user not found" }); return; }
  if (existing.isPrimary) { res.status(403).json({ error: "Cannot delete the primary admin account" }); return; }

  await db.delete(tenantAdminUsersTable).where(eq(tenantAdminUsersTable.id, id));
  res.json({ success: true });
});

/* ─── POST /admin-users/:id/set-password — set or reset password ─── */
const SetPasswordBody = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/admin-users/:id/set-password", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SetPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }); return; }

  const [existing] = await db
    .select({ id: tenantAdminUsersTable.id })
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.id, id), eq(tenantAdminUsersTable.tenantId, ctx.tenantId)));

  if (!existing) { res.status(404).json({ error: "Admin user not found" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.password, 12);
  await db
    .update(tenantAdminUsersTable)
    .set({ passwordHash, status: "active", inviteToken: null, inviteExpiresAt: null, updatedAt: new Date() })
    .where(eq(tenantAdminUsersTable.id, id));

  res.json({ success: true });
});

/* ─── POST /admin-users/:id/send-invite — (re)send invite email ─── */
router.post("/admin-users/:id/send-invite", async (req, res): Promise<void> => {
  const ctx = getTenantId(req as never);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(and(eq(tenantAdminUsersTable.id, id), eq(tenantAdminUsersTable.tenantId, ctx.tenantId)));

  if (!user) { res.status(404).json({ error: "Admin user not found" }); return; }

  const [tenant] = await db.select({ businessName: tenantsTable.businessName }).from(tenantsTable).where(eq(tenantsTable.id, ctx.tenantId));

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await db
    .update(tenantAdminUsersTable)
    .set({ inviteToken, inviteExpiresAt, status: user.passwordHash ? user.status : "invited", updatedAt: new Date() })
    .where(eq(tenantAdminUsersTable.id, id));

  const inviteLink = await sendAdminInviteEmail(user.email, user.name, tenant?.businessName ?? "your business", inviteToken);

  res.json({ success: true, inviteLink });
});

/* ─── GET /admin-users/validate-invite/:token — validate invite (PUBLIC) ─── */
router.get("/admin-users/validate-invite/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;

  const [user] = await db
    .select({ id: tenantAdminUsersTable.id, name: tenantAdminUsersTable.name, email: tenantAdminUsersTable.email, tenantId: tenantAdminUsersTable.tenantId, inviteExpiresAt: tenantAdminUsersTable.inviteExpiresAt })
    .from(tenantAdminUsersTable)
    .where(eq(tenantAdminUsersTable.inviteToken, token));

  if (!user) { res.status(404).json({ error: "Invite link is invalid or has already been used" }); return; }
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) { res.status(410).json({ error: "Invite link has expired. Ask your admin to resend the invitation." }); return; }

  const [tenant] = await db.select({ businessName: tenantsTable.businessName }).from(tenantsTable).where(eq(tenantsTable.id, user.tenantId));

  res.json({ name: user.name, email: user.email, businessName: tenant?.businessName ?? "" });
});

/* ─── POST /admin-users/accept-invite — accept invite + set password (PUBLIC) ─── */
const AcceptInviteBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

import jwt from "jsonwebtoken";

router.post("/admin-users/accept-invite", async (req, res): Promise<void> => {
  const parsed = AcceptInviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }); return; }

  const [user] = await db
    .select()
    .from(tenantAdminUsersTable)
    .where(eq(tenantAdminUsersTable.inviteToken, parsed.data.token));

  if (!user) { res.status(404).json({ error: "Invite link is invalid or has already been used" }); return; }
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) { res.status(410).json({ error: "Invite link has expired" }); return; }

  const passwordHash = await bcryptjs.hash(parsed.data.password, 12);

  await db
    .update(tenantAdminUsersTable)
    .set({ passwordHash, status: "active", inviteToken: null, inviteExpiresAt: null, updatedAt: new Date() })
    .where(eq(tenantAdminUsersTable.id, user.id));

  const [tenant] = await db
    .select({ id: tenantsTable.id, businessName: tenantsTable.businessName, onboardingStep: tenantsTable.onboardingStep, onboardingComplete: tenantsTable.onboardingComplete, emailVerified: tenantsTable.emailVerified })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, user.tenantId));

  const [subscription] = await db
    .select({ status: subscriptionsTable.status, planId: subscriptionsTable.planId, trialEndsAt: subscriptionsTable.trialEndsAt })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, user.tenantId));

  const token = jwt.sign(
    { tenantId: user.tenantId, email: user.email, type: "tenant", adminUserId: user.id, isPrimary: false },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  res.json({
    token,
    tenant: { id: tenant?.id, businessName: tenant?.businessName, email: user.email, onboardingStep: tenant?.onboardingStep, onboardingComplete: tenant?.onboardingComplete, emailVerified: tenant?.emailVerified },
    subscription,
    adminUser: { id: user.id, name: user.name, email: user.email, isPrimary: false },
  });
});

export default router;
