import pg from "pg";
import { logger } from "./logger";

/**
 * Repair NOT NULL timestamp columns whose Drizzle schema declares
 * `.notNull().defaultNow()` but whose live Postgres column is missing the
 * `DEFAULT now()` clause.
 *
 * Why this exists at server boot:
 *   The Replit deployment system runs an auto-generated drizzle migration
 *   step during Publish that has a long-standing quirk: it produces
 *   `ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT` for several timezoned
 *   timestamp columns even when the schema declares `.defaultNow()`.
 *   That step runs AFTER our `scripts/migrate-prod.sh`, so any fix applied
 *   there gets overwritten before the server starts. Fixing the defaults
 *   here — right before `app.listen()` — guarantees the database is in a
 *   correct state every boot, no matter what migration ran.
 *
 *   Without the column-side default, Drizzle's
 *     INSERT … VALUES (..., default)
 *   crashes with "null value in column ... violates not-null constraint",
 *   which is exactly why "Save Pricing" / "Save Units" / etc. were failing
 *   in production after every deploy.
 *
 * Idempotent — skips columns that already have a default and silently no-ops
 * for any column or table that doesn't exist.
 */
const TARGETS: Array<{ table: string; column: string }> = [
  { table: "product_pricing_tiers", column: "created_at" },
  { table: "product_purchase_units", column: "created_at" },
  { table: "tenant_features", column: "created_at" },
  { table: "tenant_features", column: "updated_at" },
  { table: "marketing_link_clicks", column: "clicked_at" },
  { table: "marketing_unsubscribes", column: "unsubscribed_at" },
  { table: "journal_entries", column: "date" },
];

export async function repairTimestampDefaults(): Promise<void> {
  const url = process.env["SUPABASE_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    logger.warn("repairTimestampDefaults: no DATABASE_URL set, skipping");
    return;
  }
  const needsSsl = /supabase\.|neon\.tech|amazonaws\.com|render\.com/i.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    const repaired: string[] = [];
    for (const { table, column } of TARGETS) {
      const { rows } = await client.query<{ column_default: string | null }>(
        "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
        [table, column],
      );
      if (rows.length === 0) continue; // column or table absent
      if (rows[0]!.column_default !== null) continue; // already has a default
      await client.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT now()`,
      );
      repaired.push(`${table}.${column}`);
    }
    if (repaired.length > 0) {
      logger.info({ repaired }, "Restored DEFAULT now() on timestamp columns");
    }
  } catch (err) {
    // Don't crash the server — log and continue. A warm DB is better than no DB.
    logger.error({ err }, "repairTimestampDefaults failed");
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}
