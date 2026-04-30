import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

export interface StaffShift {
  id: number;
  tenantId: number;
  staffId: number;
  staffName: string;
  locationId: number | null;
  locationName: string | null;
  clockInTime: string;
  clockOutTime: string | null;
  status: "active" | "closed";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  durationSeconds?: number | null;
  elapsedSeconds?: number;
}

function authHeaders(staffId?: number | null): Record<string, string> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (staffId) h["x-staff-id"] = String(staffId);
  return h;
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    const err = new Error(body.error || resp.statusText) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = resp.status;
    err.body = body;
    throw err;
  }
  return resp.json() as Promise<T>;
}

export async function getCurrentShift(staffId: number): Promise<StaffShift | null> {
  const resp = await fetch("/api/staff/sessions/current", { headers: authHeaders(staffId) });
  if (resp.status === 404) return null;
  return handle<StaffShift>(resp);
}

export async function clockIn(input: {
  staffId: number;
  locationId?: number;
  notes?: string;
}): Promise<StaffShift> {
  const resp = await fetch("/api/staff/clock-in", {
    method: "POST",
    headers: authHeaders(input.staffId),
    body: JSON.stringify(input),
  });
  return handle<StaffShift>(resp);
}

export async function clockOut(input: { staffId: number; notes?: string }): Promise<StaffShift> {
  const resp = await fetch("/api/staff/clock-out", {
    method: "POST",
    headers: authHeaders(input.staffId),
    body: JSON.stringify(input),
  });
  return handle<StaffShift>(resp);
}

export async function listShifts(filters: {
  staffId?: number;
  locationId?: number;
  status?: "active" | "closed";
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<StaffShift[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  const resp = await fetch(`/api/staff/sessions${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  return handle<StaffShift[]>(resp);
}

export async function listActiveShifts(): Promise<StaffShift[]> {
  const resp = await fetch("/api/staff/sessions/active", { headers: authHeaders() });
  return handle<StaffShift[]>(resp);
}
