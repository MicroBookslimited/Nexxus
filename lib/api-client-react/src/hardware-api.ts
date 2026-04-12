import { useQuery, useMutation, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeviceType =
  | "printer" | "barcode_scanner" | "cash_drawer" | "card_reader"
  | "customer_display" | "label_printer" | "tablet" | "kds" | "other";

export type DriverPlatform = "windows" | "macos" | "linux" | "android" | "ios" | "all";

export type HardwareDevice = {
  id: number;
  tenantId: number;
  deviceType: DeviceType;
  make: string;
  model: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  condition: string;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverLink = {
  id: number;
  deviceType: DeviceType;
  make: string;
  model: string | null;
  driverName: string;
  downloadUrl: string;
  version: string | null;
  platform: DriverPlatform;
  fileSize: string | null;
  releaseDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateHardwareDeviceInput = {
  deviceType: DeviceType;
  make: string;
  model: string;
  serialNumber?: string;
  purchaseDate?: string;
  condition?: string;
  location?: string;
  notes?: string;
};

export type CreateDriverLinkInput = {
  deviceType: DeviceType;
  make: string;
  model?: string;
  driverName: string;
  downloadUrl: string;
  version?: string;
  platform: DriverPlatform;
  fileSize?: string;
  releaseDate?: string;
  notes?: string;
  isActive?: boolean;
};

// ─── Hardware Device hooks ────────────────────────────────────────────────────

export const HARDWARE_DEVICES_KEY = "/api/hardware/devices";

export function useListHardwareDevices(options?: UseQueryOptions<HardwareDevice[]>) {
  return useQuery<HardwareDevice[]>({
    queryKey: [HARDWARE_DEVICES_KEY],
    queryFn: () => customFetch<HardwareDevice[]>("/api/hardware/devices"),
    ...options,
  });
}

export function useCreateHardwareDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHardwareDeviceInput) =>
      customFetch<HardwareDevice>("/api/hardware/devices", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [HARDWARE_DEVICES_KEY] }),
  });
}

export function useUpdateHardwareDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateHardwareDeviceInput> }) =>
      customFetch<HardwareDevice>(`/api/hardware/devices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [HARDWARE_DEVICES_KEY] }),
  });
}

export function useDeleteHardwareDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/hardware/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [HARDWARE_DEVICES_KEY] }),
  });
}

// ─── Driver Link hooks ────────────────────────────────────────────────────────

export const DRIVER_LINKS_KEY = "/api/hardware/drivers";

export function useListDriverLinks(params?: { make?: string; model?: string; deviceType?: string; platform?: string }, options?: UseQueryOptions<DriverLink[]>) {
  const qs = new URLSearchParams();
  if (params?.make) qs.set("make", params.make);
  if (params?.model) qs.set("model", params.model);
  if (params?.deviceType) qs.set("deviceType", params.deviceType);
  if (params?.platform) qs.set("platform", params.platform);
  const url = `/api/hardware/drivers${qs.toString() ? "?" + qs : ""}`;
  return useQuery<DriverLink[]>({
    queryKey: [DRIVER_LINKS_KEY, params],
    queryFn: () => customFetch<DriverLink[]>(url),
    ...options,
  });
}

export function useCreateDriverLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDriverLinkInput) =>
      customFetch<DriverLink>("/api/hardware/drivers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DRIVER_LINKS_KEY] }),
  });
}

export function useUpdateDriverLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateDriverLinkInput> }) =>
      customFetch<DriverLink>(`/api/hardware/drivers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DRIVER_LINKS_KEY] }),
  });
}

export function useDeleteDriverLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/hardware/drivers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DRIVER_LINKS_KEY] }),
  });
}
