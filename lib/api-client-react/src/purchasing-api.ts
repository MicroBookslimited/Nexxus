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
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VendorWithPurchases = Vendor & {
  recentPurchases: Array<{
    id: number;
    purchaseNumber: string;
    status: string;
    purchaseDate: string;
    totalCost: number;
  }>;
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
  purchaseDate: string;
  invoiceRef: string | null;
  notes: string | null;
  totalCost: number;
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
  invoiceRef?: string;
  notes?: string;
  items: CreatePurchaseItemInput[];
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
      // Refresh ingredient stock levels
      qc.invalidateQueries({ queryKey: ["/api/ingredients"] });
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
