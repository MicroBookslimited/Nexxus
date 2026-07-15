import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkOrderItem = {
  type: "part" | "labor";
  productId?: number;
  description: string;
  price: number;
  quantity: number;
  isTaxable?: boolean;
};

export type WorkOrderStatus = "received" | "in_progress" | "ready" | "collected" | "cancelled";

export type WorkOrder = {
  id: number;
  tenantId: number;
  workOrderNumber: string;
  customerId: number | null;
  customerName?: string;
  customerPhone?: string;
  contactName: string | null;
  contactPhone: string | null;
  itemDescription: string;
  problemDescription: string;
  diagnosis: string | null;
  assignedStaffId: number | null;
  assignedStaffName?: string;
  items: WorkOrderItem[];
  subtotal: number;
  discountType: string | null;
  discountAmount: number | null;
  tax: number;
  total: number;
  status: WorkOrderStatus;
  promisedDate: string | null;
  notes: string | null;
  convertedOrderId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkOrderInput = {
  customerId?: number;
  contactName?: string;
  contactPhone?: string;
  itemDescription: string;
  problemDescription: string;
  assignedStaffId?: number;
  items?: WorkOrderItem[];
  discountType?: "percent" | "fixed";
  discountAmount?: number;
  promisedDate?: string;
  notes?: string;
};

export type UpdateWorkOrderInput = Partial<Omit<CreateWorkOrderInput, "assignedStaffId" | "promisedDate">> & {
  status?: WorkOrderStatus;
  diagnosis?: string;
  assignedStaffId?: number | null;
  promisedDate?: string | null;
  convertedOrderId?: number;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const WORK_ORDERS_KEY = "work-orders";

export function useListWorkOrders() {
  return useQuery<WorkOrder[]>({
    queryKey: [WORK_ORDERS_KEY],
    queryFn: () => customFetch<WorkOrder[]>("/api/work-orders"),
  });
}

export function useGetWorkOrder(id: number | null) {
  return useQuery<WorkOrder>({
    queryKey: [WORK_ORDERS_KEY, id],
    queryFn: () => customFetch<WorkOrder>(`/api/work-orders/${id}`),
    enabled: id != null,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkOrderInput) =>
      customFetch<WorkOrder>("/api/work-orders", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] }),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/work-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] }),
  });
}
