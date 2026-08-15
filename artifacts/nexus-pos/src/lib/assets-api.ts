import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { TENANT_TOKEN_KEY } from "./saas-api";

/**
 * Client for the Fixed Assets + Technician Teams API.
 *
 * These endpoints are outside the OpenAPI codegen (regenerating rewrites every
 * generated file), so this module hand-rolls the same contract: tenant bearer
 * token, `x-staff-id` actor header, JSON errors surfaced as Error.message.
 */

const STAFF_SESSION_KEY = "nexus_staff_session";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
    const staff = raw ? (JSON.parse(raw) as { id?: number }) : null;
    if (staff?.id) headers["x-staff-id"] = String(staff.id);
  } catch {
    /* no signed-in staff member — the server just records no actor */
  }
  return headers;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers, ...rest } = options ?? {};
  const resp = await fetch(`/api${path}`, { headers: { ...authHeaders(), ...headers }, ...rest });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || resp.statusText);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/* ─── Types ─── */

export type AssetCondition = "good" | "fair" | "needs_repair" | "out_of_service";
export type AssetStatus = "in_store" | "assigned" | "in_repair" | "retired" | "lost";
export type ServiceState = "none" | "ok" | "due_soon" | "overdue";

export interface AssetDepreciation {
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  monthsElapsed: number;
  monthsRemaining: number;
  fullyDepreciatedOn: string | null;
}

export interface AssetCurrentAssignment {
  id: number;
  assigneeType: "staff" | "team";
  staffId: number | null;
  staffName: string | null;
  teamId: number | null;
  teamName: string | null;
  workOrderId: number | null;
  workOrderNumber: string | null;
  assignedAt: string;
  expectedReturnDate: string | null;
  notes: string | null;
}

export interface FixedAsset {
  id: number;
  tenantId: number;
  assetTag: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  isTool: boolean;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  photoUrl: string | null;
  purchaseDate: string | null;
  purchaseCost: number;
  vendorId: number | null;
  vendorName: string | null;
  warrantyExpiry: string | null;
  depreciationMethod: "straight_line" | "none";
  usefulLifeMonths: number | null;
  salvageValue: number;
  depreciationStartDate: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  locationId: number | null;
  locationName: string | null;
  serviceIntervalDays: number | null;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  currentAssignmentId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  depreciation: AssetDepreciation;
  serviceState: ServiceState;
  currentAssignment: AssetCurrentAssignment | null;
}

export interface AssetAssignmentRecord extends AssetCurrentAssignment {
  assignedByStaffId: number | null;
  assignedByName: string | null;
  conditionOut: string | null;
  status: "active" | "returned";
  returnedAt: string | null;
  returnedToStaffId: number | null;
  returnedToName: string | null;
  conditionIn: string | null;
  returnNotes: string | null;
}

export interface AssetServiceRecord {
  id: number;
  assetId: number;
  serviceType: "service" | "calibration" | "repair" | "inspection";
  performedAt: string;
  performedBy: string | null;
  cost: number;
  notes: string | null;
  nextDueDate: string | null;
  createdAt: string;
}

export interface FixedAssetDetail extends FixedAsset {
  assignments: AssetAssignmentRecord[];
  serviceRecords: AssetServiceRecord[];
}

export interface AssetSummary {
  total: number;
  tools: number;
  assigned: number;
  retired: number;
  needsRepair: number;
  dueForService: number;
  totalCost: number;
  totalBookValue: number;
  accumulatedDepreciation: number;
}

export interface AssetFilters {
  search?: string;
  category?: string;
  status?: string;
  condition?: string;
  isTool?: boolean;
  staffId?: number;
  teamId?: number;
  dueWithinDays?: number;
  includeRetired?: boolean;
}

export interface AssetInput {
  assetTag?: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  isTool?: boolean;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  photoUrl?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number;
  vendorId?: number | null;
  vendorName?: string | null;
  warrantyExpiry?: string | null;
  depreciationMethod?: "straight_line" | "none";
  usefulLifeMonths?: number | null;
  salvageValue?: number;
  depreciationStartDate?: string | null;
  condition?: AssetCondition;
  status?: AssetStatus;
  locationId?: number | null;
  locationName?: string | null;
  serviceIntervalDays?: number | null;
  lastServiceDate?: string | null;
  nextServiceDue?: string | null;
  notes?: string | null;
}

