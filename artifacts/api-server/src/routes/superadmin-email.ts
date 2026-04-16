import { Router, type IRouter } from "express";
import { db, emailTemplatesTable, emailLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { sendMail, getFromDetails } from "../lib/mail";

const router: IRouter = Router();

function getJwtSecret() {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}
function verifySuperAdmin(token: string): boolean {
  try {
    const p = jwt.verify(token, getJwtSecret()) as { type: string };
    return p.type === "superadmin";
  } catch { return false; }
}
function requireSuperAdmin(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: object) => void } }): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !verifySuperAdmin(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/* ─── Map DB row → API shape (Drizzle field 'body'/'enabled' → 'htmlBody'/'isEnabled') ─── */
function toApiShape(row: typeof emailTemplatesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    eventKey: row.eventKey,
    subject: row.subject,
    htmlBody: row.body,
    textBody: row.textBody,
    isEnabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ─── Variable substitution ─── */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/* ─── Event trigger (called by other routes) ─── */
export async function triggerEmailEvent(
  eventKey: string,
  toEmail: string,
  variables: Record<string, string>,
): Promise<void> {
  const [template] = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(eq(emailTemplatesTable.eventKey, eventKey), eq(emailTemplatesTable.enabled, true)))
    .limit(1);

  if (!template) return;

  const subject = renderTemplate(template.subject, variables);
  const html = renderTemplate(template.body, variables);

  const [log] = await db
    .insert(emailLogsTable)
    .values({ templateId: template.id, eventKey, toEmail, subject, status: "pending", variables: JSON.stringify(variables) })
    .returning();

  try {
    const from = await getFromDetails();
    const result = await sendMail({ to: toEmail, subject, html, ...from });
    await db.update(emailLogsTable).set({ status: "sent", messageId: result.messageId }).where(eq(emailLogsTable.id, log.id));
  } catch (err) {
    await db.update(emailLogsTable).set({ status: "failed", errorMessage: String(err) }).where(eq(emailLogsTable.id, log.id));
  }
}

/* ─── Default templates ─── */
const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; htmlBody: string; textBody: string }> = {
  user_signup: {
    name: "Welcome / Email Verification",
    subject: "Welcome to NEXXUS POS, {{user_name}}! Please verify your email",
    textBody: "Hi {{user_name}},\n\nWelcome to NEXXUS POS! Please verify your email:\n{{verification_link}}\n\nPowered by MicroBooks",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Welcome, {{user_name}}!</div>
    <div style="font-size:13px;color:#94a3b8;">Your account for {{business_name}} is ready</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 12px;">We're thrilled to have <strong>{{business_name}}</strong> on board.</p>
    <p style="color:#475569;font-size:14px;margin:0 0 24px;">Please verify your email address to activate your account and get started.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{verification_link}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">Verify Email Address</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">If you didn't sign up for NEXXUS POS, you can safely ignore this email.</p>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div></body></html>`,
  },
  payment_success: {
    name: "Payment Confirmation",
    subject: "Payment received — {{plan_name}} plan activated",
    textBody: "Hi {{user_name}},\n\nYour payment of {{amount}} has been received. Your {{plan_name}} plan is now active.\n\nNext billing date: {{next_billing_date}}\n\nPowered by MicroBooks",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Payment Received ✓</div>
    <div style="font-size:13px;color:#94a3b8;">{{business_name}}</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 20px;">Hi <strong>{{user_name}}</strong>, your payment has been successfully processed.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Payment Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:#475569;">Amount</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#166534;">{{amount}}</td></tr>
        <tr><td style="padding:4px 0;color:#475569;">Plan</td><td style="padding:4px 0;text-align:right;color:#1e293b;">{{plan_name}}</td></tr>
        <tr><td style="padding:4px 0;color:#475569;">Billing</td><td style="padding:4px 0;text-align:right;color:#1e293b;text-transform:capitalize;">{{billing_cycle}}</td></tr>
        <tr><td style="padding:4px 0;color:#475569;">Next Billing</td><td style="padding:4px 0;text-align:right;color:#1e293b;">{{next_billing_date}}</td></tr>
      </table>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:0;">Questions? Reply to this email or contact support.</p>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div></body></html>`,
  },
  payment_failed: {
    name: "Payment Failed",
    subject: "Action required: Payment failed for {{plan_name}}",
    textBody: "Hi {{user_name}},\n\nYour payment of {{amount}} for {{plan_name}} failed.\n\nReason: {{reason}}\n\nPlease update your payment details to avoid service interruption.\n\nPowered by MicroBooks",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#fca5a5;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Payment Failed</div>
    <div style="font-size:13px;color:#fca5a5;">Action required for {{business_name}}</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>{{user_name}}</strong>, we were unable to process your payment.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Payment Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:#475569;">Amount</td><td style="padding:4px 0;text-align:right;color:#1e293b;">{{amount}}</td></tr>
        <tr><td style="padding:4px 0;color:#475569;">Plan</td><td style="padding:4px 0;text-align:right;color:#1e293b;">{{plan_name}}</td></tr>
        <tr><td style="padding:4px 0;color:#475569;">Reason</td><td style="padding:4px 0;text-align:right;color:#dc2626;font-weight:600;">{{reason}}</td></tr>
      </table>
    </div>
    <p style="color:#475569;font-size:14px;margin:0 0 8px;">Please log in to your account and update your payment method to avoid service interruption.</p>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div></body></html>`,
  },
  trial_expiring: {
    name: "Trial Expiring Soon",
    subject: "Your trial ends in {{days_remaining}} days — upgrade to keep access",
    textBody: "Hi {{user_name}},\n\nYour NEXXUS POS trial for {{business_name}} expires on {{trial_end_date}} ({{days_remaining}} days remaining).\n\nUpgrade now: {{upgrade_link}}\n\nPowered by MicroBooks",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#78350f 0%,#92400e 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#fcd34d;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Trial Ending Soon</div>
    <div style="font-size:13px;color:#fcd34d;">{{days_remaining}} days remaining for {{business_name}}</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 12px;">Hi <strong>{{user_name}}</strong>,</p>
    <p style="color:#475569;font-size:14px;margin:0 0 20px;">Your free trial for <strong>{{business_name}}</strong> expires on <strong>{{trial_end_date}}</strong>. Upgrade now to keep uninterrupted access to all your POS features.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{upgrade_link}}" style="background:#f59e0b;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">Upgrade My Plan</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">Need help choosing a plan? Reply to this email and we'll help you find the right fit.</p>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div></body></html>`,
  },
  password_reset: {
    name: "Password Reset",
    subject: "Reset your NEXXUS POS password",
    textBody: "Hi {{user_name}},\n\nReset your password here:\n{{reset_link}}\n\nThis link expires in {{expires_in}}. If you didn't request this, ignore this email.\n\nPowered by MicroBooks",
    htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Password Reset</div>
    <div style="font-size:13px;color:#94a3b8;">{{business_name}}</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 12px;">Hi <strong>{{user_name}}</strong>,</p>
    <p style="color:#475569;font-size:14px;margin:0 0 24px;">We received a request to reset your password. Click the button below to create a new one. This link expires in <strong>{{expires_in}}</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{reset_link}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">Reset Password</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">If you didn't request a password reset, you can safely ignore this email. Your password won't change.</p>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div></body></html>`,
  },
};

/* ─── List templates ─── */
router.get("/superadmin/email/templates", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const rows = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(
      eq(emailTemplatesTable.tenantId, 0),
    ))
    .orderBy(emailTemplatesTable.eventKey, emailTemplatesTable.createdAt);
  const filtered = rows.filter(r => r.eventKey !== "");
  res.json(filtered.map(toApiShape));
});

/* ─── Create template ─── */
const templateSchema = z.object({
  name: z.string().min(1),
  eventKey: z.enum(["user_signup", "payment_success", "payment_failed", "trial_expiring", "password_reset"]),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().default(""),
  isEnabled: z.boolean().default(true),
});

router.post("/superadmin/email/templates", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { htmlBody, isEnabled, ...rest } = parsed.data;
  const [row] = await db.insert(emailTemplatesTable).values({
    ...rest,
    body: htmlBody,
    enabled: isEnabled,
    tenantId: 0,
    templateKey: `sa_${parsed.data.eventKey}_${Date.now()}`,
  }).returning();
  res.json(toApiShape(row));
});

/* ─── Update template ─── */
router.put("/superadmin/email/templates/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params["id"]);
  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { htmlBody, isEnabled, ...rest } = parsed.data;
  const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (htmlBody !== undefined) setData["body"] = htmlBody;
  if (isEnabled !== undefined) setData["enabled"] = isEnabled;
  const [row] = await db.update(emailTemplatesTable)
    .set(setData)
    .where(eq(emailTemplatesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(toApiShape(row));
});

/* ─── Delete template ─── */
router.delete("/superadmin/email/templates/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params["id"]);
  await db.delete(emailLogsTable).where(eq(emailLogsTable.templateId, id));
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  res.json({ success: true });
});

/* ─── Toggle enabled ─── */
router.patch("/superadmin/email/templates/:id/toggle", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params["id"]);
  const [current] = await db.select({ enabled: emailTemplatesTable.enabled }).from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(emailTemplatesTable)
    .set({ enabled: !current.enabled, updatedAt: new Date() })
    .where(eq(emailTemplatesTable.id, id))
    .returning();
  res.json(toApiShape(row));
});

/* ─── Test send (per-template) ─── */
router.post("/superadmin/email/templates/:id/test", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params["id"]);
  const { to, variables } = req.body as { to: string; variables?: Record<string, string> };
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }

  const [template] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const vars = variables ?? {};
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body, vars);

  const [log] = await db.insert(emailLogsTable).values({
    templateId: template.id, eventKey: template.eventKey, toEmail: to,
    subject, status: "pending", variables: JSON.stringify({ ...vars, _test: "true" }),
  }).returning();

  try {
    const from = await getFromDetails();
    const result = await sendMail({ to, subject: `[TEST] ${subject}`, html, ...from });
    await db.update(emailLogsTable).set({ status: "sent", messageId: result.messageId }).where(eq(emailLogsTable.id, log.id));
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    await db.update(emailLogsTable).set({ status: "failed", errorMessage: String(err) }).where(eq(emailLogsTable.id, log.id));
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Seed default templates (insert missing ones) ─── */
router.post("/superadmin/email/seed-defaults", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const { replace = false } = req.body as { replace?: boolean };

  const results: { eventKey: string; action: "inserted" | "replaced" | "skipped" }[] = [];

  for (const [eventKey, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
    const existing = await db
      .select({ id: emailTemplatesTable.id })
      .from(emailTemplatesTable)
      .where(and(eq(emailTemplatesTable.eventKey, eventKey), eq(emailTemplatesTable.tenantId, 0)))
      .limit(1);

    if (existing.length > 0 && !replace) {
      results.push({ eventKey, action: "skipped" });
      continue;
    }

    if (existing.length > 0 && replace) {
      await db.update(emailTemplatesTable)
        .set({
          name: tpl.name,
          subject: tpl.subject,
          body: tpl.htmlBody,
          textBody: tpl.textBody,
          enabled: true,
          updatedAt: new Date(),
        })
        .where(and(eq(emailTemplatesTable.eventKey, eventKey), eq(emailTemplatesTable.tenantId, 0)));
      results.push({ eventKey, action: "replaced" });
    } else {
      await db.insert(emailTemplatesTable).values({
        name: tpl.name,
        eventKey,
        templateKey: eventKey,
        subject: tpl.subject,
        body: tpl.htmlBody,
        textBody: tpl.textBody,
        enabled: true,
        tenantId: 0,
      });
      results.push({ eventKey, action: "inserted" });
    }
  }

  res.json({ success: true, results });
});

/* ─── Standalone connection test (no template required) ─── */
router.post("/superadmin/email/send-test", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const { to } = req.body as { to: string };
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }

  try {
    const from = await getFromDetails();
    const result = await sendMail({
      to,
      subject: "[NEXXUS POS] Email Connection Test",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:24px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:20px;font-weight:800;color:#fff;">Email Connection Test</div>
  </div>
  <div style="padding:24px 32px;">
    <div style="display:flex;align-items:center;gap:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:20px;">✅</div>
      <div>
        <div style="font-weight:700;color:#166534;font-size:14px;">Connection Successful</div>
        <div style="color:#4ade80;font-size:12px;">ZeptoMail is correctly configured and sending emails.</div>
      </div>
    </div>
    <p style="color:#475569;font-size:13px;margin:0 0 4px;">This is a test email sent from the NEXXUS POS superadmin panel to verify your email delivery service is working correctly.</p>
    <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;padding-top:12px;border-top:1px solid #f1f5f9;">Sent on: ${new Date().toLocaleString("en-JM", { timeZone: "America/Jamaica" })} (Jamaica time)</p>
  </div>
  <div style="padding:14px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">Powered by <strong>MicroBooks</strong></p>
  </div>
</div>
</body></html>`,
      ...from,
    });
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Get default template for an event key ─── */
router.get("/superadmin/email/defaults/:eventKey", (req, res): void => {
  if (!requireSuperAdmin(req, res)) return;
  const eventKey = req.params["eventKey"] as string;
  const tpl = DEFAULT_TEMPLATES[eventKey];
  if (!tpl) { res.status(404).json({ error: "No default for this event" }); return; }
  res.json(tpl);
});

/* ─── Email logs ─── */
router.get("/superadmin/email/logs", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const offset = Number(req.query["offset"] ?? 0);
  const rows = await db.select().from(emailLogsTable).orderBy(desc(emailLogsTable.sentAt)).limit(limit).offset(offset);
  res.json(rows);
});

/* ─── Trigger event manually ─── */
router.post("/superadmin/email/trigger", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const { eventKey, toEmail, variables } = req.body as { eventKey: string; toEmail: string; variables: Record<string, string> };
  if (!eventKey || !toEmail) { res.status(400).json({ error: "eventKey and toEmail required" }); return; }
  await triggerEmailEvent(eventKey, toEmail, variables ?? {});
  res.json({ success: true });
});

export default router;
