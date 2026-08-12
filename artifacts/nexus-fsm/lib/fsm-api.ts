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
export type FieldPhase = 'idle' | 'en_route' | 'on_site' | 'done';

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
  customerId: number | null;
  assignedStaffIds: number[];
  appointmentDate: string | null;
  estimatedMinutes: number | null;
  promisedDate: string | null;
  notes: string | null;
  total: number;
  depositPaid: number;
  travelStartedAt: string | null;
  arrivedAt: string | null;
  workCompletedAt: string | null;
  completionSignedBy: string | null;
  completionSignedAt: string | null;
  fieldPhase: FieldPhase;
  createdAt: string;
  updatedAt: string;
}

export interface FsmWorkItem {
  description: string;
  quantity: number;
  price: number;
  type?: string;
}

export interface FsmPhoto {
  id: number;
  staffId: number | null;
  staffName: string | null;
  data: string; // image data URL
  caption: string | null;
  createdAt: string;
}

export interface FsmTimeEntry {
  id: number;
  staffName: string | null;
  entryType: 'work' | 'break' | 'waiting';
  pauseReason: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  isBillable: boolean;
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

export type InstallDetailsMap = Record<string, Record<string, unknown>>;

/* ───────────── Material / cable allocations ───────────── */

export interface CableRun {
  label: string;
  location?: string;
  port?: string;
  startFt?: number | null;
  endFt?: number | null;
  lengthFt?: number | null;
  tested?: boolean | null;
  remarks?: string;
}

export interface Allocation {
  id: number;
  workOrderId: number;
  productId: number | null;
  description: string;
  category: string | null;
  unit: string;
  qtyAllocated: number;
  qtyReturned: number;
  isReturnable: boolean;
  isCable: boolean;
  boxSizeFt: number | null;
  runs: CableRun[];
  status: 'dispatched' | 'returned';
  dispatchedByName: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
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
): Promise<FsmJob & {
  notes: FsmJobNote[] | string | null;
  history: FsmJobHistory[];
  timeEntries: FsmTimeEntry[];
  billableMinutes: number;
  pausedMinutes: number;
  activeEntry: FsmTimeEntry | null;
  photos: FsmPhoto[];
  completionSignature: string | null;
  customerSignature: string | null;
  items: FsmWorkItem[];
  subtotal: number | null;
  discountAmount: number | null;
  tax: number | null;
  serviceAreas: string[];
  installDetails: InstallDetailsMap;
  allocations: Allocation[];
}> {
  return request(`/api/fsm/jobs/${id}`, { headers: staffHeaders(staffId) });
}

export function updateAllocation(
  staffId: number,
  jobId: number,
  allocationId: number,
  body: { qtyReturned?: number; runs?: CableRun[]; status?: 'dispatched' | 'returned'; remarks?: string | null },
): Promise<Allocation> {
  return request(`/api/fsm/jobs/${jobId}/allocations/${allocationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

/** Admin-only: dispatch a new material/cable allocation from the phone. */
export function createAllocation(
  staffId: number,
  jobId: number,
  body: {
    productId?: number; description?: string; category?: string; unit?: string;
    qtyAllocated: number; isReturnable?: boolean; isCable?: boolean; boxSizeFt?: number; remarks?: string;
  },
): Promise<Allocation> {
  return request(`/api/fsm/jobs/${jobId}/allocations`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

/* ───────────── Admin (tenant-token) endpoints ───────────── */

export function isAdminRole(role: string | undefined | null): boolean {
  return /^(admin|manager|owner)$/i.test((role ?? '').trim());
}

/** Roles allowed to edit a work order from the app (server enforces the same). */
export function canEditWorkOrders(role: string | undefined | null): boolean {
  return /^(admin|manager|owner|supervisor)$/i.test((role ?? '').trim());
}

export interface ProductLite {
  id: number;
  name: string;
  stockCount: number | null;
  category?: string | null;
}

/** Admin: product search for allocations (uses the general tenant API). */
export async function searchProducts(query: string): Promise<ProductLite[]> {
  const all = await request<ProductLite[]>(`/api/products`);
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 25);
  return all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 25);
}

export interface CustomerLite {
  id: number;
  name: string;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  directions?: string | null;
}

/** Search saved customers by name (server-side LIKE search). */
export function searchCustomers(query: string): Promise<CustomerLite[]> {
  const q = query.trim();
  return request<CustomerLite[]>(`/api/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`);
}

/** Create a customer from the phone (so a new work order can be linked). */
export function createCustomer(body: {
  name: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  directions?: string;
}): Promise<CustomerLite> {
  return request(`/api/customers`, { method: 'POST', body: JSON.stringify(body) });
}

/** Admin: create a work order (same endpoint the office uses; the x-staff-id
 * header is verified server-side to hold an admin/manager role). */
export function createWorkOrder(staffId: number, body: {
  customerId?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  itemDescription: string;
  problemDescription: string;
  serviceType?: string;
  serviceChannel?: string;
  priority?: string;
  assignedStaffIds?: number[];
  appointmentDate?: string;
  notes?: string;
}): Promise<{ id: number; workOrderNumber: string }> {
  return request(`/api/work-orders`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

/** Admin/manager/supervisor: edit a work order's details. Newly-assigned
 * technicians and a newly-linked customer are emailed by the server. */
export function updateWorkOrder(staffId: number, id: number, body: {
  customerId?: number | null;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string | null;
  itemDescription?: string;
  problemDescription?: string;
  serviceChannel?: string;
  priority?: string;
  assignedStaffIds?: number[];
  appointmentDate?: string | null;
  estimatedMinutes?: number | null;
  notes?: string | null;
}): Promise<{ id: number }> {
  return request(`/api/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

/** Admin: move a job's status (server verifies the staff role). */
export function updateWorkOrderStatus(staffId: number, id: number, status: string, statusNote?: string): Promise<unknown> {
  return request(`/api/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(statusNote ? { statusNote } : {}) }),
    headers: staffHeaders(staffId),
  });
}

export interface StaffLite { id: number; name: string; role: string }
export function listStaff(): Promise<StaffLite[]> {
  return request(`/api/staff`);
}

export function patchInstallDetails(
  staffId: number,
  id: number,
  body: { serviceAreas?: string[]; installDetails?: InstallDetailsMap },
): Promise<{ serviceAreas: string[]; installDetails: InstallDetailsMap }> {
  return request(`/api/fsm/jobs/${id}/install-details`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

export function startTravel(staffId: number, id: number): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/start-travel`, { method: 'POST', headers: staffHeaders(staffId) });
}

export function arriveOnSite(staffId: number, id: number): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/arrive`, { method: 'POST', headers: staffHeaders(staffId) });
}

export function pauseJob(staffId: number, id: number, reason: string): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/pause`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
    headers: staffHeaders(staffId),
  });
}

