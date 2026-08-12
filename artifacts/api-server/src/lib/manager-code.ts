import { createHash } from "crypto";

/* Manager override code: required when a technician completes work WITHOUT a
 * customer sign-off. The tech calls the office; a manager generates the code
 * and reads it out. Stored hashed. Shared by the work-orders (generation)
 * and fsm (verification) routes — kept separate to avoid a circular import. */
export const MANAGER_CODE_TTL_MINUTES = 15;
export const MANAGER_CODE_MAX_ATTEMPTS = 5;

export function hashManagerCode(code: string, woId: number, tenantId: number): string {
  const secret = process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
  return createHash("sha256").update(`${secret}:manager:${tenantId}:${woId}:${code}`).digest("hex");
}
