import { Router, type IRouter, type Request } from "express";
import { db, marketingCampaignsTable, marketingRecipientsTable, tenantsTable, tenantAdminUsersTable, marketingUnsubscribesTable, marketingLinkClicksTable } from "@workspace/db";
import { eq, asc, desc, sql, inArray, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendMarketingMail, isMarketingMailerConfigured } from "../lib/marketing-mail";
import { sendPendingForCampaign, flushCounts } from "../lib/campaign-sender";

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
  const rawBase =
    process.env["APP_BASE_URL"] ??
    (process.env["REPLIT_DOMAINS"]
      ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]!.trim()}`
      : process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : "");
  const appBase = rawBase.replace(/\/+$/, "");
  res.json({
    provider: "resend",
    configured: isMarketingMailerConfigured(),
    webhookUrl: appBase ? `${appBase}/api/marketing/webhook` : "/api/marketing/webhook",
    webhookSecretConfigured: !!process.env["RESEND_WEBHOOK_SECRET"],
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

  // Compute unsubscribe counts for the returned campaigns in one query so the
  // frontend doesn't need to fan out per-campaign detail requests just to fill
  // the Opt-outs column. Restrict to the returned IDs to avoid a full-table
  // grouping across all historical campaigns.
  const campaignIds = rows.map(r => r.id);
  const unsubCounts = campaignIds.length > 0
    ? await db
        .select({
          campaignId: marketingRecipientsTable.campaignId,
          count: sql<number>`count(distinct lower(${marketingRecipientsTable.email}))::int`,
        })
        .from(marketingUnsubscribesTable)
        .innerJoin(
          marketingRecipientsTable,
          sql`lower(${marketingRecipientsTable.email}) = lower(${marketingUnsubscribesTable.email})`,
        )
        .where(inArray(marketingRecipientsTable.campaignId, campaignIds))
        .groupBy(marketingRecipientsTable.campaignId)
    : [];

  const countMap = new Map(unsubCounts.map(r => [r.campaignId, r.count]));
  const result = rows.map(r => ({ ...r, unsubscribeCount: countMap.get(r.id) ?? 0 }));
  res.json(result);
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

  // Per-link click breakdown for this campaign, sorted by most clicked.
  const linkClicks = await db
    .select({
      url: marketingLinkClicksTable.url,
      clickCount: sql<number>`count(*)`,
    })
    .from(marketingLinkClicksTable)
    .where(eq(marketingLinkClicksTable.campaignId, id))
    .groupBy(marketingLinkClicksTable.url)
    .orderBy(sql`count(*) desc`);

  const linkBreakdown = linkClicks.map(l => ({ url: l.url, clickCount: Number(l.clickCount) }));

  res.json({ campaign, recipients, unsubscribeCount, linkBreakdown });
});

/* ─── Per-recipient link click history ─── */
router.get("/superadmin/marketing/campaigns/:id/recipients/:recipientId/clicks", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  const recipientId = parseInt(req.params.recipientId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(recipientId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }

  const [recipient] = await db
    .select({ id: marketingRecipientsTable.id, campaignId: marketingRecipientsTable.campaignId })
    .from(marketingRecipientsTable)
    .where(eq(marketingRecipientsTable.id, recipientId))
    .limit(1);
  if (!recipient || recipient.campaignId !== id) {
    res.status(404).json({ error: "Recipient not found in this campaign" }); return;
  }

  const clicks = await db
    .select({
      id: marketingLinkClicksTable.id,
      url: marketingLinkClicksTable.url,
      clickedAt: marketingLinkClicksTable.clickedAt,
    })
    .from(marketingLinkClicksTable)
    .where(eq(marketingLinkClicksTable.recipientId, recipientId))
    .orderBy(asc(marketingLinkClicksTable.clickedAt));

  res.json({ clicks });
});

/* ─── Per-link click trend (time-bucketed) for a campaign ─── */
router.get("/superadmin/marketing/campaigns/:id/click-trend", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }

  // Decide hour vs day buckets based on the click time-span. If the spread
  // between earliest and latest click is more than 3 days, day buckets keep
  // the chart readable; otherwise hourly resolution shows the early-decay
  // pattern superadmins care about.
  const [span] = await db
    .select({
      minAt: sql<Date | null>`min(${marketingLinkClicksTable.clickedAt})`,
      maxAt: sql<Date | null>`max(${marketingLinkClicksTable.clickedAt})`,
    })
    .from(marketingLinkClicksTable)
    .where(eq(marketingLinkClicksTable.campaignId, id));

  if (!span?.minAt || !span?.maxAt) {
    res.json({ bucketSize: "hour" as const, urls: [], points: [] });
    return;
  }

  const minMs = new Date(span.minAt).getTime();
  const maxMs = new Date(span.maxAt).getTime();
  const spanDays = (maxMs - minMs) / (1000 * 60 * 60 * 24);
  const bucketSize: "hour" | "day" = spanDays > 3 ? "day" : "hour";
  const truncUnit = bucketSize === "day" ? "day" : "hour";

  const rows = await db
    .select({
      bucket: sql<Date>`date_trunc(${truncUnit}, ${marketingLinkClicksTable.clickedAt})`,
      url: marketingLinkClicksTable.url,
      count: sql<number>`count(*)`,
    })
    .from(marketingLinkClicksTable)
    .where(eq(marketingLinkClicksTable.campaignId, id))
    .groupBy(sql`date_trunc(${truncUnit}, ${marketingLinkClicksTable.clickedAt})`, marketingLinkClicksTable.url)
    .orderBy(sql`date_trunc(${truncUnit}, ${marketingLinkClicksTable.clickedAt})`);

  // Collect distinct urls (sorted by total clicks desc so the legend is stable)
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.url, (totals.get(r.url) ?? 0) + Number(r.count));
  const urls = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([u]) => u);

  // Build a dense series so the chart x-axis has every bucket from min to max,
  // even if a particular url had zero clicks in that bucket.
  const stepMs = bucketSize === "day" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const truncate = (ms: number): number => {
    const d = new Date(ms);
    if (bucketSize === "day") {
      d.setUTCHours(0, 0, 0, 0);
    } else {
      d.setUTCMinutes(0, 0, 0);
    }
    return d.getTime();
  };
  const startMs = truncate(minMs);
  const endMs = truncate(maxMs);

  const lookup = new Map<string, number>();
  for (const r of rows) {
    const key = `${new Date(r.bucket).getTime()}|${r.url}`;
    lookup.set(key, Number(r.count));
  }

  const points: { time: string; [url: string]: number | string }[] = [];
  // Cap the dense expansion so a single rogue old click can't blow up the
  // response. 500 buckets = ~20 days hourly or ~16 months daily, which is
  // plenty for the modal chart.
  const MAX_BUCKETS = 500;
  let buckets = Math.floor((endMs - startMs) / stepMs) + 1;
  if (buckets > MAX_BUCKETS) buckets = MAX_BUCKETS;
  for (let i = 0; i < buckets; i++) {
    const t = startMs + i * stepMs;
    const point: { time: string; [url: string]: number | string } = { time: new Date(t).toISOString() };
    for (const u of urls) point[u] = lookup.get(`${t}|${u}`) ?? 0;
    points.push(point);
  }

  res.json({ bucketSize, urls, points });
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

  const { subject, htmlBody, fromName, fromAddress, audience, campaignId } = req.body as {
    subject: string; htmlBody: string; fromName: string; fromAddress: string; audience: Audience; campaignId?: number;
  };

  if (!isMarketingMailerConfigured()) {
    res.status(503).json({ error: "Marketing email provider (Resend) is not configured. Set RESEND_API_KEY." }); return;
  }

  // Idempotency guard for manual re-triggers: if the caller supplied a
  // campaignId, refuse to re-send any campaign that already reached a
  // terminal status. This prevents recipients from getting duplicate emails
  // if a superadmin accidentally re-fires a completed campaign.
  if (typeof campaignId === "number" && Number.isFinite(campaignId)) {
    const [existing] = await db
      .select()
      .from(marketingCampaignsTable)
      .where(eq(marketingCampaignsTable.id, campaignId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: `Campaign ${campaignId} not found` });
      return;
    }
    const TERMINAL_STATUSES = new Set(["sent", "partial", "failed", "cancelled"]);
    if (TERMINAL_STATUSES.has(existing.status)) {
      res.status(409).json({
        error: `Campaign ${campaignId} has already finished sending (status: ${existing.status}). Re-sending is not allowed — create a new campaign instead to avoid duplicate emails to recipients.`,
        status: existing.status,
      });
      return;
    }
    // Only campaigns in 'sending' status can be resumed. Anything else
    // (e.g. 'draft' or an unknown state) is refused so the operator gets
    // an explicit answer instead of a silent no-op from the sender.
    if (existing.status !== "sending") {
      res.status(409).json({
        error: `Campaign ${campaignId} is in status '${existing.status}' and cannot be resumed. Only campaigns currently in 'sending' status can be re-triggered.`,
        status: existing.status,
      });
      return;
    }
    // Resume an in-flight campaign by replaying its pending recipients.
    res.json({ success: true, campaign: existing, resumed: true });
    void sendPendingForCampaign(existing.id).catch(err => {
      void db.update(marketingCampaignsTable).set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      }).where(eq(marketingCampaignsTable.id, existing.id));
    });
    return;
  }

  if (!subject || !htmlBody || !fromAddress) {
    res.status(400).json({ error: "Missing required fields (subject, htmlBody, fromAddress)" }); return;
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

/* ─── Export per-recipient engagement as CSV ─── */
router.get("/superadmin/marketing/campaigns/:id/export", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }

  const recipients = await db
    .select({
      email: marketingRecipientsTable.email,
      name: marketingRecipientsTable.name,
      status: marketingRecipientsTable.status,
      openCount: marketingRecipientsTable.openCount,
      clickCount: marketingRecipientsTable.clickCount,
      openedAt: marketingRecipientsTable.openedAt,
      clickedAt: marketingRecipientsTable.clickedAt,
    })
    .from(marketingRecipientsTable)
    .where(eq(marketingRecipientsTable.campaignId, id))
    .orderBy(desc(marketingRecipientsTable.id));

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ["email", "name", "delivery_status", "open_count", "click_count", "first_opened_at", "first_clicked_at"];
  const lines = [header.join(",")];
  for (const r of recipients) {
    lines.push([
      escape(r.email),
      escape(r.name ?? ""),
      escape(r.status),
      escape(r.openCount ?? 0),
      escape(r.clickCount ?? 0),
      escape(r.openedAt ? new Date(r.openedAt).toISOString() : ""),
      escape(r.clickedAt ? new Date(r.clickedAt).toISOString() : ""),
    ].join(","));
  }
  const csv = lines.join("\r\n") + "\r\n";

  const filename = `campaign-${id}-engagement.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

