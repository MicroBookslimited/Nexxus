import { useQuery, useMutation, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UnitOfMeasurement = {
  id: number;
  tenantId: number;
  name: string;
  symbol: string;
  baseUnit: "pcs" | "g" | "ml";
  conversionFactor: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
};

export type Vendor = {
  id: number;
  tenantId: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: number | null;
  creditLimit: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentBalance?: number;
};

export type VendorWithPurchases = Vendor & {
  recentPurchases: Array<{
    id: number;
    purchaseNumber: string;
    status: string;
    paymentType: string;
    purchaseDate: string;
    totalCost: number;
    currency: string;
  }>;
  currentBalance: number;
  totalOwed: number;
  totalPaid: number;
};

export type RawMaterialPurchaseItem = {
  id: number;
  purchaseId: number;
  ingredientId: number;
  ingredientName: string;
  ingredientUnit: string;
  purchaseUnit: string;
  purchaseQty: number;
  conversionFactor: number;
  baseUnit: string;
  baseQty: number;
  unitCost: number;
  totalCost: number;
};

export type RawMaterialPurchase = {
  id: number;
  tenantId: number;
  purchaseNumber: string;
  vendorId: number | null;
  vendorName: string | null;
  status: "draft" | "confirmed";
  paymentType: "cash" | "credit";
  currency: string;
  exchangeRate: number;
  purchaseDate: string;
  dueDate: string | null;
  invoiceRef: string | null;
  notes: string | null;
  totalCost: number;
  totalCostJmd: number;
  createdAt: string;
  updatedAt: string;
  items: RawMaterialPurchaseItem[];
};

export type CreatePurchaseItemInput = {
  ingredientId: number;
  purchaseUnit: string;
  purchaseQty: number;
  conversionFactor: number;
  baseUnit: "pcs" | "g" | "ml";
  unitCost: number;
};

export type CreatePurchaseInput = {
  vendorId?: number;
  purchaseDate?: string;
  dueDate?: string;
  invoiceRef?: string;
  notes?: string;
  paymentType?: "cash" | "credit";
  currency?: string;
  exchangeRate?: number;
  items: CreatePurchaseItemInput[];
};

// ─── AP Types ─────────────────────────────────────────────────────────────────

export type ApPayment = {
  id: number;
  tenantId: number;
  apEntryId: number;
  vendorId: number | null;
  vendorName?: string | null;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

export type ApEntry = {
  id: number;
  tenantId: number;
  vendorId: number | null;
  vendorName: string | null;
  purchaseId: number | null;
  entryDate: string;
  dueDate: string | null;
  invoiceRef: string | null;
  currency: string;
  exchangeRate: number;
  amountTotal: number;
  amountPaid: number;
  amountBalance: number;
  status: "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payments: ApPayment[];
  daysPastDue: number | null;
};

export type ApCredit = {
  id: number;
  vendorId: number | null;
  vendorName: string | null;
  amount: number;
  usedAmount: number;
  availableAmount: number;
  reason: string | null;
  createdAt: string;
};

export type ApSummary = {
  totalPayable: number;
  totalOverdue: number;
  totalPaid30d: number;
  pendingCount: number;
  overdueCount: number;
  dueSoonCount: number;
  dueSoonAmount: number;
  availableCredits: number;
};

export type ApAgingBuckets = {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  over90: number;
};

export type ApAgingVendorRow = ApAgingBuckets & {
  vendorId: number | null;
  vendorName: string | null;
  total: number;
};

export type ApAgingReport = {
  buckets: ApAgingBuckets;
  vendors: ApAgingVendorRow[];
};

export type ApSupplierLedger = {
  vendor: Vendor;
  entries: ApEntry[];
  payments: ApPayment[];
  credits: ApCredit[];
  summary: {
    totalPurchased: number;
    totalPaid: number;
    totalBalance: number;
    totalCredits: number;
  };
};

// ─── Units hooks ─────────────────────────────────────────────────────────────

export const UNITS_KEY = "/api/units-of-measurement";

export function useListUnits(options?: UseQueryOptions<UnitOfMeasurement[]>) {
  return useQuery<UnitOfMeasurement[]>({
    queryKey: [UNITS_KEY],
    queryFn: () => customFetch<UnitOfMeasurement[]>("/api/units-of-measurement"),
    ...options,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<UnitOfMeasurement, "id" | "tenantId" | "isSystem" | "isActive" | "createdAt">) =>
      customFetch<UnitOfMeasurement>("/api/units-of-measurement", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [UNITS_KEY] }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/units-of-measurement/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [UNITS_KEY] }),
  });
}

// ─── Vendor hooks ─────────────────────────────────────────────────────────────

export const VENDORS_KEY = "/api/vendors";

export function useListVendors(options?: UseQueryOptions<Vendor[]>) {
  return useQuery<Vendor[]>({
    queryKey: [VENDORS_KEY],
    queryFn: () => customFetch<Vendor[]>("/api/vendors"),
    ...options,
  });
}