export function resumeJob(staffId: number, id: number): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/resume`, { method: 'POST', headers: staffHeaders(staffId) });
}

/** Complete work. Without a customer sign-off, non-management technicians
 * must supply a 6-digit manager code (obtained by calling the office). */
export function completeJob(staffId: number, id: number, managerCode?: string): Promise<FsmJob> {
  return request<FsmJob>(`/api/fsm/jobs/${id}/complete`, {
    method: 'POST',
    headers: staffHeaders(staffId),
    body: JSON.stringify(managerCode ? { managerCode } : {}),
  });
}

/** Admin: generate the one-time manager completion code to read out to the
 * technician over the phone. */
export function generateManagerCode(
  staffId: number,
  id: number,
): Promise<{ code: string; expiresMinutes: number }> {
  return request(`/api/work-orders/${id}/manager-code`, { method: 'POST', headers: staffHeaders(staffId) });
}

/** Admin: reopen a completed job — clears completion (and any sign-off) and
 * moves it back to In Progress. */
export function markJobIncomplete(staffId: number, id: number): Promise<unknown> {
  return request(`/api/work-orders/${id}/mark-incomplete`, { method: 'POST', headers: staffHeaders(staffId) });
}

/* ───────────── Completion verification by email code ───────────── */

export function sendCompletionOtp(
  staffId: number,
  id: number,
): Promise<{ ok: boolean; sentTo: string; expiresMinutes: number }> {
  return request(`/api/fsm/jobs/${id}/send-completion-otp`, { method: 'POST', headers: staffHeaders(staffId) });
}

export function verifyCompletionOtp(
  staffId: number,
  id: number,
  body: { code: string; verifiedBy: string },
): Promise<{ ok: boolean; completionSignedBy: string; completionSignedAt: string }> {
  return request(`/api/fsm/jobs/${id}/verify-completion-otp`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

export function addJobPhoto(staffId: number, id: number, image: string, caption?: string): Promise<FsmPhoto> {
  return request<FsmPhoto>(`/api/fsm/jobs/${id}/photos`, {
    method: 'POST',
    body: JSON.stringify({ image, caption }),
    headers: staffHeaders(staffId),
  });
}

export function deleteJobPhoto(staffId: number, id: number, photoId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/fsm/jobs/${id}/photos/${photoId}`, {
    method: 'DELETE',
    headers: staffHeaders(staffId),
  });
}

