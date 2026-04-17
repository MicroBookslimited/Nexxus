import { Router, type IRouter, type Request } from "express";
import { db, marketingCampaignsTable, marketingRecipientsTable, tenantsTable, tenantAdminUsersTable, marketingUnsubscribesTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendMarketingMail, isMarketingMailerConfigured } from "../lib/marketing-mail";
import { sendPendingForCampaign } from "../lib/campaign-sender";

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
    res.status(401).json({ error: "Unauthorized" }); return false;
  }
  return true;
}

type Audience = "all" | "owners" | "admins" | "active" | "trial" | "verified";

async function getUnsubscribedEmails(): Promise<Set<string>> {
  const rows = await db.select({ email: marketingUnsubscribesTable.email }).from(marketingUnsubscribesTable);
  return new Set(rows.map(r => r.email.toLowerCase()));
}

async function resolveAudience(audience: Audience): Promise<{ email: string; name: string | null }[]> {
  const includeOwners = audience === "all" || audience === "owners" || audience === "active" || audience === "trial" || audience === "verified";
  const includeAdmins = audience === "all" || audience === "admins";

  const recipients = new Map<string, { email: string; name: string | null }>();

  const unsubscribed = await getUnsubscribedEmails();

  if (includeOwners) {
    const owners = await db.select({
      email: tenantsTable.email,
      name: tenantsTable.ownerName,
      status: tenantsTable.status,
      emailVerified: tenantsTable.emailVerified,
    }).from(tenantsTable);

    for (const o of owners) {
      if (!o.email) continue;
      if (audience === "active" && o.status !== "active") continue;
      if (audience === "trial" && o.status !== "trial" && o.status !== "pending") continue;
      if (audience === "verified" && !o.emailVerified) continue;
      const key = o.email.toLowerCase();
      if (unsubscribed.has(key)) continue;
      if (!recipients.has(key)) recipients.set(key, { email: o.email, name: o.name ?? null });
    }
  }

  if (includeAdmins) {
    const admins = await db.select({
      email: tenantAdminUsersTable.email,
      name: tenantAdminUsersTable.name,
      status: tenantAdminUsersTable.status,
    }).from(tenantAdminUsersTable);

    for (const a of admins) {
      if (!a.email) continue;
      if (a.status !== "active") continue;
      const key = a.email.toLowerCase();
      if (unsubscribed.has(key)) continue;
      if (!recipients.has(key)) recipients.set(key, { email: a.email, name: a.name ?? null });
    }
  }

  return Array.from(recipients.values());
}

/* ─── Status: provider configured? ─── */
router.get("/superadmin/marketing/status", (req, res): void => {
  if (!requireSuperAdmin(req, res)) return;
  res.json({
    provider: "resend",
    configured: isMarketingMailerConfigured(),
  });
});

