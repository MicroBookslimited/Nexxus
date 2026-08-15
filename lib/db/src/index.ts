import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL or SUPABASE_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (process.env.SUPABASE_DATABASE_URL) {
  console.log("[db] Using Supabase database");
} else {
  console.log("[db] Using Replit database");
}

const needsSsl =
  /supabase\.|neon\.tech|amazonaws\.com|render\.com/i.test(connectionString) ||
  /sslmode=require/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // A managed Postgres endpoint can disappear (suspend, restart, failover) at
  // any time. Fail a connection attempt in seconds instead of hanging a
  // request thread, and recycle idle clients so the pool doesn't hoard
  // sockets that the server has already dropped.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

// CRITICAL: an idle pooled client that errors (database suspended, network
// drop, server restart) emits 'error' on the Pool. With no listener attached
// Node treats it as an unhandled 'error' event and kills the whole process —
// which is how a database blip used to take the entire API server down.
// Log it and let the pool discard the client; the next query opens a fresh one.
pool.on("error", (err) => {
  console.error("[db] idle client error (pool will recover):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
