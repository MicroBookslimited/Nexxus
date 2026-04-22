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
});
export const db = drizzle(pool, { schema });

export * from "./schema";
