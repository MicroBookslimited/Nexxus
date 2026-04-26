import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

/* ─── Result cache ─── */
type CacheEntry = { isExpired: boolean; expiresAt: number };
const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export function clearSubscriptionCache(tenantId: number): void {
  cache.delete(tenantId);
}

async function isTenantSubscriptionExpired(tenantId: number): Promise<boolean> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.isExpired;

  const [sub] = await db
    .select({
      status: subscriptionsTable.status,
      trialEndsAt: subscriptionsTable.trialEndsAt,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);

  let isExpired = false;
  if (!sub) {
    // No subscription row → treat as not expired (free / unprovisioned).
    isExpired = false;
  } else {
    const now = Date.now();
    const status = sub.status?.toLowerCase() ?? "trial";
    if (status === "expired" || status === "suspended" || status === "cancelled") {
      isExpired = true;
    } else if (status === "trial") {
      // Trial expires when trialEndsAt is in the past.
      isExpired = !!sub.trialEndsAt && sub.trialEndsAt.getTime() < now;
    } else if (status === "active") {
      // Active expires when currentPeriodEnd is past (no recent renewal).
      isExpired = !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now;
    }
  }

  cache.set(tenantId, { isExpired, expiresAt: Date.now() + CACHE_TTL_MS });
  return isExpired;
}

/**
 * Routes that must remain writable even on an expired subscription so the
 * tenant can renew, log out, or contact support. Match by exact prefix.
 *
 * IMPORTANT: keep this list tight — anything writable here bypasses the guard.
 */
const ALLOWED_WRITE_PREFIXES = [
  // ── Auth essentials so the tenant can log in / out / reset password.
  "/api/saas/login",
  "/api/saas/logout",
  "/api/saas/password",
  "/api/saas/forgot",
  "/api/saas/reset",
  "/api/saas/refresh",
  // ── Billing / renewal flow (must remain writable to renew).
  "/api/billing",
  // ── Platform-level write paths (not tenant-acting).
  "/api/superadmin",
  "/api/marketing/webhook",
  "/api/topup",
  "/api/marketing/unsubscribe",
  "/api/health",
  // ── Public read/write hits that are not tenant-token authenticated;
  //    we still let them through because the guard only blocks tenant tokens.
  "/api/store/public",
];

/**
 * Subscription read-only guard.
 *
 * - Allows ALL GET/HEAD requests through, regardless of subscription state.
 * - For tenant-token-bearing POST/PUT/PATCH/DELETE, blocks with 402 when the
 *   subscription is expired/suspended/cancelled or its end date is past.
 * - Always allows the routes in ALLOWED_WRITE_PREFIXES so the tenant can renew.
 */
export async function subscriptionGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }

    // Whitelisted writable paths.
    if (ALLOWED_WRITE_PREFIXES.some(p => req.path.startsWith(p) || ("/api" + req.path).startsWith(p))) {
      next();
      return;
    }

    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) {
      // No tenant token → let downstream route handler enforce auth.
      next();
      return;
    }
    const token = auth.slice(7);

    let payload: { type?: string; tenantId?: number } | null = null;
    try {
      payload = jwt.verify(token, getJwtSecret()) as typeof payload;
    } catch {
      next();
      return;
    }
    if (!payload || payload.type !== "tenant" || !payload.tenantId) {
      next();
      return;
    }

    const expired = await isTenantSubscriptionExpired(payload.tenantId);
    if (expired) {
      logger.info(
        { tenantId: payload.tenantId, method, path: req.path },
        "[subscription-guard] blocked write — subscription expired",
      );
      res.status(402).json({
        error: "SUBSCRIPTION_EXPIRED",
        message: "Subscription expired – renew to continue selling",
      });
      return;
    }
    next();
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "[subscription-guard] error — failing open");
    next();
  }
}