export function submitSignature(staffId: number, id: number, image: string, signedBy: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/fsm/jobs/${id}/signature`, {
    method: 'POST',
    body: JSON.stringify({ image, signedBy }),
    headers: staffHeaders(staffId),
  });
}

export function addJobNote(staffId: number, id: number, content: string): Promise<FsmJobNote> {
  return request<FsmJobNote>(`/api/fsm/jobs/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
    headers: staffHeaders(staffId),
  });
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

/* ── Follow-up visits & calendar ────────────────────────────────────────────── */

export interface CalendarAppointment {
  id: number;
  workOrderId: number;
  appointmentType: string;
  startTime: string;
  endTime: string | null;
  status: string;
  notes: string | null;
  staffId: number | null;
  staffIds: number[] | null;
  workOrderNumber: string;
  woStatus: string;
  itemDescription: string;
  customerName: string | null;
  priority: string | null;
  assignedStaffIds: number[] | null;
}

/** Calendar feed: appointments (incl. legacy single dates) in a range.
 * Office roles see all; technicians only get their own visits (enforced
 * server-side via the x-staff-id header). */
export function getCalendarAppointments(staffId: number, startIso: string, endIso: string): Promise<CalendarAppointment[]> {
  return request(`/api/work-order-appointments?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`, {
    headers: staffHeaders(staffId),
  });
}

/** Admin/manager/supervisor: schedule a follow-up visit on an open work
 * order. The server emails the technician(s) and the customer. */
export function createFollowUpVisit(
  staffId: number,
  workOrderId: number,
  body: { startTime: string; endTime?: string; notes?: string; staffIds?: number[] },
): Promise<{ id: number }> {
  return request(`/api/work-orders/${workOrderId}/follow-up`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

/* ───────────── Cash shift & onsite payments ───────────── */

export interface CashSession {
  id: number;
  staffId: number | null;
  staffName: string;
  openingCash: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export interface CurrentShift {
  session: CashSession;
  expectedCash: number;
  totalPayouts: number;
  woCashIn: number;
  woCardIn: number;
  woTransferIn: number;
}

/** The technician's own open cash shift, or null when none is open. */
export async function getCurrentShift(staffId: number): Promise<CurrentShift | null> {
  try {
    return await request<CurrentShift>('/api/cash/sessions/current', { headers: staffHeaders(staffId) });
  } catch (e) {
    if (e instanceof Error && /404|not found|no open/i.test(e.message)) return null;
    throw e;
  }
}

export function openShift(staffId: number, staffName: string, openingCash: number): Promise<CashSession> {
  return request('/api/cash/sessions', {
    method: 'POST',
    body: JSON.stringify({ staffId, staffName, openingCash }),
    headers: staffHeaders(staffId),
  });
}

export function closeShift(
  staffId: number,
  sessionId: number,
  body: { actualCash: number; actualCard: number; actualOther?: number; closingNotes?: string },
): Promise<CashSession> {
  return request(`/api/cash/sessions/${sessionId}/close`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

export function addShiftPayout(
  staffId: number,
  sessionId: number,
  body: { amount: number; reason: string; staffName: string },
): Promise<{ id: number }> {
  return request(`/api/cash/sessions/${sessionId}/payouts`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}

export type WoPaymentMethod = 'cash' | 'card' | 'transfer';

export interface WoPayment {
  id: number;
  amount: number;
  method: WoPaymentMethod;
  reference: string | null;
  staffName: string | null;
  createdAt: string;
}

export function getWoPayments(staffId: number, workOrderId: number): Promise<WoPayment[]> {
  return request(`/api/work-orders/${workOrderId}/payments`, { headers: staffHeaders(staffId) });
}

/** Record money collected onsite. Requires the technician's cash shift to be
 * open (server rejects with code SHIFT_REQUIRED otherwise). */
export function recordWoPayment(
  staffId: number,
  workOrderId: number,
  body: { amount: number; method: WoPaymentMethod; reference?: string },
): Promise<{ payment: WoPayment; newBalance: number }> {
  return request(`/api/work-orders/${workOrderId}/payments`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: staffHeaders(staffId),
  });
}
