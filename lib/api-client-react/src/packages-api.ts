import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PackageStatus = "received" | "collected" | "cancelled";

export type StorePackage = {
  id: number;
  tenantId: number;
  trackingNumber: string;
  awb: string | null;
  purchaseTrackingNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  courier: string | null;
  weight: number | null;
  weightUnit: string | null;
  shelfLocation: string | null;
  fee: number;
  notes: string | null;
  status: PackageStatus;
  receivedAt: string;
  receivedByStaffId: number | null;
  receivedByStaffName: string | null;
  collectedAt: string | null;
  collectedByStaffId: number | null;
  collectedByStaffName: string | null;
  collectedOrderId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ReceivePackageInput = {
  trackingNumber: string;
  awb?: string;
  purchaseTrackingNumber?: string;
  customerName?: string;
  customerPhone?: string;
  courier?: string;
  weight?: number;
  weightUnit?: "lb" | "kg";
  shelfLocation?: string;
  fee: number;
  notes?: string;
  staffId?: number;
  staffName?: string;
};

export type UpdatePackageInput = Partial<ReceivePackageInput>;

export type CollectPackageInput = {
  orderId?: number;
  staffId?: number;
  staffName?: string;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const PACKAGES_KEY = "packages";

export function useListPackages(filters?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return useQuery<StorePackage[]>({
    queryKey: [PACKAGES_KEY, filters?.status ?? "all", filters?.search ?? ""],
    queryFn: () => customFetch<StorePackage[]>(`/api/packages${qs ? `?${qs}` : ""}`),
  });
}

export function lookupPackage(tracking: string): Promise<StorePackage> {
  return customFetch<StorePackage>(`/api/packages/lookup/${encodeURIComponent(tracking)}`);
}

export function collectPackage(id: number, data: CollectPackageInput): Promise<StorePackage> {
  return customFetch<StorePackage>(`/api/packages/${id}/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function useReceivePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReceivePackageInput) =>
      customFetch<StorePackage>("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGES_KEY] }),
  });
}

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdatePackageInput & { id: number }) =>
      customFetch<StorePackage>(`/api/packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGES_KEY] }),
  });
}

export function useCancelPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      customFetch<StorePackage>(`/api/packages/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGES_KEY] }),
  });
}
