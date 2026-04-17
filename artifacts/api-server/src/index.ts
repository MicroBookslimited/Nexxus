import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendDailyDigest } from "./routes/email";
import { getSetting } from "./routes/settings";
import { db } from "@workspace/db";
import { tenantAdminUsersTable, tenantsTable, marketingCampaignsTable } from "@workspace/db/schema";
import { sql, and, eq, inArray, notExists } from "drizzle-orm";
import {
  runDigestForAllTenants,
  runLowStockAlertsForAllTenants,
  runSubscriptionExpiryAlerts,
} from "./jobs/scheduled-jobs";
import { sendPendingForCampaign } from "./lib/campaign-sender";

async function migratePrimaryAdminUsers() {
  try {
    const tenants = await db
      .select({
        id: tenantsTable.id,
        ownerName: tenantsTable.ownerName,
        email: tenantsTable.email,
        passwordHash: tenantsTable.passwordHash,
      })
      .from(tenantsTable)
      .where(
        notExists(
          db
            .select({ one: sql`1` })
            .from(tenantAdminUsersTable)
            .where(
              and(
                eq(tenantAdminUsersTable.tenantId, tenantsTable.id),
                eq(tenantAdminUsersTable.isPrimary, true)
              )
            )
        )
      );

    if (tenants.length > 0) {
      await db.insert(tenantAdminUsersTable).values(
        tenants.map((t) => ({
          tenantId: t.id,
          name: t.ownerName,
          email: t.email,
          passwordHash: t.passwordHash,
          isPrimary: true,
          status: "active" as const,
        }))
      );
      logger.info({ count: tenants.length }, "Migrated existing admin tenants to admin users table");
    }
  } catch (err) {
    logger.error({ err }, "Failed to migrate primary admin users");
  }
}

async function resumeInterruptedCampaigns() {
  try {
    // Find every campaign stuck in 'sending' status.
    const stuckCampaigns = await db
      .select({ id: marketingCampaignsTable.id })
      .from(marketingCampaignsTable)
      .where(eq(marketingCampaignsTable.status, "sending"));

    if (stuckCampaigns.length === 0) return;

    const ids = stuckCampaigns.map((c) => c.id);
    logger.info({ campaignIds: ids }, "Resuming interrupted marketing campaigns");

    // Mark only the campaigns we actually identified as stuck so the UI can
    // distinguish a recovery send from a fresh one. Scoping by id avoids
    // mislabeling a brand-new send that may have started between the SELECT
    // above and this UPDATE.
    await db
      .update(marketingCampaignsTable)
      .set({
        resumedAt: new Date(),
        resumeCount: sql`${marketingCampaignsTable.resumeCount} + 1`,
      })
      .where(inArray(marketingCampaignsTable.id, ids));

    // Delegate every stuck campaign to the shared sender. It handles both cases:
    //  • pending recipients remain  → sends them, then settles counts + status
    //  • no pending recipients left → immediately settles counts + status
    // Campaigns run concurrently; each sender paces itself to ~8/s.
    for (const id of ids) {
      void sendPendingForCampaign(id).catch((err) => {
        logger.error({ err, campaignId: id }, "Failed to resume marketing campaign");
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to check for interrupted marketing campaigns");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await migratePrimaryAdminUsers();
  await resumeInterruptedCampaigns();
});

/* ───── Daily Digest Cron ───── */
// Legacy single-tenant digest (kept for backward compat with manual trigger endpoint)
// Runs every hour — checks if this is the configured digest hour, then sends.
cron.schedule("0 * * * *", async () => {
  try {
    const enabled = await getSetting("daily_digest_enabled");
    if (enabled !== "true") return;

    const hourSetting = await getSetting("daily_digest_hour");
    const configuredHour = parseInt(hourSetting || "7", 10);
    const currentHour = new Date().getHours();
    if (currentHour !== configuredHour) return;

    logger.info({ hour: currentHour }, "Running daily digest (legacy)");
    const result = await sendDailyDigest();
    if (result.sent) {
      logger.info({ to: result.to }, "Daily digest sent successfully");
    } else if (result.error) {
      logger.error({ err: result.error }, "Daily digest failed");
    }
  } catch (err) {
    logger.error({ err }, "Daily digest cron error");
  }
});

/* ───── Multi-Tenant Daily Digest + Worst Sellers Cron ───── */
// Runs every hour — for each tenant that has digest enabled, checks their configured hour.
cron.schedule("5 * * * *", async () => {
  try {
    const currentHour = new Date().getHours();
    // We run for tenants whose digest hour matches current hour.
    // runDigestForAllTenants checks each tenant's daily_digest_hour setting.
    logger.info({ hour: currentHour }, "Running multi-tenant daily digest check");
    const result = await runDigestForAllTenants();
    if (result.sent > 0) {
      logger.info(result, "Multi-tenant daily digest completed");
    }
  } catch (err) {
    logger.error({ err }, "Multi-tenant daily digest cron error");
  }
});

/* ───── Low Stock Alerts Cron ───── */
// Runs every hour at :10 — checks each tenant's low_stock_alerts_hour setting.
cron.schedule("10 * * * *", async () => {
  try {
    const currentHour = new Date().getHours();
    logger.info({ hour: currentHour }, "Running low stock alert check");
    const result = await runLowStockAlertsForAllTenants();
    if (result.sent > 0) {
      logger.info(result, "Low stock alerts completed");
    }
  } catch (err) {
    logger.error({ err }, "Low stock alerts cron error");
  }
});

/* ───── Subscription Expiry Alerts Cron ───── */
// Runs once daily at 08:00 server time.
cron.schedule("0 8 * * *", async () => {
  try {
    logger.info("Running subscription expiry alerts");
    const result = await runSubscriptionExpiryAlerts();
    logger.info(result, "Subscription expiry alerts completed");
  } catch (err) {
    logger.error({ err }, "Subscription expiry alerts cron error");
  }
});
