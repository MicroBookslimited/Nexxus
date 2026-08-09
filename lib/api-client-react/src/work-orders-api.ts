import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkOrderItem = {
  type: "part" | "labor" | "fee";
  productId?: number;
  description: string;
  price: number;
  quantity: number;
  isTaxable?: boolean;
  costPrice?: number;
};

export type WorkOrderStatus =
  | "received"
  | "in_progress"
  | "awaiting_parts"
  | "on_hold"
  | "ready"
  | "collected"
  | "cancelled";

export type WorkOrder = {
  id: number;
  tenantId: number;
  workOrderNumber: string;
  customerId: number | null;
  customerName?: string;
  customerPhone?: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  itemDescription: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  imei: string | null;
  assetTag: string | null;
  colour: string | null;
  conditionReceived: string | null;
  accessoriesReceived: string | null;
  problemDescription: string;
  diagnosis: string | null;
  serviceType: string | null;
  serviceChannel: string;
  priority: string;
  assignedStaffId: number | null;
  assignedStaffIds: number[];
  assignedStaffName?: string;
  assignedStaffNames?: string[];
  assignmentStatus?: "pending" | "accepted" | "declined";
  assignmentRespondedAt?: string | null;
  declineReason?: string | null;
  promisedDate: string | null;
  appointmentDate: string | null;
  storageLocation: string | null;
  depositRequired: number | null;
  depositPaid: number;
  items: WorkOrderItem[];
  subtotal: number;
  discountType: string | null;
  discountAmount: number | null;
  tax: number;
  total: number;
  status: WorkOrderStatus;
  notes: string | null;
  internalNotes: string | null;
  convertedOrderId: number | null;
  customerSignature?: string | null;
  staffSignature?: string | null;
  completionSignature?: string | null;
  completionSignedBy?: string | null;
  completionSignedAt?: string | null;
  portalToken?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderNote = {
  id: number;
  tenantId: number;
  workOrderId: number;
  authorStaffId: number | null;
  authorName: string | null;
  content: string;
  isInternal: boolean;
  createdAt: string;
};

export type WorkOrderStatusHistoryEntry = {
  id: number;
  tenantId: number;
  workOrderId: number;
  fromStatus: string | null;
  toStatus: string;
  changedByStaffId: number | null;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
};

export type WorkOrderAppointment = {
  id: number;
  tenantId: number;
  workOrderId: number;
  staffId: number | null;
  appointmentType: string;
  startTime: string;
  endTime: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderStats = {
  byStatus: Record<string, number>;
  activeCount: number;
  revenueThisMonth: number;
};

export type WorkOrderCalendarEntry = {
  id: number;
  workOrderId: number;
  workOrderNumber: string;
  appointmentType: string;
  startTime: string;
  endTime: string | null;
  status: string;
  notes: string | null;
  staffId: number | null;
  woStatus: string;
  itemDescription: string;
  customerName: string | null;
  priority: string;
};

export type WorkOrderReports = {
  monthly: Array<{ month: string; monthSort: string; revenue: number; count: number }>;
  byServiceType: Array<{ serviceType: string | null; count: number }>;
  totalCompleted: number;
  avgJobValue: number;
  totalRevenue: number;
};

export type PublicWorkOrder = {
  workOrderNumber: string;
  status: string;
  itemDescription: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  problemDescription: string;
  promisedDate: string | null;
  total: number;
  depositPaid: number;
  createdAt: string;
  updatedAt: string;
  notes: Array<{ content: string; createdAt: string }>;
};

export type CreateWorkOrderInput = {
  customerId?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  itemDescription: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  imei?: string;
  assetTag?: string;
  colour?: string;
  conditionReceived?: string;
  accessoriesReceived?: string;
  problemDescription: string;
  serviceType?: string;
  serviceChannel?: string;
  priority?: string;
  assignedStaffId?: number;
  assignedStaffIds?: number[];
  promisedDate?: string;
  appointmentDate?: string;
  storageLocation?: string;
  depositRequired?: number;
  items?: WorkOrderItem[];
  discountType?: "percent" | "fixed";
  discountAmount?: number;
  notes?: string;
  internalNotes?: string;
};

export type UpdateWorkOrderInput = Partial<Omit<CreateWorkOrderInput, never>> & {
  status?: WorkOrderStatus;
  diagnosis?: string;
  depositPaid?: number;
  convertedOrderId?: number;
  statusNote?: string;
  customerSignature?: string;
  staffSignature?: string;
};

// ─── Query Keys ───────────────────────────────────────────────────────────────

const WO_KEY = "work-orders";

// ─── Work Order Hooks ─────────────────────────────────────────────────────────

export function useListWorkOrders(status?: string) {
  return useQuery<WorkOrder[]>({
    queryKey: [WO_KEY, "list", status],
    queryFn: () =>
      customFetch<WorkOrder[]>(`/api/work-orders${status && status !== "all" ? `?status=${status}` : ""}`),
  });
}

export function useGetWorkOrder(id: number | null) {
  return useQuery<WorkOrder>({
    queryKey: [WO_KEY, id],
    queryFn: () => customFetch<WorkOrder>(`/api/work-orders/${id}`),
    enabled: id != null,
  });
}

export function useWorkOrderStats() {
  return useQuery<WorkOrderStats>({
    queryKey: [WO_KEY, "stats"],
    queryFn: () => customFetch<WorkOrderStats>("/api/work-orders-stats"),
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkOrderInput) =>
      customFetch<WorkOrder>("/api/work-orders", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WO_KEY] }),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateWorkOrderInput & { id: number }) =>
      customFetch<WorkOrder>(`/api/work-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [WO_KEY] });
    },
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/work-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WO_KEY] }),
  });
}

// ─── Photos (FSM proof-of-work) ──────────────────────────────────────────────

export interface WorkOrderPhoto {
  id: number;
  workOrderId: number;
  staffId: number | null;
  staffName: string | null;
  data: string; // image data URL
  caption: string | null;
  createdAt: string;
}

export function useWorkOrderPhotos(workOrderId: number | null) {
  return useQuery<WorkOrderPhoto[]>({
    queryKey: [WO_KEY, workOrderId, "photos"],
    queryFn: () => customFetch<WorkOrderPhoto[]>(`/api/work-orders/${workOrderId}/photos`),
    enabled: workOrderId != null,
  });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function useWorkOrderNotes(workOrderId: number | null) {
  return useQuery<WorkOrderNote[]>({
    queryKey: [WO_KEY, workOrderId, "notes"],
    queryFn: () => customFetch<WorkOrderNote[]>(`/api/work-orders/${workOrderId}/notes`),
    enabled: workOrderId != null,
  });
}

export function useAddWorkOrderNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      content,
      isInternal,
    }: {
      workOrderId: number;
      content: string;
      isInternal?: boolean;
    }) =>
      customFetch<WorkOrderNote>(`/api/work-orders/${workOrderId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content, isInternal: isInternal ?? true }),
      }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: [WO_KEY, vars.workOrderId, "notes"] }),
  });
}

