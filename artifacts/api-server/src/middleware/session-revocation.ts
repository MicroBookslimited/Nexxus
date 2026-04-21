import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, tenantsTable, tenantAdminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

type CacheEntry = { invalidatedAt: number | null; expiresAt: number };
const tenantCache = new Map<number, CacheEntry>();
const adminUserCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(map: Map<number, CacheEntry>, id: number): CacheEntry | null {
  const e = map.get(id);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { map.delete(id); return null; }
  return e;
}

async function loadTenantInvalidatedAt(tenantId: number): Promise<number | null> {
  const cached = getCached(tenantCache, tenantId);
  if (cached) return cached.invalidatedAt;
  const [row] = await db
    .select({ at: tenantsTable.sessionsInvalidatedAt })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const value = row?.at ? row.at.getTime() : null;
  tenantCache.set(tenantId, { invalidatedAt: value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function loadAdminUserInvalidatedAt(adminUserId: number): Promise<number | null> {
  const cached = getCached(adminUserCache, adminUserId);
  if (cached) return cached.invalidatedAt;
  const [row] = await db
    .select({ at: tenantAdminUsersTable.sessionsInvalidatedAt })
    .from(tenantAdminUsersTable)
    .where(eq(tenantAdminUsersTable.id, adminUserId))
    .limit(1);
  const value = row?.at ? row.at.getTime() : null;
  adminUserCache.set(adminUserId, { invalidatedAt: value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Call after bumping a tenant's sessions_invalidated_at so subsequent requests pick it up immediately. */
export function clearTenantSessionCache(tenantId: number): void {
  tenantCache.delete(tenantId);
}

/** Call after bumping an admin user's sessions_invalidated_at. */
export function clearAdminUserSessionCache(adminUserId: number): void {
  adminUserCache.delete(adminUserId);
}

/**
 * Global middleware that rejects any tenant JWT whose `iat` is older than the
 * tenant's (or admin user's) `sessions_invalidated_at` timestamp. This is what
 * makes the "Force Logout" button effective without breaking other auth paths.
 *
 * Fail-open on errors: parse failures, DB errors, or invalid JWTs all `next()`
 * through to let downstream route handlers do their own auth.
 */
export async function sessionRevocationMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { next(); return; }
    const token = auth.slice(7);

    let payload: { type?: string; tenantId?: number; adminUserId?: number; iat?: number } | null = null;
    try {
      payload = jwt.verify(token, getJwtSecret()) as typeof payload;
    } catch {
      next(); return;
    }
    if (!payload || payload.type !== "tenant" || !payload.iat || !payload.tenantId) {
      next(); return;
    }

    const iatMs = payload.iat * 1000;
    const [tenantInv, adminInv] = await Promise.all([
      loadTenantInvalidatedAt(payload.tenantId),
      payload.adminUserId ? loadAdminUserInvalidatedAt(payload.adminUserId) : Promise.resolve(null),
    ]);

    const cutoff = Math.max(tenantInv ?? 0, adminInv ?? 0);
    if (cutoff > 0 && iatMs < cutoff) {
      _res.status(401).json({ error: "Session revoked. Please log in again.", code: "SESSION_REVOKED" });
      return;
    }
    next();
  } catch {
    next();
  }
}