/* ─── Pause a campaign mid-send ─── */
router.post("/superadmin/marketing/campaigns/:id/pause", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [existing] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "sending") {
    res.status(409).json({
      error: `Cannot pause campaign in status '${existing.status}'. Only campaigns currently sending can be paused.`,
      status: existing.status,
    });
    return;
  }

  // Flip the status. The running sender loop will notice on its next
  // iteration and exit cleanly, leaving pending recipients untouched.
  await db.update(marketingCampaignsTable).set({ status: "paused" }).where(eq(marketingCampaignsTable.id, id));
  res.json({ success: true, status: "paused" });
});

/* ─── Resume a paused campaign ─── */
router.post("/superadmin/marketing/campaigns/:id/resume", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [existing] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "paused") {
    res.status(409).json({
      error: `Cannot resume campaign in status '${existing.status}'. Only paused campaigns can be resumed.`,
      status: existing.status,
    });
    return;
  }

  await db.update(marketingCampaignsTable).set({
    status: "sending",
    resumedAt: new Date(),
    resumeCount: sql`${marketingCampaignsTable.resumeCount} + 1`,
  }).where(eq(marketingCampaignsTable.id, id));

  res.json({ success: true, status: "sending" });

  void sendPendingForCampaign(id).catch(err => {
    void db.update(marketingCampaignsTable).set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).where(eq(marketingCampaignsTable.id, id));
  });
});

