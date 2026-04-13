import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendDailyDigest } from "./routes/email";
import { getSetting } from "./routes/settings";
import { db } from "@workspace/db";
import { tenantAdminUsersTable, tenantsTable } from "@workspace/db/schema";
import { sql, and, eq, notExists } from "drizzle-orm";

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
});

/* ───── Daily Digest Cron ───── */
// Runs every hour — checks if this is the configured digest hour, then sends.
cron.schedule("0 * * * *", async () => {
  try {
    const enabled = await getSetting("daily_digest_enabled");
    if (enabled !== "true") return;

    const hourSetting = await getSetting("daily_digest_hour");
    const configuredHour = parseInt(hourSetting || "7", 10);
    const currentHour = new Date().getHours();
    if (currentHour !== configuredHour) return;

    logger.info({ hour: currentHour }, "Running daily digest");
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
