import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Token-aware fetch helper for NEXXUS FSM. Talks to the shared NEXXUS API
 * server. Tenant JWT via Authorization header; the technician identity is
 * sent on every job call via the x-staff-id header.
 */

export const TOKEN_KEY = 'fsm_tenant_token';
export const TENANT_KEY = 'fsm_tenant_info';

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export async function setToken(token: string | null): Promise<void> {
  _token = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadToken(): Promise<string | null> {
  _token = await AsyncStorage.getItem(TOKEN_KEY);
  return _token;
}

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (_token) headers.authorization = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ───────────── Auth ───────────── */

export interface LoginResponse {
  token: string;
  tenant: { id: number; businessName: string; email: string };
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/saas/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export interface StaffMember {
  id: number;
  name: string;
  role: string;
}

export function authenticateStaff(pin: string): Promise<StaffMember> {
  return request<StaffMember>('/api/staff/authenticate', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

/* ───────────── Jobs ───────────── */

export type AssignmentStatus = 'pending' | 'accepted' | 'declined';

export interface FsmJob {
  id: number;
  workOrderNumber: string;
  status: string;
  assignmentStatus: AssignmentStatus;
  assignmentRespondedAt: string | null;
  declineReason: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'emergency';
  serviceType: string | null;
  serviceChannel: string;
  itemDescription: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  problemDescription: string;
  diagnosis: string | null;
  customerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  storageLocation: string | null;
  appointmentDate: string | null;
  promisedDate: string | null;
  notes: string | null;
  total: number;
  depositPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface FsmJobNote {
  id: number;
  authorName: string | null;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface FsmJobHistory {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
}

export interface FsmJobDetail extends FsmJob {
  notes2?: never;
  notes_list?: never;
  notes: string | null;
  notesList?: FsmJobNote[];
  history?: FsmJobHistory[];
}

const staffHeaders = (staffId: number): Record<string, string> => ({
  'x-staff-id': String(staffId),
});

export function listJobs(staffId: number): Promise<FsmJob[]> {
  return request<FsmJob[]>('/api/fsm/jobs', { headers: staffHeaders(staffId) });
}

export function getJob(
  staffId: number,
  id: number,
): Promise<FsmJob & { notes: FsmJobNote[] | string | null; history: FsmJobHistory[] }> {
  return request(`/api/fsm/jobs/${id}`, { headers: staffHeaders(staffId) });
}

export function acceptJob(staffId: number, id: number): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/accept`, {
    method: 'POST',
    headers: staffHeaders(staffId),
  });
}

export function declineJob(staffId: number, id: number, reason: string): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/decline`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
    headers: staffHeaders(staffId),
  });
}
