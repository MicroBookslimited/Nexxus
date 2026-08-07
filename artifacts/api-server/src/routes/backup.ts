import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import crypto from "crypto";
import zlib from "zlib";

/**
 * Offline tenant backup & restore.
 *
 * Design notes:
 * - Tables are discovered at runtime from the database catalog (any table with
 *   a tenant_id column, plus child tables reachable via FK from an included
 *   parent). New tables added later are picked up automatically.
 * - Control-plane / billing / integration-secret / ephemeral tables are
 *   excluded via EXCLUDED_TABLES below.
 * - The backup file is gzip'd JSON encrypted with AES-256-GCM using a key
 *   derived from the tenant's chosen password (scrypt).
 * - Restore is a full wipe-and-replace of the tenant's business data inside a
 *   single transaction, and only into the SAME tenant account the backup was
 *   taken from (serial ids are global across tenants, so cross-tenant restores
 *   would collide with other tenants' rows).
 */

const router: IRouter = Router();

const BACKUP_FORMAT = "nexxus-backup";
const BACKUP_VERSION = 1;

/** Tables that must never be part of a tenant backup, even though they carry tenant_id. */
const EXCLUDED_TABLES = new Set<string>([
  // Platform control-plane / account identity
  "tenants",
  "tenant_admin_users",
  "tenant_addons",
  "tenant_features",
  // Billing & subscriptions (platform-owned financial records)
  "subscriptions",
  "subscription_plans",
  "subscription_manual_payments",
  "subscription_invoices",
  "subscription_coupon_redemptions",
  "bank_transfer_proofs",
  "reseller_commissions",
  "resellers",
  "reseller_payouts",
  // Wallet / money (restoring an old balance would mint funds)
  "topup_transactions",
  "topup_wallets",
  "topup_wallet_ledger",
  // Integration state & encrypted secrets
  "quickbooks_connection",
  "quickbooks_connections",
  "shopify_connections",
  "shopify_app_credentials",
  "shopify_oauth_states",
  "shopify_order_mappings",
  "shopify_product_mappings",
  "shopify_sync_logs",
  // Platform telemetry / audit / support
  "audit_logs",
  "impersonation_logs",
  "support_tickets",
  "support_ticket_responses",
  "tenant_activity_events",
  "tenant_usage_snapshots",
  "tenant_usage_alerts",
  // Ephemeral operational state
  "staff_sessions",
  "weight_labels",
  "sessions",
]);

type Ctx = { tenantId: number; email: string };

function getCtx(req: Request, res: Response): Ctx | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  // Backup/restore is a tenant-admin capability; restricted staff tokens
  // (e.g. technicians) must not export or wipe business data.
  if (payload.restrictedRole) {
    res.status(403).json({ error: "Only the account admin can use backup & restore" });
    return null;
  }
  return { tenantId: payload.tenantId, email: payload.email };
}

/* ── Schema discovery ─────────────────────────────────────────────────── */

interface FkEdge {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
}

interface Discovery {
  /** included table -> SQL (with $1 = tenantId) selecting that tenant's rows */
  selects: Map<string, string>;
  /** insert/parent-first order over included tables */
  topoOrder: string[];
  /** table -> whether it has its own tenant_id column */
  hasTenantId: Map<string, boolean>;
  /** table -> column name -> udt/data type */
  columnTypes: Map<string, Map<string, string>>;
}