export interface TeamMember {
  staffId: number;
  name: string;
  role: string;
  isTechnician: boolean;
  isActive: boolean;
}

export interface TechnicianTeam {
  id: number;
  name: string;
  description: string | null;
  leaderStaffId: number | null;
  leaderName: string | null;
  colour: string | null;
  isActive: boolean;
  members: TeamMember[];
  memberCount: number;
  openJobCount: number;
  toolCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamInput {
  name: string;
  description?: string | null;
  leaderStaffId?: number | null;
  colour?: string | null;
  isActive?: boolean;
  memberStaffIds?: number[];
}

/* ─── Query keys ─── */

export const assetKeys = {
  all: ["assets"] as const,
  list: (f: AssetFilters) => ["assets", "list", f] as const,
  detail: (id: number) => ["assets", "detail", id] as const,
  summary: () => ["assets", "summary"] as const,
  categories: () => ["assets", "categories"] as const,
};

export const teamKeys = {
  all: ["teams"] as const,
  list: (includeInactive: boolean) => ["teams", "list", includeInactive] as const,
  detail: (id: number) => ["teams", "detail", id] as const,
};

function toQuery(f: AssetFilters): string {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.category) p.set("category", f.category);
  if (f.status) p.set("status", f.status);
  if (f.condition) p.set("condition", f.condition);
  if (f.isTool !== undefined) p.set("isTool", String(f.isTool));
  if (f.staffId) p.set("staffId", String(f.staffId));
  if (f.teamId) p.set("teamId", String(f.teamId));
  if (f.dueWithinDays !== undefined) p.set("dueWithinDays", String(f.dueWithinDays));
  if (f.includeRetired) p.set("includeRetired", "true");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ─── Assets ─── */

export const listAssets = (f: AssetFilters = {}) => api<FixedAsset[]>(`/assets${toQuery(f)}`);
export const getAsset = (id: number) => api<FixedAssetDetail>(`/assets/${id}`);
export const getAssetSummary = () => api<AssetSummary>("/assets/summary");
export const getAssetCategories = () => api<string[]>("/assets/categories");
export const lookupAsset = (code: string) => api<FixedAsset>(`/assets/lookup?code=${encodeURIComponent(code)}`);

export function useAssets(filters: AssetFilters = {}, options?: Partial<UseQueryOptions<FixedAsset[], Error>>) {
  return useQuery<FixedAsset[], Error>({
    queryKey: assetKeys.list(filters),
    queryFn: () => listAssets(filters),
    ...options,
  });
}

export function useAsset(id: number | null, options?: Partial<UseQueryOptions<FixedAssetDetail, Error>>) {
  return useQuery<FixedAssetDetail, Error>({
    queryKey: assetKeys.detail(id ?? 0),
    queryFn: () => getAsset(id!),
    enabled: !!id,
    ...options,
  });
}

export function useAssetSummary(options?: Partial<UseQueryOptions<AssetSummary, Error>>) {
  return useQuery<AssetSummary, Error>({
    queryKey: assetKeys.summary(),
    queryFn: getAssetSummary,
    ...options,
  });
}

export function useAssetCategories() {
  return useQuery<string[], Error>({ queryKey: assetKeys.categories(), queryFn: getAssetCategories });
}

function useAssetInvalidation() {
  const qc = useQueryClient();
  return (id?: number) => {
    void qc.invalidateQueries({ queryKey: assetKeys.all });
    if (id) void qc.invalidateQueries({ queryKey: assetKeys.detail(id) });
    void qc.invalidateQueries({ queryKey: teamKeys.all });
  };
}

export function useCreateAsset() {
  const invalidate = useAssetInvalidation();
  return useMutation<FixedAsset, Error, AssetInput>({
    mutationFn: (body) => api<FixedAsset>("/assets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAsset() {
  const invalidate = useAssetInvalidation();
  return useMutation<FixedAsset, Error, { id: number; data: Partial<AssetInput> }>({
    mutationFn: ({ id, data }) => api<FixedAsset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_r, v) => invalidate(v.id),
  });
}

export function useDeleteAsset() {
  const invalidate = useAssetInvalidation();
  return useMutation<void, Error, number>({
    mutationFn: (id) => api<void>(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

export interface AssignAssetInput {
  assigneeType: "staff" | "team";
  staffId?: number;
  teamId?: number;
  expectedReturnDate?: string | null;
  conditionOut?: AssetCondition;
  notes?: string;
}

export function useAssignAsset() {
  const invalidate = useAssetInvalidation();
  return useMutation<FixedAsset, Error, { id: number; data: AssignAssetInput }>({
    mutationFn: ({ id, data }) => api<FixedAsset>(`/assets/${id}/assign`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_r, v) => invalidate(v.id),
  });
}

export function useReturnAsset() {
  const invalidate = useAssetInvalidation();
  return useMutation<FixedAsset, Error, { id: number; data: { conditionIn?: AssetCondition; returnNotes?: string } }>({
    mutationFn: ({ id, data }) => api<FixedAsset>(`/assets/${id}/return`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_r, v) => invalidate(v.id),
  });
}

export interface LogServiceInput {
  serviceType?: "service" | "calibration" | "repair" | "inspection";
  performedAt?: string | null;
  performedBy?: string;
  cost?: number;
  notes?: string;
  nextDueDate?: string | null;
  condition?: AssetCondition;
  returnToService?: boolean;
}

export function useLogAssetService() {
  const invalidate = useAssetInvalidation();
  return useMutation<AssetServiceRecord, Error, { id: number; data: LogServiceInput }>({
    mutationFn: ({ id, data }) => api<AssetServiceRecord>(`/assets/${id}/service`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_r, v) => invalidate(v.id),
  });
}

/* ─── Teams ─── */

export const listTeams = (includeInactive = false) =>
  api<TechnicianTeam[]>(`/teams${includeInactive ? "?includeInactive=true" : ""}`);

export function useTeams(includeInactive = false, options?: Partial<UseQueryOptions<TechnicianTeam[], Error>>) {
  return useQuery<TechnicianTeam[], Error>({
    queryKey: teamKeys.list(includeInactive),
    queryFn: () => listTeams(includeInactive),
    ...options,
  });
}

function useTeamInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: teamKeys.all });
    void qc.invalidateQueries({ queryKey: assetKeys.all });
  };
}

export function useCreateTeam() {
  const invalidate = useTeamInvalidation();
  return useMutation<TechnicianTeam, Error, TeamInput>({
    mutationFn: (body) => api<TechnicianTeam>("/teams", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useUpdateTeam() {
  const invalidate = useTeamInvalidation();
  return useMutation<TechnicianTeam, Error, { id: number; data: Partial<TeamInput> }>({
    mutationFn: ({ id, data }) => api<TechnicianTeam>(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  });
}

export function useAddTeamMembers() {
  const invalidate = useTeamInvalidation();
  return useMutation<TechnicianTeam, Error, { id: number; staffIds: number[] }>({
    mutationFn: ({ id, staffIds }) => api<TechnicianTeam>(`/teams/${id}/members`, { method: "POST", body: JSON.stringify({ staffIds }) }),
    onSuccess: invalidate,
  });
}

export function useRemoveTeamMember() {
  const invalidate = useTeamInvalidation();
  return useMutation<TechnicianTeam, Error, { id: number; staffId: number }>({
    mutationFn: ({ id, staffId }) => api<TechnicianTeam>(`/teams/${id}/members/${staffId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useDeleteTeam() {
  const invalidate = useTeamInvalidation();
  return useMutation<{ deactivated?: boolean; reason?: string } | void, Error, number>({
    mutationFn: (id) => api<{ deactivated?: boolean; reason?: string } | void>(`/teams/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
