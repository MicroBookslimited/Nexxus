import pg from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db/schema";

const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
const needsSsl = /supabase\.|neon\.tech|amazonaws\.com|render\.com/i.test(url);
const c = new pg.Client({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
await c.connect();

function pgType(col) {
  const sqlName = col.getSQLType ? col.getSQLType() : col.columnType;
  return sqlName;
}

function colDef(col) {
  const parts = [`"${col.name}"`, pgType(col)];
  if (col.notNull) parts.push("NOT NULL");
  if (col.hasDefault && col.default !== undefined) {
    if (typeof col.default === "string") parts.push(`DEFAULT '${col.default.replace(/'/g, "''")}'`);
    else if (typeof col.default === "number" || typeof col.default === "boolean") parts.push(`DEFAULT ${col.default}`);
  } else if (col.defaultFn) {
    // best-effort defaults for now()
  }
  // Handle defaultNow / sql defaults
  if (col.default && typeof col.default === "object" && "queryChunks" in col.default) {
    // sql template - skip auto, handle common case
  }
  return parts.join(" ");
}

const allTables = Object.values(schema).filter(
  (v) => v && typeof v === "object" && Symbol.for("drizzle:IsDrizzleTable") in v
);

const dbTables = new Set(
  (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map((r) => r.tablename)
);

const missingTables = [];
const missingColumns = [];

for (const t of allTables) {
  const cfg = getTableConfig(t);
  const tname = cfg.name;
  if (!dbTables.has(tname)) {
    missingTables.push({ name: tname, columns: cfg.columns });
    continue;
  }
  const dbCols = new Set(
    (
      await c.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
        [tname]
      )
    ).rows.map((r) => r.column_name)
  );
  for (const col of cfg.columns) {
    if (!dbCols.has(col.name)) {
      missingColumns.push({ table: tname, col });
    }
  }
}

console.log(`\n=== Missing Tables (${missingTables.length}) ===`);
for (const t of missingTables) console.log(" -", t.name);

console.log(`\n=== Missing Columns (${missingColumns.length}) ===`);
for (const m of missingColumns) console.log(` - ${m.table}.${m.col.name} (${pgType(m.col)})`);

if (process.argv.includes("--apply")) {
  console.log("\n=== Applying ===");
  for (const t of missingTables) {
    const cols = t.columns.map((c) => {
      let def = colDef(c);
      if (c.primary) def += " PRIMARY KEY";
      return def;
    });
    const sql = `CREATE TABLE IF NOT EXISTS "${t.name}" (${cols.join(", ")})`;
    try {
      await c.query(sql);
      console.log("CREATE", t.name, "OK");
    } catch (e) {
      console.log("CREATE", t.name, "FAIL:", e.message);
      console.log("  SQL:", sql);
    }
  }
  for (const m of missingColumns) {
    const def = colDef(m.col);
    // Strip NOT NULL if no default to avoid failure on existing rows
    const hasDefault = /DEFAULT/.test(def);
    const safeDef = !hasDefault ? def.replace(/ NOT NULL/, "") : def;
    const sql = `ALTER TABLE "${m.table}" ADD COLUMN IF NOT EXISTS ${safeDef}`;
    try {
      await c.query(sql);
      console.log("ALTER", m.table, "+", m.col.name, "OK");
    } catch (e) {
      console.log("ALTER", m.table, "+", m.col.name, "FAIL:", e.message);
    }
  }
}

await c.end();