/* ─── Audience preview: count + sample ─── */
router.get("/superadmin/marketing/audience", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const audience = (String(req.query["audience"] ?? "all")) as Audience;
  try {
    const recipients = await resolveAudience(audience);
    res.json({
      total: recipients.length,
      sample: recipients.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve audience", details: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── List campaigns ─── */
router.get("/superadmin/marketing/campaigns", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const rows = await db.select().from(marketingCampaignsTable).orderBy(desc(marketingCampaignsTable.createdAt)).limit(100);
  res.json(rows);
});

/* ─── Get one campaign with recipient summary + opt-out count ─── */
router.get("/superadmin/marketing/campaigns/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  const recipients = await db.select().from(marketingRecipientsTable).where(eq(marketingRecipientsTable.campaignId, id)).orderBy(desc(marketingRecipientsTable.id)).limit(500);

  // Count how many recipients of this campaign have since unsubscribed.
  let unsubscribeCount = 0;
  if (recipients.length > 0) {
    const recipientEmails = [...new Set(recipients.map(r => r.email.toLowerCase()))];
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketingUnsubscribesTable)
      .where(inArray(marketingUnsubscribesTable.email, recipientEmails));
    unsubscribeCount = Number(countRow?.count ?? 0);
  }

  res.json({ campaign, recipients, unsubscribeCount });
});

/* ─── Send a single test email ─── */
router.post("/superadmin/marketing/test", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const { to, subject, htmlBody, fromName, fromAddress } = req.body as {
    to: string; subject: string; htmlBody: string; fromName: string; fromAddress: string;
  };
  if (!to || !subject || !htmlBody || !fromAddress) {
    res.status(400).json({ error: "Missing required fields (to, subject, htmlBody, fromAddress)" }); return;
  }
  try {
    const result = await sendMarketingMail({
      to, subject, html: htmlBody,
      fromName: fromName || "NEXXUS POS",
      fromAddress,
    });
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── Create + send a campaign ─── */
router.post("/superadmin/marketing/send", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const { subject, htmlBody, fromName, fromAddress, audience } = req.body as {
    subject: string; htmlBody: string; fromName: string; fromAddress: string; audience: Audience;
  };

  if (!subject || !htmlBody || !fromAddress) {
    res.status(400).json({ error: "Missing required fields (subject, htmlBody, fromAddress)" }); return;
  }
  if (!isMarketingMailerConfigured()) {
    res.status(503).json({ error: "Marketing email provider (Resend) is not configured. Set RESEND_API_KEY." }); return;
  }

  const aud: Audience = (audience ?? "all") as Audience;

  let recipients: { email: string; name: string | null }[];
  try {
    recipients = await resolveAudience(aud);
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve audience", details: err instanceof Error ? err.message : String(err) });
    return;
  }

  if (recipients.length === 0) {
    res.status(400).json({ error: "No recipients in selected audience" }); return;
  }

  const [campaign] = await db.insert(marketingCampaignsTable).values({
    subject, htmlBody,
    fromName: fromName || "NEXXUS POS",
    fromAddress,
    audience: aud,
    status: "sending",
    totalRecipients: recipients.length,
  }).returning();

  // Insert recipient rows in chunks of 500
  const recipientRows = recipients.map(r => ({ campaignId: campaign.id, email: r.email, name: r.name, status: "pending" as const }));
  for (let i = 0; i < recipientRows.length; i += 500) {
    await db.insert(marketingRecipientsTable).values(recipientRows.slice(i, i + 500));
  }

  // Respond immediately — sending happens in background.
  res.json({ success: true, campaign, queued: recipients.length });

  // Fire-and-forget: delegate to the shared sender so recovery on restart works.
  void sendPendingForCampaign(campaign.id).catch(err => {
    void db.update(marketingCampaignsTable).set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).where(eq(marketingCampaignsTable.id, campaign.id));
  });
});

/* ─── Delete a campaign (cascade deletes recipients) ─── */
router.delete("/superadmin/marketing/campaigns/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  await db.delete(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id));
  res.json({ success: true });
});

/* ─── Live progress for a sending campaign ─── */
router.get("/superadmin/marketing/campaigns/:id/progress", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  const [counts] = await db.select({
    sent: sql<number>`count(*) filter (where status = 'sent')`,
    failed: sql<number>`count(*) filter (where status = 'failed')`,
    pending: sql<number>`count(*) filter (where status = 'pending')`,
    opened: sql<number>`count(*) filter (where open_count > 0)`,
    clicked: sql<number>`count(*) filter (where click_count > 0)`,
  }).from(marketingRecipientsTable).where(eq(marketingRecipientsTable.campaignId, id));
  res.json({
    status: campaign.status,
    total: campaign.totalRecipients,
    sent: Number(counts?.sent ?? 0),
    failed: Number(counts?.failed ?? 0),
    pending: Number(counts?.pending ?? 0),
    opened: Number(counts?.opened ?? 0),
    clicked: Number(counts?.clicked ?? 0),
  });
});

