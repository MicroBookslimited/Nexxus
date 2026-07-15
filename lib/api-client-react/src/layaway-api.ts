import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LayawayItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  isTaxable?: boolean;
  isCustom?: boolean;
  unitLabel?: string;
  unitFactor?: number;
};

export type LayawayPayment = {
  id: number;
  tenantId: number;
  layawayId: number;
  amount: number;
  method: "cash" | "card" | "other";
  reference: string | null;
  staffName: string | null;
  kind: "deposit" | "payment" | "refund";
  createdAt: string;
};

export type Layaway = {
  id: number;
  tenantId: number;
  layawayNumber: string;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  items: LayawayItem[];
  subtotal: number;
  discountType: string | null;
  discountAmount: number | null;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  depositRequired: number;
  planType: "flexible" | "installment";
  installmentAmount: number | null;
  installmentFrequency: "weekly" | "biweekly" | "monthly" | null;
  nextDueDate: string | null;
  status: "active" | "completed" | "cancelled" | "defaulted";
  cancellationFee: number | null;
  notes: string | null;
  convertedOrderId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LayawayDetail = Layaway & { payments: LayawayPayment[] };

export type CreateLayawayInput = {
  customerId: number;
  items: LayawayItem[];
  discountType?: "percent" | "fixed";
  discountAmount?: number;
  depositAmount: number;
  depositMethod?: "cash" | "card" | "other";
  planType?: "flexible" | "installment";
  installmentAmount?: number;
  installmentFrequency?: "weekly" | "biweekly" | "monthly";
  firstDueDate?: string;
  notes?: string;
  staffId?: number;
  staffName?: string;
};

export type AddLayawayPaymentInput = {
  amount: number;
  method?: "cash" | "card" | "other";
  reference?: string;
  staffId?: number;
  staffName?: string;
};

export type CancelLayawayInput = {
  cancellationFee?: number;
  reason?: string;
  markDefaulted?: boolean;
  staffId?: number;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const LAYAWAYS_KEY = "layaways";

export function useListLayaways() {
  return useQuery<Layaway[]>({
    queryKey: [LAYAWAYS_KEY],
    queryFn: () => customFetch<Layaway[]>("/api/layaways"),
  });
}

export function useGetLayaway(id: number | null) {
  return useQuery<LayawayDetail>({
    queryKey: [LAYAWAYS_KEY, id],
    queryFn: () => customFetch<LayawayDetail>(`/api/layaways/${id}`),
    enabled: id != null,
  });
}

export function useCreateLayaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLayawayInput) =>
      customFetch<Layaway>("/api/layaways", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LAYAWAYS_KEY] }),
  });
}

export function useAddLayawayPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: AddLayawayPaymentInput & { id: number }) =>
      customFetch<Layaway>(`/api/layaways/${id}/payments`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LAYAWAYS_KEY] }),
  });
}

export function useCancelLayaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: CancelLayawayInput & { id: number }) =>
      customFetch<Layaway>(`/api/layaways/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LAYAWAYS_KEY] }),
  });
}