export function useDeleteWorkOrderNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workOrderId, noteId }: { workOrderId: number; noteId: number }) =>
      customFetch<void>(`/api/work-orders/${workOrderId}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: [WO_KEY, vars.workOrderId, "notes"] }),
  });
}

// ─── Status History ───────────────────────────────────────────────────────────

export function useWorkOrderHistory(workOrderId: number | null) {
  return useQuery<WorkOrderStatusHistoryEntry[]>({
    queryKey: [WO_KEY, workOrderId, "history"],
    queryFn: () =>
      customFetch<WorkOrderStatusHistoryEntry[]>(`/api/work-orders/${workOrderId}/history`),
    enabled: workOrderId != null,
  });
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export function useWorkOrderAppointments(workOrderId: number | null) {
  return useQuery<WorkOrderAppointment[]>({
    queryKey: [WO_KEY, workOrderId, "appointments"],
    queryFn: () =>
      customFetch<WorkOrderAppointment[]>(`/api/work-orders/${workOrderId}/appointments`),
    enabled: workOrderId != null,
  });
}

export function useCreateWorkOrderAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      ...data
    }: {
      workOrderId: number;
      appointmentType?: string;
      staffId?: number;
      startTime: string;
      endTime?: string;
      notes?: string;
    }) =>
      customFetch<WorkOrderAppointment>(`/api/work-orders/${workOrderId}/appointments`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: [WO_KEY, vars.workOrderId, "appointments"] }),
  });
}

export function useUpdateWorkOrderAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      appointmentId,
      ...data
    }: {
      workOrderId: number;
      appointmentId: number;
      status?: string;
      staffId?: number | null;
      startTime?: string;
      endTime?: string | null;
      notes?: string | null;
    }) =>
      customFetch<WorkOrderAppointment>(
        `/api/work-orders/${workOrderId}/appointments/${appointmentId}`,
        { method: "PATCH", body: JSON.stringify(data) },
      ),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: [WO_KEY, vars.workOrderId, "appointments"] }),
  });
}

export function useDeleteWorkOrderAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      appointmentId,
    }: {
      workOrderId: number;
      appointmentId: number;
    }) =>
      customFetch<void>(`/api/work-orders/${workOrderId}/appointments/${appointmentId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: [WO_KEY, vars.workOrderId, "appointments"] }),
  });
}

// ─── Calendar (aggregated across all work orders) ─────────────────────────────

export function useWorkOrderCalendar(start: string, end: string) {
  return useQuery<WorkOrderCalendarEntry[]>({
    queryKey: [WO_KEY, "calendar", start, end],
    queryFn: () =>
      customFetch<WorkOrderCalendarEntry[]>(
        `/api/work-order-appointments?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      ),
    enabled: !!start && !!end,
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function useWorkOrderReports() {
  return useQuery<WorkOrderReports>({
    queryKey: [WO_KEY, "reports"],
    queryFn: () => customFetch<WorkOrderReports>("/api/work-orders-reports"),
  });
}

// ─── Public portal (no auth header) ──────────────────────────────────────────

export function usePublicWorkOrder(id: number | null, token: string | null) {
  return useQuery<PublicWorkOrder>({
    queryKey: ["public-wo", id, token],
    queryFn: async () => {
      const res = await fetch(`/api/public/work-orders/${id}/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Not found");
      }
      return res.json() as Promise<PublicWorkOrder>;
    },
    enabled: id != null && !!token,
    retry: false,
  });
}
