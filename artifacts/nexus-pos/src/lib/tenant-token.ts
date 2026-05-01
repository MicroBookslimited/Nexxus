import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

export interface TenantTokenPayload {
  tenantId: number;
  email: string;
  impersonation?: boolean;
  restrictedRole?: "technician";
  actorTechnicianId?: number;
  actorName?: string;
  actorType?: "superadmin" | "technician";
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch { return null; }
}

export function getTenantTokenPayload(): TenantTokenPayload | null {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  if (!token) return null;
  const raw = decodeJwt(token);
  if (!raw) return null;
  return raw as unknown as TenantTokenPayload;
}

export function getRestrictedRole(): "technician" | null {
  const p = getTenantTokenPayload();
  return p?.restrictedRole === "technician" ? "technician" : null;
}

export function isTechnicianRestricted(): boolean {
  return getRestrictedRole() === "technician";
}

/** Routes a technician (limited tenant session) is allowed to access. */
export const TECHNICIAN_ALLOWED_PATHS = [
  "/dashboard",
  "/products",
  "/locations",
  "/ingredients",
  "/recipes",
  "/production",
  "/hardware",
  "/reports",
  "/settings",
  "/audit",
];

export function isPathAllowedForTechnician(path: string): boolean {
  return TECHNICIAN_ALLOWED_PATHS.some(p => path === p || path.startsWith(`${p}/`));
}
