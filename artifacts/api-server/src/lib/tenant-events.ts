import { db, tenantActivityEventsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Canonical activity event types. Kept small on purpose — approach A derives
 * most metrics from existing domain tables and only logs a couple of
 * high-value events here.
 */
export const TenantEventType = {
  LOGIN: "login",
  SALE_CREATED: "sale_created",
  PRODUCT_CREATED: "product_created",
  REPORT_GENERATED: "report_generated",
  RECEIPT_PRINTED: "receipt_printed",
} as const;

export type TenantEventTypeValue = (typeof TenantEventType)[keyof typeof TenantEventType];

export interface TrackTenantEventInput {
  tenantId: number;
  eventType: string;
  userId?: number | null;
  eventReferenceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  deviceInfo?: string | null;
}

/**
 * Fire-and-forget activity logger. Never throws and never blocks the caller —
 * a failure to record analytics must not break a login or a sale.
 */
export function trackTenantEvent(input: TrackTenantEventInput): void {
  void (async () => {
    try {
      await db.insert(tenantActivityEventsTable).values({
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        eventType: input.eventType,
        eventReferenceId:
          input.eventReferenceId != null ? String(input.eventReferenceId) : null,
        metadata: input.metadata ?? null,
        ipAddress: input.ipAddress ?? null,
        deviceInfo: input.deviceInfo ?? null,
      });
    } catch (err) {
      logger.warn(
        { err, eventType: input.eventType, tenantId: input.tenantId },
        "trackTenantEvent failed",
      );
    }
  })();
}

/** Extract a best-effort client IP from an Express request. */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback?: string): string | null {
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(",")[0]!.trim();
  return fallback ?? null;
}
