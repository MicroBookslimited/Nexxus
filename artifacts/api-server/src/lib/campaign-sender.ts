import { db, marketingCampaignsTable, marketingRecipientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendMarketingMail } from "./marketing-mail";
import { logger } from "./logger";
import jwt from "jsonwebtoken";

function getJwtSecret() {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function buildUnsubscribeUrl(email: string): string {
  const token = jwt.sign({ type: "unsubscribe", email }, getJwtSecret());
  const base =
    process.env["PUBLIC_API_URL"] ??
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api`
      : "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Sends all pending recipients for the given campaign, updating statuses as it
 * goes. Safe to call mid-campaign — it only processes recipients whose status
 * is still 'pending', so already-sent recipients are never re-emailed.
 */
export async function sendPendingForCampaign(campaignId: number): Promise<void> {
  const [campaign] = await db
    .select()
    .from(marketingCampaignsTable)
    .where(eq(marketingCampaignsTable.id, campaignId))
    .limit(1);

  if (!campaign) {
    logger.warn({ campaignId }, "campaign-sender: campaign not found, skipping");
    return;
  }

  const pendingRecipients = await db
    .select()
    .from(marketingRecipientsTable)
    .where(
      and(
        eq(marketingRecipientsTable.campaignId, campaignId),
        eq(marketingRecipientsTable.status, "pending")
      )
    );

  if (pendingRecipients.length === 0) {
    logger.info({ campaignId }, "campaign-sender: no pending recipients, settling final status");
    await settleCampaignStatus(campaignId);
    return;
  }

  logger.info({ campaignId, pending: pendingRecipients.length }, "campaign-sender: starting send");

  let batchSent = 0;
  let batchFailed = 0;

  for (const r of pendingRecipients) {
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(r.email);
      const result = await sendMarketingMail({
        to: r.email,
        subject: campaign.subject,
        html: campaign.htmlBody,
        fromName: campaign.fromName,
        fromAddress: campaign.fromAddress,
        unsubscribeUrl,
      });
      await db
        .update(marketingRecipientsTable)
        .set({ status: "sent", messageId: result.messageId ?? null, sentAt: new Date() })
        .where(eq(marketingRecipientsTable.id, r.id));
      batchSent++;
    } catch (err) {
      await db
        .update(marketingRecipientsTable)
        .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err) })
        .where(eq(marketingRecipientsTable.id, r.id));
      batchFailed++;
    }

    // Pace to ~8 per second to stay under Resend's 10/s rate limit.
    await new Promise((resolve) => setTimeout(resolve, 130));

    if ((batchSent + batchFailed) % 25 === 0) {
      await flushCounts(campaignId);
    }
  }

  await settleCampaignStatus(campaignId);
  logger.info({ campaignId, batchSent, batchFailed }, "campaign-sender: finished");
}

/**
 * Reads live counts from the recipients table and writes final status to the
 * campaign row.  Called after all pending recipients have been processed.
 */
async function settleCampaignStatus(campaignId: number): Promise<void> {
  await flushCounts(campaignId);

  const [campaign] = await db
    .select()
    .from(marketingCampaignsTable)
    .where(eq(marketingCampaignsTable.id, campaignId))
    .limit(1);

  if (!campaign) return;

  const sent = campaign.sentCount ?? 0;
  const failed = campaign.failedCount ?? 0;
  const finalStatus = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";

  await db
    .update(marketingCampaignsTable)
    .set({ status: finalStatus, sentAt: campaign.sentAt ?? new Date() })
    .where(eq(marketingCampaignsTable.id, campaignId));
}

/**
 * Computes live sent/failed counts from recipient rows and writes them to the
 * campaign row without changing the campaign status.
 */
async function flushCounts(campaignId: number): Promise<void> {
  const recipients = await db
    .select()
    .from(marketingRecipientsTable)
    .where(eq(marketingRecipientsTable.campaignId, campaignId));

  const sent = recipients.filter((r) => r.status === "sent").length;
  const failed = recipients.filter((r) => r.status === "failed").length;

  await db
    .update(marketingCampaignsTable)
    .set({ sentCount: sent, failedCount: failed })
    .where(eq(marketingCampaignsTable.id, campaignId));
}
