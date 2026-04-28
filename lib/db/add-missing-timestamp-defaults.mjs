/**
 * Backfill DEFAULT now() on NOT NULL timestamp columns whose Drizzle schema
 * declares `.defaultNow()` but whose live Postgres column was created
 * without the DEFAULT clause (sync-missing-schema.mjs creates the column
 * but skips sql/defaultFn defaults).
 *
 * Without the DB default, Drizzle's INSERT … values (..., default) errors
 * with "null value in column ... violates not-null constraint" — that's
 * exactly why "Save Pricing" / "Save Units" were failing.
 *
 * Idempotent: skips columns that already have a default.
 */
import pg from "pg";

const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) { console.error("Set SUPABASE_DATABASE_URL or DATABASE_URL"); process.exit(1); }
const needsSsl = /supabase\.|neon\.tech|amazonaws\.com|render\.com/i.test(url);
const c = new pg.Client({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
await c.connect();

const targets = [
  { table: "product_pricing_tiers",  column: "created_at" },
  { table: "product_purchase_units", column: "created_at" },
  { table: "tenant_features",        column: "created_at" },
  { table: "tenant_features",        column: "updated_at" },
  { table: "marketing_link_clicks",  column: "clicked_at" },
  { table: "marketing_unsubscribes", column: "unsubscribed_at" },
  { table: "journal_entries",        column: "date" },
];

for (const { table, column } of targets) {
  const { rows } = await c.query(
    "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
    [table, column],
  );
  if (rows.length === 0) { console.log(`skip ${table}.${column} (column not found)`); continue; }
  if (rows[0].column_default !== null) {
    console.log(`skip ${table}.${column} (already has default: ${rows[0].column_default})`);
    continue;
  }
  console.log(`SET DEFAULT now() ON ${table}.${column}`);
  await c.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT now()`);
}

await c.end();
console.log("done");