/* ─── Resend webhook — receives email.opened / email.clicked events ─── */
router.post("/marketing/webhook", async (req, res): Promise<void> => {
  // Optional Svix-style signature verification if RESEND_WEBHOOK_SECRET is set.
  const secret = process.env["RESEND_WEBHOOK_SECRET"];
  if (secret) {
    const svixId = req.headers["svix-id"] as string | undefined;
    const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
    const svixSignature = req.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(401).json({ error: "Missing Svix signature headers" });
      return;
    }

    // Validate timestamp to prevent replay attacks (5 minute window).
    const tsSeconds = parseInt(svixTimestamp, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > 300) {
      res.status(401).json({ error: "Timestamp too old" });
      return;
    }

    // Use raw body bytes captured before JSON parsing to match Svix canonical bytes.
    const rawBodyStr = ((req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0)).toString("utf-8");
    const toSign = `${svixId}.${svixTimestamp}.${rawBodyStr}`;
    const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    const expectedHmac = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

    const signatures = svixSignature.split(" ");
    const valid = signatures.some(sig => {
      const parts = sig.split(",");
      return parts.length === 2 && parts[1] === expectedHmac;
    });

    if (!valid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  type ResendWebhookEvent = {
    type: string;
    data: { email_id?: string; [key: string]: unknown };
  };

  const event = req.body as ResendWebhookEvent;
  const emailId = event?.data?.email_id;

  if (!emailId || (event.type !== "email.opened" && event.type !== "email.clicked")) {
    res.json({ received: true, ignored: true });
    return;
  }

  try {
    const now = new Date();

    if (event.type === "email.opened") {
      // Atomic recipient counter increment; set opened_at only on first open.
      const updated = await db.update(marketingRecipientsTable).set({
        openedAt: sql`COALESCE(${marketingRecipientsTable.openedAt}, ${now.toISOString()})`,
        openCount: sql`${marketingRecipientsTable.openCount} + 1`,
      }).where(eq(marketingRecipientsTable.messageId, emailId)).returning({
        id: marketingRecipientsTable.id,
        campaignId: marketingRecipientsTable.campaignId,
        wasFirstOpen: sql<boolean>`(${marketingRecipientsTable.openCount} - 1) = 0`,
      });

      if (updated.length > 0 && updated[0].wasFirstOpen) {
        await db.update(marketingCampaignsTable).set({
          openCount: sql`${marketingCampaignsTable.openCount} + 1`,
        }).where(eq(marketingCampaignsTable.id, updated[0].campaignId));
      }
    } else if (event.type === "email.clicked") {
      // Atomic recipient counter increment; set clicked_at only on first click.
      const updated = await db.update(marketingRecipientsTable).set({
        clickedAt: sql`COALESCE(${marketingRecipientsTable.clickedAt}, ${now.toISOString()})`,
        clickCount: sql`${marketingRecipientsTable.clickCount} + 1`,
      }).where(eq(marketingRecipientsTable.messageId, emailId)).returning({
        id: marketingRecipientsTable.id,
        campaignId: marketingRecipientsTable.campaignId,
        wasFirstClick: sql<boolean>`(${marketingRecipientsTable.clickCount} - 1) = 0`,
      });

      if (updated.length > 0 && updated[0].wasFirstClick) {
        await db.update(marketingCampaignsTable).set({
          clickCount: sql`${marketingCampaignsTable.clickCount} + 1`,
        }).where(eq(marketingCampaignsTable.id, updated[0].campaignId));
      }
    }

    res.json({ received: true, processed: true });
  } catch (err) {
    console.error("[marketing webhook]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/* ─── Global unsubscribes list ─── */
router.get("/superadmin/marketing/unsubscribes", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const rows = await db
    .select({
      id: marketingUnsubscribesTable.id,
      email: marketingUnsubscribesTable.email,
      unsubscribedAt: marketingUnsubscribesTable.unsubscribedAt,
    })
    .from(marketingUnsubscribesTable)
    .orderBy(desc(marketingUnsubscribesTable.unsubscribedAt))
    .limit(500);
  res.json({ total: rows.length, unsubscribes: rows });
});

export default router;