export function useGetVendor(id: number, options?: UseQueryOptions<VendorWithPurchases>) {
  return useQuery<VendorWithPurchases>({
    queryKey: [VENDORS_KEY, id],
    queryFn: () => customFetch<VendorWithPurchases>(`/api/vendors/${id}`),
    enabled: id > 0,
    ...options,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Vendor>) =>
      customFetch<Vendor>("/api/vendors", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VENDORS_KEY] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Vendor> }) =>
      customFetch<Vendor>(`/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VENDORS_KEY] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/vendors/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VENDORS_KEY] }),
  });
}

// ─── Raw Material Purchase hooks ──────────────────────────────────────────────

export const PURCHASES_KEY = "/api/raw-material-purchases";

export function useListRawMaterialPurchases(options?: UseQueryOptions<RawMaterialPurchase[]>) {
  return useQuery<RawMaterialPurchase[]>({
    queryKey: [PURCHASES_KEY],
    queryFn: () => customFetch<RawMaterialPurchase[]>("/api/raw-material-purchases"),
    ...options,
  });
}

export function useGetRawMaterialPurchase(id: number, options?: UseQueryOptions<RawMaterialPurchase>) {
  return useQuery<RawMaterialPurchase>({
    queryKey: [PURCHASES_KEY, id],
    queryFn: () => customFetch<RawMaterialPurchase>(`/api/raw-material-purchases/${id}`),
    enabled: id > 0,
    ...options,
  });
}

export function useCreateRawMaterialPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseInput) =>
      customFetch<RawMaterialPurchase>("/api/raw-material-purchases", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PURCHASES_KEY] }),
  });
}

export function useConfirmRawMaterialPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<RawMaterialPurchase>(`/api/raw-material-purchases/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PURCHASES_KEY] });
      qc.invalidateQueries({ queryKey: ["/api/ingredients"] });
      qc.invalidateQueries({ queryKey: [AP_ENTRIES_KEY] });
      qc.invalidateQueries({ queryKey: [AP_SUMMARY_KEY] });
    },
  });
}

export function useDeleteRawMaterialPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/raw-material-purchases/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PURCHASES_KEY] }),
  });
}

// ─── Accounts Payable hooks ───────────────────────────────────────────────────

export const AP_ENTRIES_KEY = "/api/ap/entries";
export const AP_SUMMARY_KEY = "/api/ap/summary";
export const AP_PAYMENTS_KEY = "/api/ap/payments";
export const AP_AGING_KEY = "/api/ap/reports/aging";

export function useApSummary(options?: UseQueryOptions<ApSummary>) {
  return useQuery<ApSummary>({
    queryKey: [AP_SUMMARY_KEY],
    queryFn: () => customFetch<ApSummary>("/api/ap/summary"),
    refetchInterval: 60_000,
    ...options,
  });
}

export function useListApEntries(params?: { status?: string; vendorId?: number }, options?: UseQueryOptions<ApEntry[]>) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.vendorId) qs.set("vendorId", String(params.vendorId));
  const url = `/api/ap/entries${qs.toString() ? "?" + qs : ""}`;
  return useQuery<ApEntry[]>({
    queryKey: [AP_ENTRIES_KEY, params],
    queryFn: () => customFetch<ApEntry[]>(url),
    ...options,
  });
}

export function useGetApEntry(id: number, options?: UseQueryOptions<ApEntry>) {
  return useQuery<ApEntry>({
    queryKey: [AP_ENTRIES_KEY, id],
    queryFn: () => customFetch<ApEntry>(`/api/ap/entries/${id}`),
    enabled: id > 0,
    ...options,
  });
}

export function useCreateApEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { vendorId?: number; dueDate?: string; invoiceRef?: string; currency?: string; exchangeRate?: number; amountTotal: number; notes?: string }) =>
      customFetch<ApEntry>("/api/ap/entries", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [AP_ENTRIES_KEY] });
      qc.invalidateQueries({ queryKey: [AP_SUMMARY_KEY] });
    },
  });
}

export function useCancelApEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<ApEntry>(`/api/ap/entries/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [AP_ENTRIES_KEY] });
      qc.invalidateQueries({ queryKey: [AP_SUMMARY_KEY] });
    },
  });
}

export function useRecordApPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { apEntryId: number; paymentDate?: string; amount: number; paymentMethod?: string; reference?: string; notes?: string }) =>
      customFetch<ApEntry>("/api/ap/payments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [AP_ENTRIES_KEY] });
      qc.invalidateQueries({ queryKey: [AP_SUMMARY_KEY] });
      qc.invalidateQueries({ queryKey: [AP_PAYMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [VENDORS_KEY] });
    },
  });
}

export function useListApPayments(options?: UseQueryOptions<ApPayment[]>) {
  return useQuery<ApPayment[]>({
    queryKey: [AP_PAYMENTS_KEY],
    queryFn: () => customFetch<ApPayment[]>("/api/ap/payments"),
    ...options,
  });
}

export function useApAgingReport(options?: UseQueryOptions<ApAgingReport>) {
  return useQuery<ApAgingReport>({
    queryKey: [AP_AGING_KEY],
    queryFn: () => customFetch<ApAgingReport>("/api/ap/reports/aging"),
    ...options,
  });
}

export function useApSupplierLedger(vendorId: number, options?: UseQueryOptions<ApSupplierLedger>) {
  return useQuery<ApSupplierLedger>({
    queryKey: ["/api/ap/reports/supplier-ledger", vendorId],
    queryFn: () => customFetch<ApSupplierLedger>(`/api/ap/reports/supplier-ledger/${vendorId}`),
    enabled: vendorId > 0,
    ...options,
  });
}

export function useApCredits(options?: UseQueryOptions<ApCredit[]>) {
  return useQuery<ApCredit[]>({
    queryKey: ["/api/ap/credits"],
    queryFn: () => customFetch<ApCredit[]>("/api/ap/credits"),
    ...options,
  });
}