async function discoverSchema(): Promise<Discovery> {
  const tenantTablesRes = await pool.query(
    `SELECT c.table_name FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_name = c.table_name AND t.table_schema = 'public'
      WHERE c.column_name = 'tenant_id' AND c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'`,
  );
  const tenantTables = new Set<string>(
    tenantTablesRes.rows.map((r) => r.table_name as string).filter((t) => !EXCLUDED_TABLES.has(t)),
  );

  const fkRes = await pool.query(
    `SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
            ccu.table_name AS parent_table, ccu.column_name AS parent_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const fks: FkEdge[] = fkRes.rows.map((r) => ({
    childTable: r.child_table,
    childColumn: r.child_column,
    parentTable: r.parent_table,
    parentColumn: r.parent_column,
  }));

  const colRes = await pool.query(
    `SELECT table_name, column_name, udt_name FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );
  const columnTypes = new Map<string, Map<string, string>>();
  for (const r of colRes.rows) {
    let m = columnTypes.get(r.table_name);
    if (!m) columnTypes.set(r.table_name, (m = new Map()));
    m.set(r.column_name, r.udt_name);
  }

  const q = (name: string) => `"${name.replace(/"/g, "")}"`;

  // Seed: tables with a tenant_id column.
  const selects = new Map<string, string>();
  const hasTenantId = new Map<string, boolean>();
  for (const t of tenantTables) {
    selects.set(t, `SELECT * FROM ${q(t)} WHERE tenant_id = $1`);
    hasTenantId.set(t, true);
  }

  // Fixpoint: pull in FK children of included tables (order_items, etc.).
  let changed = true;
  while (changed) {
    changed = false;
    for (const fk of fks) {
      if (selects.has(fk.childTable)) continue;
      if (EXCLUDED_TABLES.has(fk.childTable)) continue;
      const parentSel = selects.get(fk.parentTable);
      if (!parentSel) continue;
      selects.set(
        fk.childTable,
        `SELECT * FROM ${q(fk.childTable)} WHERE ${q(fk.childColumn)} IN (SELECT ${q(fk.parentColumn)} FROM (${parentSel}) __p)`,
      );
      hasTenantId.set(fk.childTable, false);
      changed = true;
    }
  }

  // Topological sort (parents first) over included tables.
  const included = Array.from(selects.keys());
  const deps = new Map<string, Set<string>>(); // table -> parents it depends on
  for (const t of included) deps.set(t, new Set());
  for (const fk of fks) {
    if (fk.childTable === fk.parentTable) continue;
    if (deps.has(fk.childTable) && selects.has(fk.parentTable)) {
      deps.get(fk.childTable)!.add(fk.parentTable);
    }
  }
  const topoOrder: string[] = [];
  const done = new Set<string>();
  let progress = true;
  while (done.size < included.length && progress) {
    progress = false;
    for (const t of included) {
      if (done.has(t)) continue;
      const parents = deps.get(t)!;
      if (Array.from(parents).every((p) => done.has(p))) {
        topoOrder.push(t);
        done.add(t);
        progress = true;
      }
    }
  }
  // FK cycles (rare) — append remaining tables; inserts may need retry but we
  // fail loudly inside the transaction rather than silently skipping data.
  for (const t of included) if (!done.has(t)) topoOrder.push(t);

  return { selects, topoOrder, hasTenantId, columnTypes };
}

/* ── Crypto helpers ───────────────────────────────────────────────────── */

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

function encryptPayload(json: string, password: string) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const gz = zlib.gzipSync(Buffer.from(json, "utf8"));
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(gz), cipher.final()]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
}

function decryptPayload(envelope: Record<string, unknown>, password: string): string {
  const salt = Buffer.from(String(envelope["salt"] ?? ""), "base64");
  const iv = Buffer.from(String(envelope["iv"] ?? ""), "base64");
  const tag = Buffer.from(String(envelope["tag"] ?? ""), "base64");
  const data = Buffer.from(String(envelope["data"] ?? ""), "base64");
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const gz = Buffer.concat([decipher.update(data), decipher.final()]);
  // Cap decompressed size so a malicious "zip bomb" file can't exhaust memory.
  return zlib.gunzipSync(gz, { maxOutputLength: 1024 * 1024 * 1024 }).toString("utf8");
}

/* ── Export ───────────────────────────────────────────────────────────── */