/* ─── Cancel a campaign mid-send ─── */
router.post("/superadmin/marketing/campaigns/:id/cancel", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [existing] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "sending" && existing.status !== "paused") {
    res.status(409).json({
      error: `Cannot cancel campaign in status '${existing.status}'. Only sending or paused campaigns can be cancelled.`,
      status: existing.status,
    });
    return;
  }

  // Mark every still-pending recipient as 'skipped' so the recipient table
  // makes it clear they were intentionally not contacted (rather than failed).
  const skipped = await db
    .update(marketingRecipientsTable)
    .set({ status: "skipped" })
    .where(and(
      eq(marketingRecipientsTable.campaignId, id),
      eq(marketingRecipientsTable.status, "pending"),
    ))
    .returning({ id: marketingRecipientsTable.id });

  // Recompute sent/failed counts from the recipient table so the dashboard
  // reflects the true state at cancellation time (the sender flushes counts
  // every 25 sends, so they could otherwise be slightly stale).
  await flushCounts(id);

  // Finalize the campaign. We keep sentAt so any partial sends still record a
  // timestamp; if nothing was sent yet, stamp it now to mark the cancel time.
  await db.update(marketingCampaignsTable).set({
    status: "cancelled",
    sentAt: existing.sentAt ?? new Date(),
  }).where(eq(marketingCampaignsTable.id, id));

  res.json({ success: true, status: "cancelled", skippedCount: skipped.length });
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
    resumedAt: campaign.resumedAt,
    resumeCount: campaign.resumeCount,
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
    // Reject anything that isn't a clean integer string of seconds — otherwise
    // a malformed/NaN timestamp would silently slip through the abs() check
    // (NaN compares false) and disable replay protection.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tsSeconds = /^-?\d+$/.test(svixTimestamp) ? parseInt(svixTimestamp, 10) : NaN;
    if (!Number.isFinite(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > 300) {
      res.status(401).json({ error: "Invalid or stale timestamp" });
      return;
    }

    // Use raw body bytes captured before JSON parsing to match Svix canonical bytes.
    const rawBodyStr = ((req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0)).toString("utf-8");
    const toSign = `${svixId}.${svixTimestamp}.${rawBodyStr}`;
    const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    const expectedHmac = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

    const expectedBuf = Buffer.from(expectedHmac, "base64");
    const signatures = svixSignature.split(" ");
    const valid = signatures.some(sig => {
      const parts = sig.split(",");
      // Svix format is "<version>,<base64-signature>"; only v1 is supported today.
      if (parts.length !== 2 || parts[0] !== "v1") return false;
      let providedBuf: Buffer;
      try {
        providedBuf = Buffer.from(parts[1], "base64");
      } catch {
        return false;
      }
      if (providedBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(providedBuf, expectedBuf);
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

      // Record per-link click. Resend includes the URL under data.click.link.
      if (updated.length > 0) {
        const clickData = (event.data as { click?: { link?: unknown } }).click;
        const linkUrl = typeof clickData?.link === "string" ? clickData.link : null;
        if (linkUrl) {
          await db.insert(marketingLinkClicksTable).values({
            recipientId: updated[0].id,
            campaignId: updated[0].campaignId,
            url: linkUrl,
            clickedAt: now,
          });
        }
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
      campaignId: marketingUnsubscribesTable.campaignId,
      campaignSubject: marketingCampaignsTable.subject,
    })
    .from(marketingUnsubscribesTable)
    .leftJoin(marketingCampaignsTable, eq(marketingUnsubscribesTable.campaignId, marketingCampaignsTable.id))
    .orderBy(desc(marketingUnsubscribesTable.unsubscribedAt))
    .limit(500);
  res.json({ total: rows.length, unsubscribes: rows });
});

/* ─── Export the full opt-out list as CSV ─── */
router.get("/superadmin/marketing/unsubscribes/export", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  const rows = await db
    .select({
      email: marketingUnsubscribesTable.email,
      unsubscribedAt: marketingUnsubscribesTable.unsubscribedAt,
    })
    .from(marketingUnsubscribesTable)
    .orderBy(desc(marketingUnsubscribesTable.unsubscribedAt));

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = ["email,unsubscribed_at"];
  for (const r of rows) {
    lines.push([
      escape(r.email),
      escape(r.unsubscribedAt ? new Date(r.unsubscribedAt).toISOString() : ""),
    ].join(","));
  }
  const csv = lines.join("\r\n") + "\r\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="marketing-unsubscribes.csv"`);
  res.send(csv);
});

/* ─── Re-subscribe: remove an email from the opt-out list ─── */
router.delete("/superadmin/marketing/unsubscribes/:email", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res)) return;

  // Express already URL-decodes path params, so req.params.email arrives
  // with characters like '@' already in their literal form.
  const rawEmail = req.params.email;
  if (!rawEmail) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  const email = rawEmail.trim().toLowerCase();
  // Minimal sanity check — we only want to operate on something email-shaped.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  try {
    const deleted = await db
      .delete(marketingUnsubscribesTable)
      .where(eq(marketingUnsubscribesTable.email, email))
      .returning({ id: marketingUnsubscribesTable.id, email: marketingUnsubscribesTable.email });

    if (deleted.length === 0) {
      res.status(404).json({ error: `${email} is not currently on the opt-out list` });
      return;
    }

    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({
      error: "Failed to remove opt-out",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
