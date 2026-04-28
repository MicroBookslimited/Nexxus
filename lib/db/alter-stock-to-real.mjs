/**
 * One-shot migration: convert integer stock/quantity columns to real so
 * sold-by-weight products (e.g. Banana 4.5 kg) can be ordered without
 * the inventory deduction crashing PostgreSQL with
 *   "column 'stock_count' is of type integer but expression is of type numeric".
 *
 * Run with `node lib/db/alter-stock-to-real.mjs`. Idempotent.
 */
import pg from "pg";

const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set SUPABASE_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}
const needsSsl = /supabase\.|neon\.tech|amazonaws\.com|render\.com/i.test(url);
const c = new pg.Client({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
await c.connect();

const targets = [
  { table: "products", column: "stock_count" },
  { table: "location_inventory", column: "stock_count" },
  { table: "stock_movements", column: "quantity" },
  { table: "stock_movements", column: "balance_after" },
  // order_items.quantity must accept decimals for sold-by-weight products.
  // The Drizzle schema already declared it real, but the live column was
  // integer because no migration had been applied for it.
  { table: "order_items", column: "quantity" },
];

for (const { table, column } of targets) {
  const { rows } = await c.query(
    "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
    [table, column],
  );
  if (rows.length === 0) {
    console.log(`skip ${table}.${column} (column not found)`);
    continue;
  }
  const current = rows[0].data_type;
  if (current === "real" || current === "double precision" || current === "numeric") {
    console.log(`skip ${table}.${column} (already ${current})`);
    continue;
  }
  console.log(`ALTER ${table}.${column}: ${current} -> real`);
  await c.query(
    `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DATA TYPE real USING "${column}"::real`,
  );
}

await c.end();
console.log("done");