router.post("/backup/export", async (req, res) => {
  const ctx = getCtx(req, res);
  if (!ctx) return;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 6) {
    res.status(400).json({ error: "Backup password must be at least 6 characters" });
    return;
  }
  try {
    const disc = await discoverSchema();
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    // Dump all tables from ONE repeatable-read snapshot so parents and
    // children are consistent even if sales are happening during the export.
    const client = await pool.connect();
    let bizName: string | null = null;
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for (const t of disc.topoOrder) {
        const sel = disc.selects.get(t)!;
        const r = await client.query(sel, [ctx.tenantId]);
        tables[t] = r.rows;
        counts[t] = r.rowCount ?? r.rows.length;
      }
      const bizRes = await client.query(`SELECT business_name FROM tenants WHERE id = $1`, [ctx.tenantId]);
      bizName = bizRes.rows[0]?.business_name ?? null;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const payload = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      tenantId: ctx.tenantId,
      businessName: bizName,
      createdAt: new Date().toISOString(),
      tableOrder: disc.topoOrder,
      counts,
      tables,
    };
    const envelope = encryptPayload(JSON.stringify(payload), password);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="nexxus-backup-${stamp}.nxbk"`);
    res.send(Buffer.from(JSON.stringify(envelope), "utf8"));
  } catch (err) {
    console.error("[backup] export failed:", err);
    res.status(500).json({ error: "Backup export failed" });
  }
});

/* ── Restore ──────────────────────────────────────────────────────────── */

router.post("/backup/restore", async (req, res) => {
  const ctx = getCtx(req, res);
  if (!ctx) return;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const envelope = req.body?.file;
  if (!password || !envelope || typeof envelope !== "object") {
    res.status(400).json({ error: "Backup file and password are required" });
    return;
  }
  if (envelope.format !== BACKUP_FORMAT) {
    res.status(400).json({ error: "This is not a NEXXUS backup file" });
    return;
  }
  if (Number(envelope.version) > BACKUP_VERSION) {
    res.status(400).json({ error: "This backup was created by a newer version of NEXXUS" });
    return;
  }

  let payload: {
    format: string;
    tenantId: number;
    tableOrder: string[];
    tables: Record<string, Record<string, unknown>[]>;
  };
  try {
    payload = JSON.parse(decryptPayload(envelope as Record<string, unknown>, password));
  } catch {
    res.status(400).json({ error: "Could not decrypt the backup — wrong password or corrupted file" });
    return;
  }
  if (payload.format !== BACKUP_FORMAT || !payload.tables) {
    res.status(400).json({ error: "Backup file contents are invalid" });
    return;
  }
  // Serial ids are global across tenants, so a backup may only be restored
  // into the SAME tenant account it was taken from.
  if (payload.tenantId !== ctx.tenantId) {
    res.status(403).json({
      error: "This backup belongs to a different NEXXUS account and cannot be restored here",
    });
    return;
  }

  const client = await pool.connect();
  try {
    const disc = await discoverSchema();
    // Insert only tables present in both the backup and the current schema —
    // but WIPE every currently-discovered tenant table, so a restore is a true
    // full replacement (a table added to NEXXUS after the backup was taken
    // must not keep its post-backup rows).
    const restoreTables = disc.topoOrder.filter((t) => Array.isArray(payload.tables[t]));

    await client.query("BEGIN");

    // Wipe children first (reverse parent-first order). Child tables without
    // tenant_id are deleted via their parent-chain subquery while parents
    // still exist.
    for (const t of [...disc.topoOrder].reverse()) {
      if (disc.hasTenantId.get(t)) {
        await client.query(`DELETE FROM "${t}" WHERE tenant_id = $1`, [ctx.tenantId]);
      } else {
        const sel = disc.selects.get(t)!;
        await client.query(
          `DELETE FROM "${t}" WHERE ctid IN (SELECT ctid FROM (${sel}) __rows)`.replace(
            `SELECT * FROM "${t}"`,
            `SELECT ctid, * FROM "${t}"`,
          ),
          [ctx.tenantId],
        );
      }
    }

    // Insert parents first.
    const restoredCounts: Record<string, number> = {};
    for (const t of restoreTables) {
      const rows = payload.tables[t]!;
      restoredCounts[t] = rows.length;
      if (rows.length === 0) continue;
      const currentCols = disc.columnTypes.get(t);
      if (!currentCols) continue;
      // Use the union of row keys intersected with current columns.
      const cols = Array.from(
        rows.reduce((s, r) => {
          for (const k of Object.keys(r)) if (currentCols.has(k)) s.add(k);
          return s;
        }, new Set<string>()),
      );
      if (cols.length === 0) continue;
      const colSql = cols.map((c) => `"${c}"`).join(", ");
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const tuples = chunk
          .map((row) => {
            const ph = cols.map((c) => {
              let v: unknown = row[c] === undefined ? null : row[c];
              // Force tenant ownership regardless of file contents.
              if (c === "tenant_id" && disc.hasTenantId.get(t)) v = ctx.tenantId;
              const type = currentCols.get(c);
              if (v !== null && typeof v === "object" && (type === "json" || type === "jsonb")) {
                v = JSON.stringify(v);
              }
              params.push(v);
              return `$${params.length}`;
            });
            return `(${ph.join(", ")})`;
          })
          .join(", ");
        await client.query(`INSERT INTO "${t}" (${colSql}) VALUES ${tuples}`, params);
      }
    }

    // Bump serial sequences past the highest id so future inserts don't collide.
    for (const t of restoreTables) {
      if (!disc.columnTypes.get(t)?.has("id")) continue;
      await client.query(
        `SELECT setval(seq, GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${t}"), 1))
           FROM (SELECT pg_get_serial_sequence('"${t}"', 'id') AS seq) s WHERE seq IS NOT NULL`,
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, restored: restoredCounts });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[backup] restore failed:", err);
    res.status(500).json({ error: "Restore failed — no changes were made", details: String((err as Error).message ?? err) });
  } finally {
    client.release();
  }
});

export default router;
