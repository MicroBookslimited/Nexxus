// One-shot ALTER for order_items.quantity (integer -> real). Safe widening.
import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  `select data_type from information_schema.columns
    where table_name='order_items' and column_name='quantity'`,
);
const t = r.rows[0]?.data_type;
console.log("order_items.quantity current:", t);
if (t === "integer") {
  await c.query(`ALTER TABLE order_items ALTER COLUMN quantity TYPE real USING quantity::real`);
  console.log("✓ widened to real");
} else {
  console.log("✓ already non-integer, no change");
}
await c.end();
