import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { emailTemplatesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { getSetting } from "./settings";
import { SendMailClient } from "zeptomail";
import nodemailer from "nodemailer";
import { getAllSettings } from "./settings";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Variable replacement ─── */
export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

/* ─── Default templates ─── */
const DEFAULT_TEMPLATES: Omit<typeof emailTemplatesTable.$inferInsert, "tenantId">[] = [
  {
    templateKey: "welcome",
    name: "Welcome Email",
    description: "Sent automatically when a new customer is added.",
    subject: "Welcome to {{business_name}}, {{customer_name}}!",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#0f1729;margin:0 0 12px;">Welcome, {{customer_name}}! 👋</h2>
    <p style="color:#475569;line-height:1.7;">We're thrilled to have you as a customer. Your account is now set up and ready to go.</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Your Account Details</div>
      <div style="color:#1e293b;"><strong>Name:</strong> {{customer_name}}</div>
      {{#if customer_email}}<div style="color:#1e293b;margin-top:4px;"><strong>Email:</strong> {{customer_email}}</div>{{/if}}
      {{#if customer_phone}}<div style="color:#1e293b;margin-top:4px;"><strong>Phone:</strong> {{customer_phone}}</div>{{/if}}
    </div>
    <p style="color:#475569;line-height:1.7;">Every purchase earns you loyalty points you can redeem on future visits. We look forward to serving you!</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: true,
  },
  {
    templateKey: "loyalty_earned",
    name: "Loyalty Points Earned",
    description: "Sent when a customer earns loyalty points on a purchase.",
    subject: "You earned {{points_earned}} points at {{business_name}}!",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;">🎉</div>
      <h2 style="color:#0f1729;margin:8px 0 4px;">Points Earned!</h2>
      <p style="color:#64748b;margin:0;">Hi {{customer_name}}, your loyalty points have been updated.</p>
    </div>
    <div style="display:flex;gap:12px;margin:20px 0;">
      <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#3b82f6;">+{{points_earned}}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Points Earned</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#16a34a;">{{points_balance}}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Total Balance</div>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:16px 0;border:1px solid #e2e8f0;">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Order Total</div>
      <div style="font-size:18px;font-weight:700;color:#0f1729;">JMD {{order_total}}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px;">{{order_date}}</div>
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.7;text-align:center;">Keep shopping to earn more points and unlock exclusive rewards!</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: true,
  },
  {
    templateKey: "low_stock",
    name: "Low Stock Alert",
    description: "Sent when a product's stock falls below the configured threshold.",
    subject: "⚠️ Low Stock Alert — {{product_name}}",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;">
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:24px;">⚠️</span>
        <div>
          <div style="font-weight:700;color:#9a3412;font-size:14px;">Stock Alert</div>
          <div style="color:#c2410c;font-size:13px;">Immediate attention required</div>
        </div>
      </div>
    </div>
    <h2 style="color:#0f1729;margin:0 0 8px;">{{product_name}}</h2>
    <p style="color:#64748b;margin:0 0 20px;">This product is running low and may need to be restocked soon.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:12px 16px;color:#64748b;font-size:13px;">Current Stock</td>
          <td style="padding:12px 16px;text-align:right;font-weight:700;color:#dc2626;font-size:15px;">{{current_stock}} units</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:12px 16px;color:#64748b;font-size:13px;">Alert Threshold</td>
          <td style="padding:12px 16px;text-align:right;font-weight:600;color:#0f1729;font-size:13px;">{{threshold}} units</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:13px;">Category</td>
          <td style="padding:12px 16px;text-align:right;color:#0f1729;font-size:13px;">{{category}}</td>
        </tr>
      </table>
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.7;margin-top:20px;">Log in to NEXXUS POS to restock this item or adjust your stock threshold.</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: true,
  },
  {
    templateKey: "ar_reminder",
    name: "AR Balance Reminder",
    description: "Sent to customers with an outstanding Accounts Receivable balance.",
    subject: "Friendly Reminder — Outstanding Balance at {{business_name}}",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#0f1729;margin:0 0 8px;">Hi {{customer_name}},</h2>
    <p style="color:#475569;line-height:1.7;">This is a friendly reminder that you have an outstanding balance on your account.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
      <div style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Outstanding Balance</div>
      <div style="font-size:36px;font-weight:700;color:#dc2626;">JMD {{balance}}</div>
    </div>
    <p style="color:#475569;line-height:1.7;">Please visit us or contact us to settle your balance at your earliest convenience. We appreciate your continued business!</p>
    <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;border:1px solid #e2e8f0;margin:16px 0;">
      <div style="font-size:12px;color:#64748b;margin-bottom:2px;">Contact Us</div>
      <div style="color:#0f1729;font-weight:600;">{{business_name}}</div>
      {{#if business_phone}}<div style="color:#475569;font-size:13px;">{{business_phone}}</div>{{/if}}
      {{#if business_address}}<div style="color:#475569;font-size:13px;">{{business_address}}</div>{{/if}}
    </div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: true,
  },
  {
    templateKey: "order_receipt",
    name: "Order Receipt",
    description: "Sent to customers when their order is completed (if they have an email on file).",
    subject: "Your Receipt — Order #{{order_number}} from {{business_name}}",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#0f1729;margin:0 0 4px;">Thank you, {{customer_name}}!</h2>
    <p style="color:#64748b;margin:0 0 24px;">Here's your receipt for order <strong>#{{order_number}}</strong> on {{order_date}}.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Subtotal</td><td style="text-align:right;color:#0f1729;font-size:13px;">JMD {{subtotal}}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Tax</td><td style="text-align:right;color:#0f1729;font-size:13px;">JMD {{tax}}</td></tr>
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:10px 0 4px;font-weight:700;color:#0f1729;">Total</td>
          <td style="text-align:right;padding:10px 0 4px;font-weight:700;color:#3b82f6;font-size:18px;">JMD {{total}}</td>
        </tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:12px;">Payment</td><td style="text-align:right;color:#0f1729;font-size:12px;">{{payment_method}}</td></tr>
      </table>
    </div>
    {{#if loyalty_points}}<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;text-align:center;margin-bottom:16px;">
      <span style="color:#3b82f6;font-weight:600;">+{{loyalty_points}} loyalty points earned on this purchase!</span>
    </div>{{/if}}
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: false,
  },
  {
    templateKey: "birthday",
    name: "Birthday Greeting",
    description: "Sent to customers on their birthday (requires birthday date on customer profile).",
    subject: "🎂 Happy Birthday from {{business_name}}!",
    body: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f1729;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#3b82f6;letter-spacing:1px;">{{business_name}}</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Powered by MicroBooks</div>
  </div>
  <div style="padding:32px;text-align:center;">
    <div style="font-size:64px;margin-bottom:12px;">🎂</div>
    <h2 style="color:#0f1729;margin:0 0 8px;">Happy Birthday, {{customer_name}}!</h2>
    <p style="color:#475569;line-height:1.7;max-width:400px;margin:0 auto 24px;">On your special day, we want to say thank you for being such a valued customer. Wishing you a wonderful birthday!</p>
    <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1px solid #bfdbfe;border-radius:12px;padding:24px;margin:0 auto 24px;max-width:300px;">
      <div style="font-size:12px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Birthday Bonus</div>
      <div style="font-size:32px;font-weight:700;color:#0f1729;">{{bonus_points}} Points</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Added to your loyalty account</div>
    </div>
    <p style="color:#475569;font-size:13px;">Visit us anytime this month to use your birthday points!</p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;">
      {{business_name}} &nbsp;·&nbsp; Powered by MicroBooks
    </div>
  </div>
</div>
</body></html>`,
    enabled: false,
  },
];

/* ─── Ensure defaults exist for a tenant ─── */
export async function ensureDefaultTemplates(tenantId: number) {
  const existing = await db
    .select({ templateKey: emailTemplatesTable.templateKey })
    .from(emailTemplatesTable)
    .where(eq(emailTemplatesTable.tenantId, tenantId));

  const existingKeys = new Set(existing.map((r) => r.templateKey));
  const missing = DEFAULT_TEMPLATES.filter((t) => !existingKeys.has(t.templateKey!));

  if (missing.length > 0) {
    await db.insert(emailTemplatesTable).values(
      missing.map((t) => ({ ...t, tenantId }))
    );
  }
}

/* ─── Send a template email ─── */
export async function sendTemplateEmail(opts: {
  tenantId: number;
  templateKey: string;
  to: string;
  vars: Record<string, string | number>;
}) {
  const { tenantId, templateKey, to, vars } = opts;

  await ensureDefaultTemplates(tenantId);

  const [template] = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(eq(emailTemplatesTable.tenantId, tenantId), eq(emailTemplatesTable.templateKey, templateKey)));

  if (!template || !template.enabled) return;

  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body, vars);

  const settings = await getAllSettings(tenantId);
  const fromAddress = settings["from_email"] || "noreply@microbookspos.com";
  const fromName = settings["from_name"] || settings["business_name"] || "NEXXUS POS";
  const provider = settings["email_provider"];

  if (provider === "smtp") {
    const host = settings["smtp_host"] ?? "";
    if (!host) return;
    const transport = nodemailer.createTransport({
      host,
      port: parseInt(settings["smtp_port"] ?? "587", 10),
      secure: settings["smtp_secure"] === "true",
      auth: settings["smtp_user"] ? { user: settings["smtp_user"], pass: settings["smtp_pass"] ?? "" } : undefined,
    });
    const from = settings["smtp_from"]
      ? `${settings["smtp_from_name"] || fromName} <${settings["smtp_from"]}>`
      : `${fromName} <${fromAddress}>`;
    await transport.sendMail({ from, to, subject, html });
    return;
  }

  const token = process.env["ZEPTOMAIL_TOKEN"];
  if (!token) return;
  const zepto = new SendMailClient({ url: "api.zeptomail.com/", token });
  await zepto.sendMail({
    from: { address: fromAddress, name: fromName },
    to: [{ email_address: { address: to } }],
    subject,
    htmlbody: html,
  });
}

/* ─── Routes ─── */

/* GET /api/email-templates */
router.get("/", async (req, res) => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  await ensureDefaultTemplates(tenantId);

  const templates = await db
    .select()
    .from(emailTemplatesTable)
    .where(eq(emailTemplatesTable.tenantId, tenantId))
    .orderBy(emailTemplatesTable.id);

  res.json(templates);
});

/* PUT /api/email-templates/:key */
router.put("/:key", async (req, res) => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    subject: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await ensureDefaultTemplates(tenantId);

  const [updated] = await db
    .update(emailTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(emailTemplatesTable.tenantId, tenantId), eq(emailTemplatesTable.templateKey, req.params["key"]!)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Template not found" });
  res.json(updated);
});

/* POST /api/email-templates/:key/reset */
router.post("/:key/reset", async (req, res) => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const key = req.params["key"]!;
  const def = DEFAULT_TEMPLATES.find((t) => t.templateKey === key);
  if (!def) return res.status(404).json({ error: "Template key not found" });

  const [updated] = await db
    .update(emailTemplatesTable)
    .set({ subject: def.subject, body: def.body, updatedAt: new Date() })
    .where(and(eq(emailTemplatesTable.tenantId, tenantId), eq(emailTemplatesTable.templateKey, key)))
    .returning();

  res.json(updated);
});

/* POST /api/email-templates/:key/send-test */
router.post("/:key/send-test", async (req, res) => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const { to } = z.object({ to: z.string().email() }).parse(req.body);

  const settings = await getAllSettings(tenantId);
  const businessName = settings["business_name"] || "NEXXUS POS";

  const SAMPLE_VARS: Record<string, Record<string, string | number>> = {
    welcome: { business_name: businessName, customer_name: "Jane Smith", customer_email: to, customer_phone: "876-555-0123" },
    loyalty_earned: { business_name: businessName, customer_name: "Jane Smith", points_earned: 150, points_balance: 1250, order_total: "3,500.00", order_date: new Date().toLocaleDateString("en-JM") },
    low_stock: { business_name: businessName, product_name: "Sample Product", current_stock: 3, threshold: 5, category: "General" },
    ar_reminder: { business_name: businessName, customer_name: "Jane Smith", balance: "12,500.00", business_phone: "876-555-0100", business_address: "123 Main St, Kingston" },
    order_receipt: { business_name: businessName, customer_name: "Jane Smith", order_number: "ORD-001", order_date: new Date().toLocaleDateString("en-JM"), subtotal: "3,097.35", tax: "465.00", total: "3,562.35", payment_method: "CASH", loyalty_points: 150 },
    birthday: { business_name: businessName, customer_name: "Jane Smith", bonus_points: 500 },
  };

  const vars = SAMPLE_VARS[req.params["key"]!] ?? { business_name: businessName };

  try {
    await sendTemplateEmail({ tenantId, templateKey: req.params["key"]!, to, vars });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
