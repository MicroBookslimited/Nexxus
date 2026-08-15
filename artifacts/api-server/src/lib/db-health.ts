import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Database reachability tracking.
 *
 * The API server must survive its database going away — a suspended managed
 * endpoint, a failover, or a network blip — and recover on its own once the
 * database returns. These helpers give the rest of the server a cheap way to
 * (a) probe connectivity and (b) recognise a connectivity failure so it can be
 * reported as "temporarily unavailable" (503) rather than a generic 500.
 */

let lastOkAt: number | null = null;
let lastErrorAt: number | null = null;
let lastError: string | null = null;

/** Postgres SQLSTATEs that mean "the server is not accepting this connection". */
const DB_DOWN_SQLSTATES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  // 28000 (invalid_authorization_specification) is how Neon/Supabase report
  // "the endpoint has been disabled" for a suspended database — a transient
  // outage, not a bad query. 28P01 (invalid_password) is deliberately NOT here:
  // that is a persistent misconfiguration and must surface as a real error.
  "28000",
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now (server starting up)
]);

const DB_DOWN_SYSCALLS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const DB_DOWN_MESSAGES = [
  "endpoint has been disabled",
  "connection terminated",
  "timeout exceeded when trying to connect",
  "connection ended unexpectedly",
  "server closed the connection unexpectedly",
  "terminating connection",
  "client has encountered a connection error",
];

/** True when the error means "the database is unreachable", not "the query was wrong". */
export function isDbConnectivityError(err: unknown): boolean {
  // Drizzle wraps the driver error, so walk the cause chain.
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    const code = typeof e.code === "string" ? e.code : null;
    if (code && (DB_DOWN_SQLSTATES.has(code) || DB_DOWN_SYSCALLS.has(code))) return true;
    const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
    if (message && DB_DOWN_MESSAGES.some((m) => message.includes(m))) return true;
    current = e.cause;
  }
  return false;
}

/** Reject after `ms` so a hung socket can never block boot or a health probe. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Drizzle wraps driver errors in a generic "Failed query: …" message, which
 * hides the actual reason. Walk the cause chain and report the deepest message
 * so a health probe says "endpoint has been disabled" / "ECONNREFUSED" rather
 * than restating the SQL we tried to run.
 */
function rootCauseMessage(err: unknown): string {
  let current: unknown = err;
  let message = err instanceof Error ? err.message : String(err);
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: unknown; cause?: unknown };
    if (typeof e.message === "string" && e.message.length > 0) message = e.message;
    current = e.cause;
  }
  return message.split("\n")[0] ?? message;
}

export interface DbPingResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** Probe the database with a trivial query. Never throws. */
export async function pingDatabase(timeoutMs = 5_000): Promise<DbPingResult> {
  const started = Date.now();
  try {
    await withTimeout(db.execute(sql`select 1`), timeoutMs, "database ping");
    lastOkAt = Date.now();
    lastError = null;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    lastErrorAt = Date.now();
    lastError = rootCauseMessage(err);
    return { ok: false, latencyMs: Date.now() - started, error: lastError };
  }
}

/** Note a live failure observed by a request handler (no extra round trip). */
export function noteDbFailure(err: unknown): void {
  lastErrorAt = Date.now();
  lastError = rootCauseMessage(err);
}

export function lastKnownDbState(): {
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
} {
  return {
    lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null,
    lastErrorAt: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
    lastError,
  };
}
